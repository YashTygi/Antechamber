# Antechamber — Project Context & Handoff

> Single source of truth for this project. If you are an LLM or developer picking
> this up, read this top-to-bottom first. It captures the vision, every decision
> made (and why), the architecture, the current state, the patterns/anti-patterns
> we hit, and what to do next.

---

## 1. The problem & the vision

**Problem:** The author opens YouTube to work/learn, then falls into endless
doom-scrolling of unproductive videos.

**Inspiration:**
- *Atomic Habits* — to break a habit, **add friction**.
- *One Sec* app — when you open a distracting app, it injects a delay / a
  "do you really want to?" prompt, so the impulse has to pass a conscious gate.

**Goal:** A Chrome extension that does the same, but **personalized to YouTube**:

1. **Onboarding** captures the user's identity (role: developer, med student,
   lawyer, etc.) and two example lists: what *they* consider **productive** vs
   **unproductive** video topics.
2. On every YouTube surface (home, search, watch sidebar, etc.) the extension
   **scrapes each visible video**, **classifies** it as productive /
   unproductive / neutral, and **badges** it on the UI.
3. Clicking an **unproductive** video triggers **friction**: a blur/mask over
   the player for a configurable delay (2/5/10s) with an "are you sure?" prompt,
   optionally requiring the user to **type a reason** before continuing.
4. **Productive** videos earn a **reward** (points). The whole thing is
   **gamified** (points, streaks, levels, stats). Crucially, *backing off* at
   the friction gate is rewarded too — we reinforce the decision, not just
   consumption.

---

## 2. Locked decisions (with rationale)

| Decision | Choice | Why |
|---|---|---|
| **Classification** | **Local embeddings ONLY. No LLM.** | Originally planned hybrid (local + LLM). Author explicitly removed the LLM. Embeddings give: no API key, no per-call cost, no latency, nothing leaves the device. |
| **AI runtime** | On-device, in the extension | Privacy becomes trivial; no backend at all. |
| **Embedding lib** | **Transformers.js** (`@huggingface/transformers`) | Runs ONNX models in-browser via WASM. Standard for in-extension embeddings. |
| **Model** | **`Xenova/all-MiniLM-L6-v2`** (384-dim) | Small (~23MB quantized), fast, good enough for short titles. |
| **Browser target** | **Chrome only** (Manifest V3) | Simplest, largest user base. WXT can add Firefox later. |
| **Framework** | **WXT** (+ React + TypeScript) | Generates the MV3 manifest from the `entrypoints/` folder, hot-reload, organizes contexts. React only used in popup/options. |
| **Styling** | Plain injected CSS so far; Tailwind planned for popup UI | Content-script badges use an injected `<style>`. |
| **Storage** | `chrome.storage.local` (planned); in-memory `Map` cache currently | Local-first. IndexedDB only if cache grows large. |
| **Privacy** | 100% local, no servers, no network calls after model download | Privacy policy reduces to "all processing is local; nothing is collected." |
| **Package manager** | pnpm | — |

---

## 3. Tech stack

- **WXT 0.20.x** — extension framework (MV3).
- **React 19** + **TypeScript** — for popup/options UI (not yet built).
- **@huggingface/transformers** — embeddings (Transformers.js).
- **chrome.storage.local** — persistence (planned; cache is in-memory for now).
- No backend. No API keys. No LLM.

**Project location:** `~/Developer/yt-ext/wxt-dev-wxt`
(the folder name `wxt-dev-wxt` is the scaffold default — cosmetic).

---

## 4. Extension architecture (the core mental model)

A browser extension is a **small distributed system**: several independent
contexts that **cannot call each other's functions** — they only **pass
messages**. Knowing who owns what + what messages flow is the central design
skill.

| Context | Runs where | Sees YouTube DOM? | UI? | Our use |
|---|---|---|---|---|
| **Content script** (`entrypoints/content.ts`) | Injected into youtube.com pages | ✅ Yes | injects elements | scrape titles, paint badges, (future) friction overlay |
| **Background / service worker** (`entrypoints/background.ts`) | Hidden, always-on (MV3 sleeps when idle) | ❌ No | ❌ | loads model, classifies, owns the cache |
| **Popup / Options** (`entrypoints/popup/`) | Window off the toolbar icon | ❌ No | ✅ React | (future) onboarding, settings, stats dashboard |
| **Offscreen document** | Hidden page for heavy work | ❌ No | ❌ | (future, recommended) move the embedding model here — see §10 |

### Current data flow

```
content.ts (on YouTube)                     background.ts (service worker)
─────────────────────────                   ──────────────────────────────
MutationObserver → scan()
  for each new card:
    extract {videoId, title}
    enqueue() ─┐
               │ debounce 250ms
               ▼
            flush() ──[ sendMessage {type:'classifyBatch', items} ]──►  onMessage listener
                                                                          await ready (model loaded)
                                                                          for each item:
                                                                            classifyCached(videoId,title)
                                                                              cache hit? return
                                                                              else embed + cosine + neutral-band
                                                                              cache.set(videoId,label)
            paintBadge(card) ◄──────────[ returns {videoId: label} map ]──┘
```

### Console locations (important — they differ!)
- **Content script logs** → the normal **page** DevTools console (on youtube.com).
- **Background logs** → `chrome://extensions` → your extension → **"Inspect views: service worker"** (separate DevTools window).

---

## 5. The classification algorithm

### Embeddings primer
An embedding model is a function: text → fixed-length vector (384 numbers here).
Trained so **similar meaning → similar direction**. We use `pooling:'mean'` and
`normalize:true`, so every vector has length 1. For unit vectors, **cosine
similarity == dot product**.

Proven in testing:
- sim("python tutorial for beginners", "learn programming in python") ≈ **0.73**
- sim("python tutorial...", "funny cat compilation") ≈ **0.16**

### Classify a title
1. At startup, embed every productive example and every unproductive example **once**.
2. For a title: embed it, then
   - `pSim = max(cosine(title, each productive vec))`
   - `uSim = max(cosine(title, each unproductive vec))`
   - **`max`, not average** — a productive list may mix unrelated topics (e.g.
     "dsa" + "react"); a match to *one* should still count. Averaging dilutes it.
3. **Two-gate neutral band:**
   - if `max(pSim,uSim) < SIM_FLOOR` → **neutral** (video isn't in the user's world at all)
   - else if `|pSim − uSim| < MARGIN_BAND` → **neutral** (too close to call)
   - else → whichever is higher.

### Threshold calibration (a key learning)
Real short titles score **lower** than intuition suggests — usually **0.1–0.3**,
even for strong topical matches. Initial `SIM_FLOOR = 0.40` was **too high** and
forced clearly-productive videos to neutral. Current working values:

```
SIM_FLOOR   = 0.20
MARGIN_BAND = 0.08
```

These should become the **balanced** preset. Per the spec, `sensitivity`
(lenient/balanced/strict) just selects different SIM_FLOOR/MARGIN_BAND pairs.
**Always calibrate against real titles, not intuition.**

---

## 6. YouTube DOM map (current, verified)

YouTube is an **SPA** (no full page reloads) and **lazy-loads** cards on scroll.
There are **TWO card shapes**, and YouTube is mid-migration toward the new one.

### OLD shape
- Used on: **Search results** (`/results?search_query=`)
- card: `ytd-video-renderer`
- title: `a#video-title` → read the **`title` attribute** (cleanest)
- channel: `ytd-channel-name a` → `textContent`
- videoId: parse `a#video-title` `href` → `?v=` param

### NEW shape ("lockup")
- Used on: **Home** (`/`) and **Watch sidebar** (`/watch`)
- card: `yt-lockup-view-model`
- title: `h3.ytLockupMetadataViewModelHeadingReset` → read **`title` attribute**
- channel: `.ytContentMetadataViewModelMetadataText` → `textContent`

### Shorts
- Shelf element: **`grid-shelf-view-model`** (currently removed wholesale).
- Other surfaces may use `ytd-reel-shelf-renderer` / `ytd-rich-shelf-renderer[is-shorts]`.

### ⚠️ Critical DOM gotcha
`id="video-title"` and `id="channel-name"` are **NOT unique** on the page —
YouTube reuses them on every card (violates the HTML spec but it's real).
**Never query these globally.** Always find the **card** first, then
`card.querySelector(...)` **scoped within** the card.

### Surface priority
1. 🔴 Home (`/`) — main doom-scroll zone — **NEW shape, not yet scraped**
2. 🔴 Search (`/results`) — **OLD shape, DONE**
3. 🔴 Watch sidebar (`/watch`) — **NEW shape, not yet scraped**
4. 🟡 Subscriptions, Channel→Videos (`ytd-rich-item-renderer`)
5. 🟢 Playlist (`ytd-playlist-video-renderer`)
6. ⚪ Shorts player — special; consider blocking entirely

---

## 7. Positive patterns (keep doing these)

- **Scope DOM queries to the card**, never globally (dodges duplicate-id bug).
- **Remember derived state on the element** via `data-*` attributes
  (`data-yti-label`) so it survives YouTube re-renders and you don't reclassify.
- **Idempotent DOM mutation**: when you mutate a DOM you're also observing, make
  repaint a no-op if already correct (`if (badge.dataset.label === label) return`).
  Otherwise you get an **infinite mutation→observe→mutate loop**.
- **Debounce the MutationObserver** (200–250ms) — it fires many times/sec on scroll.
- **Batch** classification (one message per ~250ms window, not one per card).
- **Cache by `videoId`** — never classify the same video twice. (In-memory `Map`
  now; persist to `chrome.storage.local` later.)
- **`ready` promise** in the background: messages can arrive before the 20MB
  model loads; `await ready` makes requests wait instead of crashing.
- **Embed fixed example lists once** at startup; only embed the *new* title per call.
- **Separate concerns**: "what is this video?" (classify, expensive, once) vs
  "is the badge showing?" (paint, cheap, repeatable).
- **Predict-then-observe**: predict output before running; mismatches reveal bugs.

---

## 8. Anti-patterns / gotchas we hit (and the fix)

| Symptom | Root cause | Fix |
|---|---|---|
| Content script logged nothing | Checking the **wrong Chrome window** (extension only loads in the WXT-launched instance) | Use the dev Chrome window; verify at `chrome://extensions` |
| Only 4 of N videos scraped | One-time `querySelectorAll` is a **snapshot**; YouTube lazy-loads more | `MutationObserver` + re-scan |
| Shorts remover did nothing (`length 0`) | Wrong/guessed selector (`ytd-shorts-grid-renderer` doesn't exist) | Inspect the real element → `grid-shelf-view-model` |
| `classify` returned `undefined` | Stale **HMR**: two code versions interleaved | Full reload (↻ on the extension), not hot-reload |
| Everything came back `neutral` | `SIM_FLOOR` (0.40) too high vs real title scores (~0.1–0.3) | Lower to 0.20 |
| Batching/caching "didn't work" | **Built the parts but never wired them** — old per-card path still ran; `classifyBatch` had no handler; cache fn defined but `ready` returned the uncached one | Wire content→batch, add batch handler, `return classifyCached` |
| Badge never appeared | (a) absolute badge with no positioned ancestor; (b) **one-time insert wiped by YouTube re-render**, while `data-yti-seen` made code think it was done | Anchor on `ytd-thumbnail` (`position:relative`); store label on card + **repaint on every scan** |
| (latent) infinite loop risk | repaint mutates observed DOM every tick | idempotent paint (no-op when already correct) |

---

## 9. Data model spec (target shapes — mostly NOT built yet)

Stored under top-level keys in `chrome.storage.local`: `profile`, `settings`,
`vectors`, `cache`, `stats`, `meta`. **Text is canonical; vectors are a cache**
(re-embed from text if the model changes — never store only vectors).

```ts
interface UserProfile {
  role: string; roleLabel: string; roleDescription?: string;
  productiveExamples: ExampleItem[];
  unproductiveExamples: ExampleItem[];
  createdAt: number; updatedAt: number;
}
interface ExampleItem {
  id: string; text: string;
  source: 'onboarding' | 'correction' | 'manual';
  fromVideoId?: string; createdAt: number;
}

interface VectorStore {
  modelId: string; dim: number; normalized: true;
  productive: { exampleId: string; vec: number[] }[];
  unproductive: { exampleId: string; vec: number[] }[];
  productiveCentroid: number[] | null;
  unproductiveCentroid: number[] | null;
  builtAt: number;
}

interface ClassificationCache { [videoId: string]: {
  label: 'productive'|'unproductive'|'neutral';
  score: { pSim: number; uSim: number; margin: number; confidence: number };
  titleHash: string; vectorsBuiltAt: number;
  method: 'keyword'|'embedding'; classifiedAt: number;
}}
// invalidate if vectorsBuiltAt < VectorStore.builtAt, titleHash changed, or schema bump.

interface Settings {
  delaySeconds: 2|5|10; requireReason: boolean; blockShorts: boolean;
  frictionOn: ('productive'|'unproductive'|'neutral')[]; // default ['unproductive']
  sensitivity: 'lenient'|'balanced'|'strict';
  showBadges: boolean; badgeStyle: 'icon'|'icon_text';
  gamificationEnabled: boolean; enabled: boolean;
}

interface Stats {
  points: number; level: number;
  currentStreakDays: number; longestStreakDays: number; lastActiveDay: string;
  daily: Record<string, DailyStat>;
  lifetime: { productiveOpened; unproductiveOpened; frictionShown; backedOff; watchedAnyway };
}
```

**Sensitivity presets (starting points):**
| | SIM_FLOOR | MARGIN_BAND |
|---|---|---|
| lenient | 0.45 → revise down | 0.12 |
| balanced | **0.20** (calibrated) | **0.08** |
| strict | lower | 0.04 |

**Point rules (suggested):** productive watched `+10`; **backed off at friction
`+5`** (reward the good decision); pushed through `0` or `-2`. Streak = a day with
≥1 productive watch and `backedOff >= watchedAnyway`.

**Correction loop (cheap personalization, all local):** a "wrong label?" button
adds the title as a new `ExampleItem` to the correct list, re-embeds, recomputes
the centroid, bumps `builtAt` → cached results auto-invalidate and re-classify.

---

## 10. Current state (as of this handoff)

✅ **Working**
- WXT React project scaffolded, dev loop working.
- Content script injected on `*://*.youtube.com/*`.
- **Search page**: scrape all cards (handles lazy-load via debounced MutationObserver).
- Background loads MiniLM, embeds hardcoded example lists, classifies.
- **Batching** (debounced queue → one `classifyBatch` message).
- **Caching** by `videoId` (in-memory `Map`).
- **Stable badges** on search thumbnails (✓/✗/~), survive re-render via repaint.
- Shorts shelves removed (`grid-shelf-view-model`).

🟨 **Hardcoded / temporary**
- Example lists are hardcoded in `background.ts`:
  - PRODUCTIVE = `['dsa tutorial','system design','react hooks explained']`
  - UNPRODUCTIVE = `['official music video','funny moments','movie trailer']`
- Cache is in-memory only (lost when service worker sleeps/reloads).
- Model runs in the **background service worker** (works, but see note below).

❌ **Not built yet**
- Home & Watch-sidebar scraping (NEW `yt-lockup-view-model` shape).
- Friction overlay (blur + delay + reason) on unproductive video click.
- Onboarding + settings + stats UI (popup/options, React).
- Persisting profile/vectors/cache/stats to `chrome.storage.local`.
- Gamification (points/streaks/levels).
- "Wrong label?" correction loop.
- Privacy policy + Chrome Web Store packaging.

> **Architecture note / future refactor:** Per the original plan, the embedding
> model should ideally live in an **offscreen document**, not the service worker
> — MV3 service workers can be killed when idle and have some WASM constraints.
> It currently works in the background for development; revisit before release.

---

## 11. Roadmap (recommended order)

1. **Friction overlay** — intercept clicks on unproductive videos: blur/mask the
   target, countdown (settings: 2/5/10s), "Go back" + "Watch anyway", optional
   "type your reason". This is the core habit-breaking behavior.
2. **Onboarding + settings UI** (popup, React) → replace hardcoded lists; store
   `profile` + `settings` in `chrome.storage.local`; embed user lists into `vectors`.
3. **Multi-surface scraping** — add the NEW `yt-lockup-view-model` path so Home
   and Watch-sidebar get badged. Generalize the scraper to both shapes.
4. **Persist the cache** to `chrome.storage.local` (the `ClassificationCache` shape)
   with invalidation rules; survive restarts.
5. **Gamification** — points, streaks, levels, stats dashboard; reward backing off.
6. **Correction loop** — "wrong label?" → grow example lists → re-embed locally.
7. **Move embeddings to an offscreen document**; harden for MV3.
8. **Privacy policy + Web Store** submission. Narrow permissions: host
   `*://*.youtube.com/*`, `storage`, `offscreen`.

---

## 12. How to run

```bash
cd ~/Developer/yt-ext/wxt-dev-wxt
pnpm install
pnpm dev          # builds + launches a separate Chrome with the extension loaded
```
- Edit files → WXT rebuilds. **Content-script changes need a page reload**;
  bigger changes need the extension reloaded (↻ at `chrome://extensions`).
- Background console: `chrome://extensions` → extension → **service worker**.
- First model run downloads ~20MB (needs internet, then cached/offline).

---

## 13. Current source (reference)

### `entrypoints/content.ts`
Scrapes search cards, debounced batch-classify via the background, idempotent
badge painting that survives re-renders, Shorts removal. (See the file for the
authoritative version.)

Key functions: `scan()` (queue new + repaint existing), `enqueue/flush`
(debounced batch), `getVideoId`, `paintBadge` (idempotent), `injectStyles`,
`removeShortsGrid`, debounced `MutationObserver` on `document.body`.

### `entrypoints/background.ts`
Loads `Xenova/all-MiniLM-L6-v2`, embeds hardcoded lists once, exposes
`classifyCached(videoId,title)` via a `ready` promise, handles `classifyBatch`
messages and returns a `{videoId: label}` map. `cosineSimilarity` = dot product
(vectors are normalized). Thresholds: `SIM_FLOOR=0.20`, `MARGIN_BAND=0.08`.

---

## 14. Working style (for any assistant helping the author)

The author is **learning by building** and explicitly does **not** want code
written for them by default. Act as a **mentor**: explain the concept, give the
next concrete step, review what they wrote, and only hand over full code when
they explicitly ask or are genuinely stuck. They specifically want to understand:
**how transformers/embeddings work, how WXT works, how WASM works, and
system/component design.** Favor "predict, then observe" and Socratic nudges.
```
