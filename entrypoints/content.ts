import type {
  Label,
  Settings,
  Message,
  VideoSample,
  ClassifyBatchResponse,
  RecordEventResponse,
  GameEventType,
} from '@/lib/types';
import { getSettings, profileItem, settingsItem, metaItem } from '@/lib/storage';
import {
  CARD_SELECTOR,
  SHORTS_SELECTORS,
  detectSurface,
  extractCard,
  getThumbAnchor,
  getWatchVideo,
  getPlayer,
} from '@/lib/youtube';
import { CONTENT_CSS } from '@/lib/content-css';
import { icon } from '@/lib/glyphs';

export default defineContentScript({
  matches: ['*://*.youtube.com/*'],
  main() {
    const SEEN = 'data-yti-seen';
    const LABEL = 'data-yti-label';
    const LABEL_SEL = `[${LABEL}]`;
    const SEEN_SEL = `[${SEEN}]`;

    let settings: Settings | null = null;
    let active = false; // enabled AND a profile exists
    const scored = new Set<string>(); // videoIds already awarded this session

    /* ----------------------------- messaging ---------------------------- */

    async function classifyOne(
      videoId: string,
      title: string,
      channelKey?: string | null,
      channelName?: string | null,
    ): Promise<Label | null> {
      try {
        const res = (await browser.runtime.sendMessage({
          type: 'classifyBatch',
          items: [{ videoId, title, channelKey, channelName, context: 'watch' }],
        })) as ClassifyBatchResponse;
        return res?.results?.[videoId]?.label ?? null;
      } catch {
        return null;
      }
    }

    async function recordEvent(event: GameEventType, videoId?: string): Promise<RecordEventResponse | null> {
      try {
        return (await browser.runtime.sendMessage({ type: 'recordEvent', event, videoId })) as RecordEventResponse;
      } catch {
        return null;
      }
    }

    async function sendCorrection(
      videoId: string,
      title: string,
      label: Label,
      channelKey?: string | null,
      channelName?: string | null,
    ) {
      try {
        await browser.runtime.sendMessage({ type: 'correct', videoId, title, label, channelKey, channelName });
      } catch {
        /* ignore */
      }
      showToast(
        label === 'neutral'
          ? 'Cleared — relearning'
          : label === 'productive'
            ? 'Marked productive — learning'
            : 'Marked distraction — learning',
      );
    }

    /* ------------------- classification queue (batched) ----------------- */

    let queue: { videoId: string; title: string; channelKey: string | null; channelName: string | null; card: HTMLElement }[] =
      [];
    let flushTimer: number | undefined;

    function enqueue(item: { videoId: string; title: string; channelKey: string | null; channelName: string | null; card: HTMLElement }) {
      queue.push(item);
      clearTimeout(flushTimer);
      flushTimer = setTimeout(flush, 250) as unknown as number;
    }

    async function flush() {
      const batch = queue;
      queue = [];
      if (!batch.length) return;
      const items = batch.map(({ videoId, title, channelKey, channelName }) => ({ videoId, title, channelKey, channelName }));
      let res: ClassifyBatchResponse | undefined;
      try {
        res = (await browser.runtime.sendMessage({ type: 'classifyBatch', items })) as ClassifyBatchResponse;
      } catch {
        for (const { card } of batch) card.removeAttribute(SEEN); // let these retry
        return;
      }
      for (const { videoId, card } of batch) {
        const label = res?.results?.[videoId]?.label ?? 'neutral';
        card.setAttribute(LABEL, label);
        paintBadge(card);
      }
    }

    /* --------------------------- feed scanning -------------------------- */

    function scan() {
      if (!active) return;
      document.querySelectorAll<HTMLElement>(CARD_SELECTOR).forEach((card) => {
        if (card.hasAttribute(LABEL)) {
          paintBadge(card);
          return;
        }
        if (card.hasAttribute(SEEN)) return;
        card.setAttribute(SEEN, '1');
        const data = extractCard(card);
        if (!data) {
          card.removeAttribute(SEEN);
          return;
        }
        enqueue({ videoId: data.videoId, title: data.title, channelKey: data.channelKey, channelName: data.channel, card });
      });
      if (settings?.blockShorts) removeShorts();
    }

    function removeShorts() {
      for (const sel of SHORTS_SELECTORS) document.querySelectorAll(sel).forEach((el) => el.remove());
    }

    function collectSamples(): VideoSample[] {
      const seen = new Set<string>();
      const out: VideoSample[] = [];
      document.querySelectorAll<HTMLElement>(CARD_SELECTOR).forEach((card) => {
        const d = extractCard(card);
        if (d && !seen.has(d.videoId)) {
          seen.add(d.videoId);
          out.push({ videoId: d.videoId, title: d.title, channel: d.channel, channelKey: d.channelKey, channelThumb: d.channelThumb });
        }
      });
      return out.slice(0, 80);
    }

    /* ----------------------- badges (idempotent) ------------------------ */

    const BADGE_TEXT: Record<Label, string> = { productive: 'productive', unproductive: 'distraction', neutral: 'neutral' };

    function paintBadge(card: HTMLElement) {
      const label = card.getAttribute(LABEL) as Label | null;
      if (!label) return;
      // neutral is the common case — badging it would clutter every feed.
      if (!settings?.showBadges || label === 'neutral') {
        card.querySelector('.yti-badge')?.remove();
        return;
      }
      const anchor = getThumbAnchor(card);
      const existing = anchor.querySelector(':scope > .yti-badge') as HTMLElement | null;
      const state = `${label}|${settings.badgeStyle}`;
      if (existing && existing.dataset.state === state) return;

      const g = label === 'productive' ? icon('check') : icon('x');
      const badge = existing ?? document.createElement('div');
      badge.className = `yti-badge yti-${label}`;
      badge.dataset.state = state;
      badge.innerHTML = settings.badgeStyle === 'icon' ? g : `${g}<span>${BADGE_TEXT[label]}</span>`;
      if (!existing) {
        if (getComputedStyle(anchor).position === 'static') anchor.style.position = 'relative';
        anchor.appendChild(badge);
      }
    }

    /* -------------------------- watch-page logic ------------------------ */

    let currentWatch: string | null = null;
    let evalInFlight = false;
    let curVideo: {
      videoId: string;
      title: string;
      label: Label;
      channelKey: string | null;
      channelName: string | null;
    } | null = null;

    async function evalWatch() {
      if (!active || evalInFlight) return;
      if (detectSurface() !== 'watch') {
        dismissFriction();
        removeVerdict();
        currentWatch = null;
        curVideo = null;
        return;
      }
      const v = getWatchVideo();
      if (!v || currentWatch === v.videoId) return;

      evalInFlight = true;
      try {
        const label = await classifyOne(v.videoId, v.title, v.channelKey, v.channel);
        if (!label) return;
        const now = getWatchVideo();
        if (!now || now.videoId !== v.videoId || detectSurface() !== 'watch') return;

        curVideo = { videoId: v.videoId, title: v.title, label, channelKey: v.channelKey, channelName: v.channel };
        if (settings!.frictionOn.includes(label)) {
          removeVerdict();
          const shown = showFriction(v, label);
          if (!shown) {
            curVideo = null;
            return; // player not ready → retry
          }
          recordEvent('frictionShown', v.videoId);
        } else {
          if (label === 'productive') award('productiveOpened', v.videoId, 'Nice choice');
          else if (label === 'unproductive') recordEvent('unproductiveOpened', v.videoId);
          showVerdict();
        }
        currentWatch = v.videoId;
      } finally {
        evalInFlight = false;
      }
    }

    async function award(event: GameEventType, videoId: string, message: string) {
      if (scored.has(videoId)) return;
      scored.add(videoId);
      const res = await recordEvent(event, videoId);
      if (settings?.gamificationEnabled && res?.pointsDelta) showToast(message, res.pointsDelta);
    }

    /* --------------------------- friction overlay ----------------------- */

    let overlay: HTMLElement | null = null;
    let countdownTimer: number | undefined;
    let preMuted = false;

    function dismissFriction() {
      if (countdownTimer) clearInterval(countdownTimer);
      countdownTimer = undefined;
      overlay?.remove();
      overlay = null;
      // Restore muted state; never touch play/pause to avoid corrupting YouTube's player state
      const pl = getPlayer();
      if (pl) pl.video.muted = preMuted;
    }

    function showFriction(
      video: { videoId: string; title: string; channelKey?: string | null; channel?: string | null },
      label: Label,
    ): boolean {
      if (overlay) return true;
      const pl = getPlayer();
      if (!pl) return false;
      const { player, video: media } = pl;

      const reasonRequired = !!settings?.requireReason;
      const delay = settings?.delaySeconds ?? 5;
      let remaining: number = delay;

      overlay = document.createElement('div');
      overlay.className = 'yti-friction';
      overlay.innerHTML = `
        <div class="yti-friction-scrim"></div>
        <div class="yti-friction-card" role="alertdialog" aria-modal="true" aria-label="Take a moment" tabindex="-1">
          <div class="yti-friction-label">THRESHOLD</div>
          <div class="yti-friction-title">Is this worth your time?</div>
          <div class="yti-friction-video"></div>
          ${
            reasonRequired
              ? '<textarea class="yti-friction-reason" rows="2" placeholder="Why do you want to watch this?"></textarea>'
              : ''
          }
          <div class="yti-friction-actions">
            <button class="yti-fbtn yti-fbtn-back" data-act="back">${icon('arrowLeft')}Go back</button>
            <div class="yti-fbtn-watch-wrap">
              <button class="yti-fbtn-watch" data-act="watch" disabled><span>Watch anyway</span><span class="yti-watch-count">${remaining}</span></button>
              <div class="yti-depletion"><div class="yti-depletion-fill"></div></div>
            </div>
          </div>
          <button class="yti-friction-wrong" data-act="wrong">Marked wrong? It’s productive →</button>
        </div>`;

      (overlay.querySelector('.yti-friction-video') as HTMLElement).textContent =
        `“${video.title}”${video.channel ? ` · ${video.channel}` : ''}`;
      if (getComputedStyle(player).position === 'static') player.style.position = 'relative';
      player.appendChild(overlay);

      // Mute instead of pause — calling media.pause() directly bypasses YouTube's
      // player state machine and triggers the "Something went wrong" error. Muting
      // is sufficient friction without corrupting playback state.
      preMuted = media.muted;
      media.muted = true;

      const watchBtn = overlay.querySelector('[data-act="watch"]') as HTMLButtonElement;
      const backBtn = overlay.querySelector('[data-act="back"]') as HTMLButtonElement;
      const wrongBtn = overlay.querySelector('[data-act="wrong"]') as HTMLButtonElement;
      const countEl = overlay.querySelector('.yti-watch-count') as HTMLElement;
      const fillEl = overlay.querySelector('.yti-depletion-fill') as HTMLElement;
      const reasonEl = overlay.querySelector('.yti-friction-reason') as HTMLTextAreaElement | null;

      const refresh = () => {
        const reasonOk = !reasonRequired || (reasonEl?.value.trim().length ?? 0) >= 4;
        watchBtn.disabled = remaining > 0 || !reasonOk;
        countEl.textContent = remaining > 0 ? String(remaining) : '';
        fillEl.style.width = `${((delay - remaining) / delay) * 100}%`;
      };
      refresh();

      countdownTimer = setInterval(() => {
        remaining -= 1;
        if (remaining <= 0) {
          remaining = 0;
          if (countdownTimer) clearInterval(countdownTimer);
          countdownTimer = undefined;
        }
        refresh();
      }, 1000) as unknown as number;

      reasonEl?.addEventListener('input', refresh);

      backBtn.addEventListener('click', async () => {
        dismissFriction();
        const res = await recordEvent('backedOff', video.videoId);
        if (settings?.gamificationEnabled && res?.pointsDelta) showToast('Good call', res.pointsDelta);
        if (history.length > 1) history.back();
        else location.href = 'https://www.youtube.com/';
      });

      watchBtn.addEventListener('click', () => {
        if (watchBtn.disabled) return;
        dismissFriction(); // restores muted state; video is already playing
        recordEvent('watchedAnyway', video.videoId);
        showVerdict(); // let them re-label after they chose to watch
      });

      wrongBtn.addEventListener('click', () => {
        dismissFriction(); // restores muted state
        sendCorrection(video.videoId, video.title, 'productive', video.channelKey, video.channel);
      });

      // keyboard: Esc = the safe default (Go back); Tab cycles within the card
      overlay.addEventListener('keydown', (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          backBtn.click();
          return;
        }
        if (e.key === 'Tab') {
          const focusables = [reasonEl, backBtn, watchBtn, wrongBtn].filter(Boolean) as HTMLElement[];
          const idx = focusables.indexOf(document.activeElement as HTMLElement);
          let n = e.shiftKey ? idx - 1 : idx + 1;
          if (n < 0) n = focusables.length - 1;
          if (n >= focusables.length) n = 0;
          e.preventDefault();
          focusables[n]?.focus();
        }
      });
      (reasonEl ?? backBtn).focus();

      return true;
    }

    /* ---------------------- watch-page verdict chip --------------------- */

    let verdictEl: HTMLElement | null = null;

    function removeVerdict() {
      verdictEl?.remove();
      verdictEl = null;
    }

    function showVerdict() {
      removeVerdict();
      if (!active || !curVideo || overlay) return;
      const { label } = curVideo;
      const ask = label === 'neutral' && !!settings?.askOnNeutral;

      const optFor = (l: Label): string => {
        if (l === 'productive') return `<button class="yti-v-opt good" data-l="productive">${icon('check', 14)}Productive</button>`;
        if (l === 'unproductive') return `<button class="yti-v-opt bad" data-l="unproductive">${icon('x', 14)}Distraction</button>`;
        return `<button class="yti-v-opt" data-l="neutral">Clear</button>`;
      };
      const optList: Label[] =
        label === 'productive'
          ? ['unproductive', 'neutral']
          : label === 'unproductive'
            ? ['productive', 'neutral']
            : ['productive', 'unproductive'];

      const el = document.createElement('div');
      el.id = 'yti-verdict';
      el.className = `yti-verdict yti-v-${label}`;
      el.innerHTML = `
        <div class="yti-v-main">
          <span class="yti-v-dot"></span>
          <span class="yti-v-text"></span>
          ${ask ? '' : '<button class="yti-v-change" data-act="toggle">change</button>'}
          <button class="yti-v-x" data-act="dismiss" aria-label="dismiss">×</button>
        </div>
        <div class="yti-v-opts"${ask ? '' : ' hidden'}>
          ${optList.map(optFor).join('')}
        </div>`;

      (el.querySelector('.yti-v-text') as HTMLElement).textContent = ask
        ? 'Is this productive or a distraction?'
        : label === 'productive'
          ? 'Productive'
          : label === 'unproductive'
            ? 'Distraction'
            : 'Not sure about this one';

      el.addEventListener('click', (e) => {
        const btn = (e.target as HTMLElement).closest('[data-act],[data-l]') as HTMLElement | null;
        if (!btn) return;
        const act = btn.getAttribute('data-act');
        const l = btn.getAttribute('data-l') as Label | null;
        if (act === 'dismiss') return removeVerdict();
        if (act === 'toggle') {
          const o = el.querySelector('.yti-v-opts') as HTMLElement;
          o.hidden = !o.hidden;
          return;
        }
        if (l && curVideo) {
          sendCorrection(curVideo.videoId, curVideo.title, l, curVideo.channelKey, curVideo.channelName);
          removeVerdict();
        }
      });

      document.body.appendChild(el);
      verdictEl = el;
    }

    /* ------------------------------- toasts ----------------------------- */

    function toastWrap(): HTMLElement {
      let wrap = document.querySelector('.yti-toast-wrap') as HTMLElement | null;
      if (!wrap) {
        wrap = document.createElement('div');
        wrap.className = 'yti-toast-wrap';
        document.body.appendChild(wrap);
      }
      return wrap;
    }

    function showToast(message: string, points = 0) {
      const wrap = toastWrap();
      const toast = document.createElement('div');
      toast.className = 'yti-toast' + (points ? ' reward' : '');
      toast.innerHTML = (points ? '<span class="yti-toast-points">+0</span>' : '') + '<span class="yti-toast-msg"></span>';
      (toast.querySelector('.yti-toast-msg') as HTMLElement).textContent = message;
      wrap.appendChild(toast);
      if (points) {
        const el = toast.querySelector('.yti-toast-points') as HTMLElement;
        if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
          el.textContent = '+' + points;
        } else {
          const start = performance.now();
          const tick = (now: number) => {
            const p = Math.min(1, (now - start) / 420);
            el.textContent = '+' + Math.round(points * p);
            if (p < 1) requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
      }
      setTimeout(() => {
        toast.classList.add('hide');
        setTimeout(() => toast.remove(), 320);
      }, 2600);
    }

    /* ----------------------------- lifecycle ---------------------------- */

    function injectStyles() {
      if (document.getElementById('yti-styles')) return;
      const style = document.createElement('style');
      style.id = 'yti-styles';
      style.textContent = CONTENT_CSS;
      (document.head || document.documentElement).appendChild(style);
    }

    function teardownVisuals() {
      dismissFriction();
      removeVerdict();
      document.querySelectorAll('.yti-badge').forEach((b) => b.remove());
    }

    function resetClassifications() {
      document.querySelectorAll(LABEL_SEL).forEach((c) => c.removeAttribute(LABEL));
      document.querySelectorAll(SEEN_SEL).forEach((c) => c.removeAttribute(SEEN));
      document.querySelectorAll('.yti-badge').forEach((b) => b.remove());
      removeVerdict();
      scored.clear();
      currentWatch = null;
      curVideo = null;
      scheduleScan();
      scheduleEvalWatch();
    }

    async function refreshActive() {
      settings = await getSettings();
      const profile = await profileItem.getValue();
      active = settings.enabled && !!profile;
      if (!active) teardownVisuals();
    }

    /* --------------------------- scheduling ----------------------------- */

    let scanTimer: number | undefined;
    let watchTimer: number | undefined;
    const scheduleScan = () => {
      clearTimeout(scanTimer);
      scanTimer = setTimeout(scan, 200) as unknown as number;
    };
    const scheduleEvalWatch = () => {
      clearTimeout(watchTimer);
      watchTimer = setTimeout(evalWatch, 250) as unknown as number;
    };

    function onNav() {
      dismissFriction();
      removeVerdict();
      currentWatch = null;
      curVideo = null;
      scheduleScan();
      scheduleEvalWatch();
    }

    /* ------------------------------- boot ------------------------------- */

    injectStyles();

    refreshActive().then(() => {
      if (active) {
        scheduleScan();
        scheduleEvalWatch();
      }
    });

    new MutationObserver((mutations) => {
      // Skip mutations that are entirely inside the video player to avoid
      // competing with YouTube's player state machine during buffering/seeking.
      const playerEl = document.getElementById('movie_player');
      if (playerEl && mutations.every(m => playerEl.contains(m.target))) return;
      scheduleScan();
      scheduleEvalWatch();
    }).observe(document.body || document.documentElement, { childList: true, subtree: true });

    window.addEventListener('yt-navigate-finish', onNav);
    document.addEventListener('yt-navigate-finish', onNav);
    let lastUrl = location.href;
    setInterval(() => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        onNav();
      }
    }, 800);

    settingsItem.watch(async () => {
      await refreshActive();
      if (!active) return;
      document.querySelectorAll<HTMLElement>(LABEL_SEL).forEach(paintBadge);
      dismissFriction();
      currentWatch = null;
      scheduleEvalWatch();
    });
    profileItem.watch(async () => {
      await refreshActive();
      if (active) resetClassifications();
    });
    metaItem.watch(() => {
      if (active) resetClassifications();
    });

    // popup asks the homepage tab to report what videos it sees (for calibration).
    // Each poll also nudges the page down so YouTube lazy-loads more cards — the
    // background unions samples across polls to gather a diverse ~50.
    browser.runtime.onMessage.addListener((msg: Message) => {
      if (msg?.type === 'scrapeSample' && window === window.top) {
        const samples = collectSamples();
        try {
          window.scrollBy({ top: window.innerHeight * 3, behavior: 'auto' });
        } catch {
          /* ignore */
        }
        return Promise.resolve({ samples });
      }
    });
  },
});
