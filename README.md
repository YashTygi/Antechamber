<p align="center">
  <img src="logo.svg" width="96" height="96" alt="Antechamber logo" />
</p>

<h1 align="center">Antechamber</h1>

<p align="center"><strong>Add friction to YouTube distractions and reward focus — adaptive, and fully on-device.</strong></p>

---

Antechamber is a browser extension that puts a small, deliberate pause in front of
distracting YouTube videos and rewards you for staying focused. It learns what
*you* consider productive vs. distracting, and does all of its thinking locally —
no servers, no tracking, no data leaves your machine.

---

## How it works

- **On-device classification.** A small machine-learning model (MiniLM via
  [transformers.js](https://github.com/huggingface/transformers.js)) runs entirely
  inside your browser. It reads video titles and channel names on YouTube and
  decides whether each one is **productive**, a **distraction**, or **neutral** —
  by comparing them against the interests, example videos, and channels you set
  during onboarding.

- **Friction, not blocking.** When you land on a distracting video, Antechamber
  shows a calm "gate" — a brief, dismissible pause with a countdown — instead of
  hard-blocking it. You stay in control; the goal is intention, not restriction.

- **Rewards for focus.** Productive viewing earns points, levels, and streaks, with
  gentle on-page reward toasts.

- **Adaptive & self-tuning.** It calibrates to your real YouTube homepage during
  onboarding and keeps learning from your corrections — re-label any verdict and
  the whole extension re-checks live, no reload needed. Channels you rate
  consistently get auto-labeled and short-circuit classification.

- **Private by default.** All your data — profile, settings, stats, and
  classification cache — stays on your device in `storage` and IndexedDB. See
  [PRIVACY.md](./PRIVACY.md) for the full story.

---

## Privacy

Antechamber collects **nothing**. There is no analytics, no remote logging, and no
backend server. The only network requests are:

1. A one-time ~20 MB model download from the Hugging Face CDN (no personal data).
2. *Optional* calls to the YouTube Data API — **only** if you paste in your own API
   key — to improve classification accuracy.

Full details in [PRIVACY.md](./PRIVACY.md).

---

## Tech stack

- [WXT](https://wxt.dev/) (Manifest V3, Chrome + Firefox)
- React 19 + TypeScript
- [@huggingface/transformers](https://github.com/huggingface/transformers.js) for
  on-device embeddings (run in an offscreen document)

---

## Development

```bash
pnpm install

pnpm dev            # Chrome, hot-reload
pnpm dev:firefox    # Firefox

pnpm build          # production build (Chrome)
pnpm build:firefox  # production build (Firefox)
pnpm zip            # package for the Chrome Web Store
pnpm compile        # type-check only
```

After `pnpm build`, load the unpacked extension from `.output/chrome-mv3/` via
`chrome://extensions` (Developer mode → Load unpacked).

---

## License

[MIT](./LICENSE)
