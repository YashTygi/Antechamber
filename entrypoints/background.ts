import type {
  CachedClassification,
  CalibrateResponse,
  ChannelEntry,
  ChannelSample,
  ChannelsResponse,
  ScanClusterResponse,
  ClassifyBatchResponse,
  ClassifyItem,
  ClassifyResult,
  CorrectResponse,
  ExampleItem,
  Label,
  Message,
  OnboardingCommit,
  ScrapeSampleResponse,
  UserProfile,
  VideoSample,
} from '@/lib/types';
import { FLOOR_MIN, FLOOR_MAX, MAX_EXAMPLES, VIDEO_CACHE_MAX, EMBED_CACHE_MAX } from '@/lib/defaults';
import { bestSims, calibrateFloor, classifyVec, clamp, cosineSim, decideLabel, effectiveFloor, hashTitle } from '@/lib/classifier';
import { emptyChannel, tally, setManual, channelShortcut } from '@/lib/channels';
import { apiEnabled, fetchMeta, enrichText } from '@/lib/youtube-api';
import { idbGet, idbGetMany, idbSet, idbSetMany, idbDelMany, idbEntries, idbEvictLRU } from '@/lib/db';
import {
  profileItem,
  settingsItem,
  metaItem,
  tuningItem,
  getSettings,
  getTuning,
  bumpVectors,
  recordEvent,
  pushRecent,
  getRecentItems,
} from '@/lib/storage';

export default defineBackground(() => {
  console.log('[Antechamber] background alive');

  /* ------------------------ model (offscreen) ------------------------- */

  // The WASM embedding model CANNOT run in an MV3 service worker: onnxruntime-web
  // loads its WASM glue via dynamic import(), which the HTML spec forbids in a
  // ServiceWorkerGlobalScope. So the model lives in an offscreen document
  // (entrypoints/offscreen) and we drive it by message. Everything else —
  // caching, classification math, channels, IDB — stays here.

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  /** Wait until the offscreen page's onMessage listener is actually live. */
  async function pingOffscreen(): Promise<void> {
    for (let i = 0; i < 50; i++) {
      try {
        const r = (await browser.runtime.sendMessage({ target: 'offscreen', type: 'ping' })) as
          | { ok?: boolean }
          | undefined;
        if (r?.ok) return;
      } catch {
        /* not registered yet — createDocument can resolve before the script runs */
      }
      await sleep(100);
    }
    throw new Error('offscreen document did not become ready');
  }

  let offscreenReady: Promise<void> | null = null;
  function ensureOffscreen(): Promise<void> {
    if (offscreenReady) return offscreenReady;
    offscreenReady = (async () => {
      // The offscreen doc outlives the SW, so after a SW restart it may already
      // exist — hasDocument() guards the "single offscreen document" error.
      if (!(await browser.offscreen.hasDocument())) {
        await browser.offscreen.createDocument({
          url: 'offscreen.html',
          reasons: ['WORKERS'],
          justification: 'Run the on-device embedding model (WebAssembly) to classify YouTube videos.',
        });
      }
      // createDocument resolves before the page's listener is guaranteed live.
      await pingOffscreen();
    })().catch((err: unknown) => {
      offscreenReady = null; // allow retry on next call
      throw err;
    });
    return offscreenReady;
  }

  type EmbedResponse = { ok: true; vectors: number[][] } | { ok: false; error: string } | undefined;

  // Generous — the very first embed includes a one-time ~20MB model download.
  const EMBED_TIMEOUT_MS = 120_000;
  function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
      p.then(
        (v) => { clearTimeout(t); resolve(v); },
        (e) => { clearTimeout(t); reject(e); },
      );
    });
  }

  async function embedRaw(text: string): Promise<Float32Array> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await ensureOffscreen();
        const res = (await withTimeout(
          browser.runtime.sendMessage({ target: 'offscreen', type: 'embed', texts: [text] }),
          EMBED_TIMEOUT_MS,
          'offscreen embed',
        )) as EmbedResponse;
        if (res?.ok) return new Float32Array(res.vectors[0]);
        // Model-side error: the offscreen already reset its embedder, so a retry
        // re-attempts the model load without recreating the document.
        lastErr = new Error(`offscreen embed failed: ${res && res.ok === false ? res.error : 'no response'}`);
      } catch (err) {
        // Channel dead (Chrome tore down the offscreen doc) or a hard timeout:
        // force the doc to be recreated on the next attempt.
        lastErr = err;
        offscreenReady = null;
        if (String((err as Error)?.message ?? '').includes('timed out')) break; // don't re-wait a full timeout
      }
    }
    console.error('[Antechamber] embed failed after retry:', lastErr);
    throw lastErr instanceof Error ? lastErr : new Error('offscreen embed failed');
  }
  /** Embed with an IndexedDB cache keyed by text hash — never re-embed the same text. */
  async function embedCached(text: string): Promise<Float32Array> {
    const h = hashTitle(text);
    const hit = await idbGet<{ vec: Float32Array | number[] }>('embeddings', h);
    if (hit?.vec) return hit.vec instanceof Float32Array ? hit.vec : new Float32Array(hit.vec);
    const vec = await embedRaw(text);
    void idbSet('embeddings', h, { vec, t: Date.now() })
      .then(() => idbEvictLRU('embeddings', EMBED_CACHE_MAX))
      .catch(() => {});
    return vec;
  }

  /* ---------------------- profile → example vectors ------------------- */

  const vectors = { pVecs: [] as Float32Array[], uVecs: [] as Float32Array[], builtAt: -1 };
  let building: { promise: Promise<void>; target: number } | null = null;
  const memVideo = new Map<string, CachedClassification>();

  async function ensureVectors() {
    const target = (await metaItem.getValue()).vectorsBuiltAt;
    if (vectors.builtAt === target) return;
    if (building && building.target === target) return building.promise;
    const promise = (async () => {
      const profile = await profileItem.getValue();
      if (!profile) {
        vectors.pVecs = [];
        vectors.uVecs = [];
      } else {
        vectors.pVecs = await Promise.all(profile.productiveExamples.map((e) => embedCached(e.text)));
        vectors.uVecs = await Promise.all(profile.unproductiveExamples.map((e) => embedCached(e.text)));
      }
      vectors.builtAt = target;
      memVideo.clear();
    })();
    building = { promise, target };
    try {
      await promise;
    } finally {
      if (building?.target === target) building = null;
    }
  }

  /* ----------------------------- channels ----------------------------- */

  const channelMap = new Map<string, ChannelEntry>();
  let channelsLoaded = false;
  const dirtyChannels = new Set<string>();
  let channelTimer: ReturnType<typeof setTimeout> | undefined;

  async function loadChannels() {
    if (channelsLoaded) return;
    const entries = await idbEntries<ChannelEntry>('channels');
    for (const { value } of entries) if (value?.key) channelMap.set(value.key, value);
    channelsLoaded = true;
  }
  function getChannel(key: string, name: string): ChannelEntry {
    let ch = channelMap.get(key);
    if (!ch) {
      ch = emptyChannel(key, name || key);
      channelMap.set(key, ch);
    } else if (name && (ch.name === key || !ch.name)) {
      ch.name = name;
    }
    return ch;
  }
  async function flushChannels() {
    const keys = [...dirtyChannels];
    dirtyChannels.clear();
    const entries = keys
      .map((k) => [k, channelMap.get(k)] as [string, ChannelEntry | undefined])
      .filter((e): e is [string, ChannelEntry] => !!e[1]);
    if (entries.length) await idbSetMany('channels', entries);
  }
  function persistChannelSoon(key: string) {
    dirtyChannels.add(key);
    clearTimeout(channelTimer);
    channelTimer = setTimeout(() => void flushChannels(), 1500);
  }

  /* --------------------------- classification ------------------------- */

  async function classifyItems(items: ClassifyItem[]): Promise<ClassifyBatchResponse> {
    await ensureVectors();
    await loadChannels();
    const settings = await getSettings();
    const tuning = await getTuning();
    const floor = effectiveFloor(tuning, settings.sensitivity);
    const band = tuning.marginBand;
    const builtAt = vectors.builtAt;
    const hasExamples = vectors.pVecs.length > 0 || vectors.uVecs.length > 0;
    const apiKey = settings.youtubeApiKey;

    const results: Record<string, ClassifyResult> = {};
    const toWrite: [string, CachedClassification][] = [];
    const needEmbed: ClassifyItem[] = [];

    // hydrate in-memory cache from IndexedDB for anything we haven't seen
    const missIds = items.map((i) => i.videoId).filter((id) => !memVideo.has(id));
    if (missIds.length) {
      const stored = await idbGetMany<CachedClassification>('videoCache', missIds);
      missIds.forEach((id, i) => {
        const e = stored[i];
        if (e) memVideo.set(id, e);
      });
    }

    for (const it of items) {
      const th = hashTitle(it.title);
      const c = memVideo.get(it.videoId);
      // sticky user override always wins (even over a channel label)
      if (c && (c.source === 'user' || (c.vectorsBuiltAt >= builtAt && c.titleHash === th))) {
        results[it.videoId] = { label: c.label, pSim: c.pSim, uSim: c.uSim };
        continue;
      }
      // channel shortcut → skip embedding entirely
      const sc = it.channelKey ? channelShortcut(channelMap.get(it.channelKey)) : null;
      if (sc) {
        const entry: CachedClassification = {
          label: sc, pSim: 0, uSim: 0, titleHash: th, vectorsBuiltAt: builtAt,
          classifiedAt: Date.now(), channelKey: it.channelKey, source: 'channel', t: Date.now(),
        };
        memVideo.set(it.videoId, entry);
        toWrite.push([it.videoId, entry]);
        results[it.videoId] = { label: sc, pSim: 0, uSim: 0 };
        continue;
      }
      if (!hasExamples) {
        results[it.videoId] = { label: 'neutral', pSim: 0, uSim: 0 };
        continue;
      }
      needEmbed.push(it);
    }

    if (needEmbed.length) {
      let meta = new Map<string, import('@/lib/types').ApiMeta>();
      if (apiEnabled(apiKey)) {
        try {
          meta = await fetchMeta(needEmbed.map((i) => i.videoId), apiKey);
        } catch {
          /* fall back to local */
        }
      }
      for (const it of needEmbed) {
        const th = hashTitle(it.title);
        const vec = await embedCached(enrichText(it.title, meta.get(it.videoId)));
        const r = classifyVec(vec, vectors.pVecs, vectors.uVecs, floor, band);
        const entry: CachedClassification = {
          ...r, titleHash: th, vectorsBuiltAt: builtAt, classifiedAt: Date.now(),
          channelKey: it.channelKey ?? null, source: 'content', t: Date.now(),
        };
        memVideo.set(it.videoId, entry);
        toWrite.push([it.videoId, entry]);
        results[it.videoId] = r;
        // our analysis contributes to the channel's tally (may auto-label it)
        if (it.channelKey) {
          channelMap.set(it.channelKey, tally(getChannel(it.channelKey, it.channelName ?? ''), r.label));
          persistChannelSoon(it.channelKey);
        }
      }
    }

    if (toWrite.length) {
      void idbSetMany('videoCache', toWrite)
        .then(() => idbEvictLRU('videoCache', VIDEO_CACHE_MAX))
        .catch(() => {});
    }
    if (memVideo.size > 12000) memVideo.clear();

    // log the videos the user actually opened for the Today "Recent" list
    for (const it of items) {
      if (it.context === 'watch' && results[it.videoId]) {
        void pushRecent({
          videoId: it.videoId,
          title: it.title,
          label: results[it.videoId].label,
          channel: it.channelName ?? null,
          t: Date.now(),
        });
      }
    }
    return { results };
  }

  /* --------------------------- calibration ---------------------------- */

  async function calibrate(productive: string[], unproductive: string[], sampleTitles: string[]): Promise<CalibrateResponse> {
    const pV = await Promise.all(productive.map(embedCached));
    const uV = await Promise.all(unproductive.map(embedCached));
    const scored = await Promise.all(
      sampleTitles.map(async (title) => {
        const { pSim, uSim } = bestSims(await embedCached(title), pV, uV);
        return { title, pSim, uSim };
      }),
    );
    const simFloor = calibrateFloor(scored.map((s) => Math.max(s.pSim, s.uSim)));
    const marginBand = 0.08;
    const tuning = { simFloor, marginBand, calibratedAt: Date.now() };
    await tuningItem.setValue(tuning);

    const counts = { productive: 0, unproductive: 0, neutral: 0 };
    const preview = scored.map(({ title, pSim, uSim }) => {
      const label = decideLabel(pSim, uSim, simFloor, marginBand);
      counts[label]++;
      return { title, label };
    });
    return { tuning, counts, preview };
  }

  /**
   * Full recalibration owned entirely by the SW: scan the homepage, embed +
   * pick a new floor, bump vectors. Done here (not in the popup) because
   * scanHomepage focuses a YouTube tab, which destroys the popup mid-flight —
   * if the popup drove this, calibrate() would never even be sent.
   */
  async function recalibrate(): Promise<CalibrateResponse | null> {
    const profile = await profileItem.getValue();
    if (!profile) return null;
    const scan = await scanHomepage();
    const res = await calibrate(
      profile.productiveExamples.map((e) => e.text),
      profile.unproductiveExamples.map((e) => e.text),
      scan.samples.map((s) => s.title),
    );
    await bumpVectors();
    return res;
  }

  /* ------------------------- corrections (learning) ------------------- */

  function addExample(list: ExampleItem[], text: string, videoId: string): ExampleItem[] {
    let next = list;
    if (!list.some((e) => e.text.toLowerCase() === text.toLowerCase())) {
      next = [...list, { id: crypto.randomUUID(), text, source: 'correction', fromVideoId: videoId, createdAt: Date.now() }];
    }
    while (next.length > MAX_EXAMPLES) {
      const idx = next.findIndex((e) => e.source === 'correction');
      next = next.filter((_, i) => i !== (idx >= 0 ? idx : 0));
    }
    return next;
  }
  function removeByVideo(list: ExampleItem[], videoId: string, title: string): ExampleItem[] {
    return list.filter((e) => e.fromVideoId !== videoId && e.text.toLowerCase() !== title.toLowerCase());
  }

  async function correct(
    videoId: string,
    title: string,
    label: Label,
    channelKey?: string | null,
    channelName?: string | null,
  ): Promise<CorrectResponse> {
    await ensureVectors();
    await loadChannels();
    const profile = await profileItem.getValue();
    if (!profile) return { label: 'neutral' };
    const settings = await getSettings();
    const tuning = await getTuning();
    const floor = effectiveFloor(tuning, settings.sensitivity);

    let pSim = 0;
    let uSim = 0;
    if (vectors.pVecs.length || vectors.uVecs.length) {
      ({ pSim, uSim } = bestSims(await embedCached(title), vectors.pVecs, vectors.uVecs));
    }

    const next: UserProfile = { ...profile, updatedAt: Date.now() };
    if (label === 'productive') {
      next.productiveExamples = addExample(profile.productiveExamples, title, videoId);
      next.unproductiveExamples = removeByVideo(profile.unproductiveExamples, videoId, title);
    } else if (label === 'unproductive') {
      next.unproductiveExamples = addExample(profile.unproductiveExamples, title, videoId);
      next.productiveExamples = removeByVideo(profile.productiveExamples, videoId, title);
    } else {
      next.productiveExamples = removeByVideo(profile.productiveExamples, videoId, title);
      next.unproductiveExamples = removeByVideo(profile.unproductiveExamples, videoId, title);
    }

    const nextTuning = { ...tuning, calibratedAt: Date.now() };
    if (label !== 'neutral') {
      const best = Math.max(pSim, uSim);
      if (best < floor) nextTuning.simFloor = clamp(tuning.simFloor - 0.02, FLOOR_MIN, FLOOR_MAX);
      else if (Math.abs(pSim - uSim) < tuning.marginBand) nextTuning.marginBand = clamp(tuning.marginBand - 0.01, 0.02, 0.15);
    }

    if (channelKey) {
      channelMap.set(channelKey, tally(getChannel(channelKey, channelName ?? ''), label));
      persistChannelSoon(channelKey);
    }

    if (label === 'neutral') {
      memVideo.delete(videoId);
      await idbDelMany('videoCache', [videoId]);
    } else {
      const entry: CachedClassification = {
        label, pSim: 0, uSim: 0, titleHash: hashTitle(title), vectorsBuiltAt: Date.now(),
        classifiedAt: Date.now(), channelKey: channelKey ?? null, source: 'user', t: Date.now(),
      };
      memVideo.set(videoId, entry);
      await idbSet('videoCache', videoId, entry);
    }

    await profileItem.setValue(next);
    await tuningItem.setValue(nextTuning);
    await flushChannels();
    await bumpVectors();
    void pushRecent({ videoId, title, label, channel: channelName ?? null, t: Date.now() });
    return { label };
  }

  /* ------------------------- onboarding commit ------------------------ */

  async function commitOnboarding(c: OnboardingCommit): Promise<{ ok: true }> {
    await loadChannels();
    await settingsItem.setValue(c.settings);
    await profileItem.setValue(c.profile);

    for (const r of c.channelRatings) {
      channelMap.set(r.key, setManual(getChannel(r.key, r.name), r.label));
      dirtyChannels.add(r.key);
    }
    const overrides: [string, CachedClassification][] = [];
    for (const v of c.videoRatings) {
      if (v.channelKey) {
        channelMap.set(v.channelKey, tally(getChannel(v.channelKey, v.channelName ?? ''), v.label));
        dirtyChannels.add(v.channelKey);
      }
      overrides.push([
        v.videoId,
        {
          label: v.label, pSim: 0, uSim: 0, titleHash: hashTitle(v.title), vectorsBuiltAt: Date.now(),
          classifiedAt: Date.now(), channelKey: v.channelKey, source: 'user', t: Date.now(),
        },
      ]);
    }
    await flushChannels();
    if (overrides.length) await idbSetMany('videoCache', overrides);
    await bumpVectors();
    return { ok: true };
  }

  /* ----------------------------- channels API ------------------------- */

  async function getChannels(): Promise<ChannelsResponse> {
    await loadChannels();
    const channels = [...channelMap.values()].sort((a, b) => {
      const la = a.label ? 0 : 1;
      const lb = b.label ? 0 : 1;
      return la - lb || (b.updatedAt - a.updatedAt);
    });
    return { channels };
  }
  async function setChannelLabel(key: string, name: string, label: Label | null): Promise<{ ok: true }> {
    await loadChannels();
    const ch = setManual(getChannel(key, name), label);
    channelMap.set(key, ch);
    await idbSet('channels', key, ch);
    await bumpVectors();
    return { ok: true };
  }

  /* ----------------- homepage scan (for calibration) ------------------ */

  async function pollSamples(tabId: number, ms: number, target: number, seed: VideoSample[] = []): Promise<VideoSample[]> {
    const deadline = Date.now() + ms;
    // Union by videoId across polls: each scrape scrolls the feed and may load
    // new cards (and drop old ones via virtualization), so we accumulate.
    const byId = new Map<string, VideoSample>(seed.map((s) => [s.videoId, s]));
    while (Date.now() < deadline) {
      await sleep(700);
      try {
        const res = (await browser.tabs.sendMessage(tabId, { type: 'scrapeSample' })) as ScrapeSampleResponse;
        for (const s of res?.samples ?? []) if (!byId.has(s.videoId)) byId.set(s.videoId, s);
        if (byId.size >= target) break;
      } catch {
        /* content script not ready yet */
      }
    }
    return [...byId.values()];
  }

  /**
   * Read the user's REAL homepage. A background/inactive tab is throttled and
   * often never renders the lazy-loaded feed, so we reuse an already-open
   * homepage tab if we can, and otherwise open one and FOCUS it so YouTube
   * actually renders — then restore focus to the onboarding tab.
   */
  async function scanHomepage(target = 15): Promise<ScrapeSampleResponse> {
    let restoreTabId: number | undefined;
    let createdTabId: number | undefined;
    let targetTabId: number | undefined;
    try {
      const [activeTab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
      restoreTabId = activeTab?.id ?? undefined; // the onboarding tab — refocus it after

      const yt = await browser.tabs.query({ url: '*://*.youtube.com/*' });
      const home = yt.find((t) => {
        try {
          return new URL(t.url || '').pathname === '/';
        } catch {
          return false;
        }
      });
      if (home?.id != null) {
        targetTabId = home.id;
      } else {
        const tab = await browser.tabs.create({ url: 'https://www.youtube.com/', active: true });
        targetTabId = tab.id ?? undefined;
        createdTabId = targetTabId;
      }
      if (targetTabId == null) return { samples: [] };

      // phase 1: try quietly — works if an existing homepage tab is already rendered
      let best = await pollSamples(targetTabId, 4000, Math.min(target, 12));
      // phase 2: not enough → focus the tab so the feed renders + scrolls, then
      // keep polling (longer window for a larger target, e.g. onboarding's ~50).
      if (best.length < target) {
        try {
          await browser.tabs.update(targetTabId, { active: true });
        } catch {
          /* ignore */
        }
        best = await pollSamples(targetTabId, target > 20 ? 25000 : 18000, target, best);
      }
      return { samples: best };
    } catch {
      return { samples: [] };
    } finally {
      // bring the user back to onboarding, then clean up a tab we opened
      if (restoreTabId != null && restoreTabId !== createdTabId) {
        try {
          await browser.tabs.update(restoreTabId, { active: true });
        } catch {
          /* ignore */
        }
      }
      if (createdTabId != null) {
        try {
          await browser.tabs.remove(createdTabId);
        } catch {
          /* already gone */
        }
      }
    }
  }

  /* ----------------- onboarding: scan + topic clustering -------------- */

  function unitNormalize(v: Float32Array): Float32Array {
    let n = 0;
    for (const x of v) n += x * x;
    n = Math.sqrt(n) || 1;
    const out = new Float32Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = v[i] / n;
    return out;
  }

  /**
   * Group sampled videos into topic clusters by title embedding, then pick a
   * diverse subset (so 20 DSA videos don't crowd out the one economics video).
   * Greedy single-pass clustering: 1 representative from EVERY cluster first
   * (coverage of every kind), then a 2nd from the largest clusters up to `cap`.
   */
  async function clusterPick(samples: VideoSample[], perCluster = 2, cap = 16): Promise<VideoSample[]> {
    if (samples.length <= perCluster + 1) return samples;
    const vecs = await Promise.all(samples.map((s) => embedCached(s.title)));
    const SIM = 0.5; // titles within one topic tend to score ≥ ~0.5 against each other
    type Cluster = { sum: Float32Array; centroid: Float32Array; members: number[] };
    const clusters: Cluster[] = [];
    for (let i = 0; i < samples.length; i++) {
      let best = -1;
      let bestSim = -1;
      for (let c = 0; c < clusters.length; c++) {
        const s = cosineSim(vecs[i], clusters[c].centroid);
        if (s > bestSim) { bestSim = s; best = c; }
      }
      if (best >= 0 && bestSim >= SIM) {
        const cl = clusters[best];
        cl.members.push(i);
        for (let k = 0; k < cl.sum.length; k++) cl.sum[k] += vecs[i][k];
        cl.centroid = unitNormalize(cl.sum);
      } else {
        const sum = Float32Array.from(vecs[i]);
        clusters.push({ sum, centroid: unitNormalize(sum), members: [i] });
      }
    }
    clusters.sort((a, b) => b.members.length - a.members.length);
    // members of a cluster, most central first
    const central = (cl: Cluster) =>
      cl.members.slice().sort((x, y) => cosineSim(vecs[y], cl.centroid) - cosineSim(vecs[x], cl.centroid));

    const picked: number[] = [];
    const seen = new Set<number>();
    const take = (i: number | undefined) => {
      if (i != null && !seen.has(i) && picked.length < cap) { seen.add(i); picked.push(i); }
    };
    for (const cl of clusters) take(central(cl)[0]); // round 1: one per cluster
    if (perCluster >= 2) for (const cl of clusters) take(central(cl)[1]); // round 2: a second from big ones
    return picked.map((i) => samples[i]);
  }

  /** Homepage scan → diverse videos to rate + channels seen + all titles. */
  async function scanCluster(): Promise<ScanClusterResponse> {
    const { samples } = await scanHomepage(50);
    const videos = await clusterPick(samples, 2, 16);

    const cmap = new Map<string, ChannelSample>();
    for (const s of samples) {
      if (!s.channelKey) continue;
      const c = cmap.get(s.channelKey) ?? { key: s.channelKey, name: s.channel ?? s.channelKey, thumb: null, count: 0 };
      c.count++;
      if ((!c.name || c.name === c.key) && s.channel) c.name = s.channel;
      if (!c.thumb && s.channelThumb) c.thumb = s.channelThumb;
      cmap.set(s.channelKey, c);
    }
    const channels = [...cmap.values()].sort((a, b) => b.count - a.count).slice(0, 12);
    return { videos, channels, sampleTitles: samples.map((s) => s.title) };
  }

  /* --------------------- reload open YouTube tabs --------------------- */

  let reloadTimer: ReturnType<typeof setTimeout> | undefined;
  function scheduleReload() {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(async () => {
      try {
        const tabs = await browser.tabs.query({ url: '*://*.youtube.com/*' });
        for (const t of tabs) if (t.id != null) void browser.tabs.reload(t.id);
      } catch {
        /* no host permission / no tabs */
      }
    }, 350);
  }

  /* --------------------------- watchers ------------------------------- */

  metaItem.watch(() => memVideo.clear());
  profileItem.watch((nv, ov) => {
    memVideo.clear();
    if (!!nv !== !!ov) scheduleReload();
  });
  settingsItem.watch(() => scheduleReload());

  /* --------------------------- install -------------------------------- */

  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      browser.tabs.create({ url: browser.runtime.getURL('/onboarding.html') }).catch(() => {});
    }
  });

  /* ------------------------------ router ------------------------------ */

  browser.runtime.onMessage.addListener(async (msg: Message) => {
    if (msg?.type === 'classifyBatch') return classifyItems(msg.items);
    if (msg?.type === 'recordEvent') return recordEvent(msg.event);
    if (msg?.type === 'scanCluster') return scanCluster();
    if (msg?.type === 'calibrate') return calibrate(msg.productive, msg.unproductive, msg.sampleTitles);
    if (msg?.type === 'recalibrate') return recalibrate();
    if (msg?.type === 'correct') return correct(msg.videoId, msg.title, msg.label, msg.channelKey, msg.channelName);
    if (msg?.type === 'getChannels') return getChannels();
    if (msg?.type === 'setChannelLabel') return setChannelLabel(msg.key, msg.name, msg.label);
    if (msg?.type === 'getRecent') return { items: await getRecentItems() };
    if (msg?.type === 'commitOnboarding') return commitOnboarding(msg.commit);
  });

  void ensureVectors().catch(() => {});
});
