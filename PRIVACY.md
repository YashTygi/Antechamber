# Privacy Policy — Antechamber

_Last updated: 2026-06-20_

Antechamber is a browser extension that adds a moment of friction before
distracting YouTube videos and rewards focused viewing. It is designed to be
**private by default**: all classification of your videos happens on your own
device, and the extension has no backend server of its own.

## What the extension does on your device

To decide whether a video is "productive," a "distraction," or "neutral," the
extension reads the **titles and channel names** of videos on the YouTube pages
you visit (home, search, watch). It compares them — using a small machine-learning
model that runs **entirely inside your browser** — against the topics, example
videos, and channels you set during onboarding.

All of this stays on your computer:

- Your profile (interests, productive/distraction topics, example ratings)
- Your settings and your stats (points, streaks)
- Per-video and per-channel classification results (a local cache)
- The machine-learning model files

This data is stored locally using the browser's `storage` and IndexedDB APIs. It
is never transmitted to us or to any third party, and **we operate no servers
that receive your data**.

## Data we collect

**None.** Antechamber does not collect, transmit, sell, or share any personal
information or browsing activity. There is no analytics, no tracking, and no
remote logging.

## Network connections the extension makes

1. **One-time model download.** The first time it runs, the extension downloads
   its machine-learning model (~20 MB) from the Hugging Face content-delivery
   network (`huggingface.co`). After that it is cached and works offline. This
   request contains no personal data — it only fetches the public model files.

2. **Optional YouTube Data API (off by default).** If — and only if — you choose
   to paste your own YouTube Data API key into the settings, the extension will
   send **video IDs** to Google's YouTube Data API (`googleapis.com`) to fetch
   extra public metadata (category, tags, description) that improves
   classification accuracy. This uses *your* API key and is governed by
   [Google's Privacy Policy](https://policies.google.com/privacy). Leaving the
   key blank keeps the extension 100% local. You can remove the key at any time.

## Permissions and why they are needed

- **`storage` / `unlimitedStorage`** — to save your profile, settings, stats, and
  the cached model on your device.
- **Host access to `youtube.com`** — to read video titles/channels, show badges,
  and display the friction gate on YouTube pages.
- **Host access to `googleapis.com`** — only used for the optional YouTube Data
  API feature described above.
- **`offscreen`** — to run the on-device machine-learning model (modern browsers
  cannot run this type of code in a background service worker).

## Your control

All stored data lives on your device. You can erase it at any time by removing
the extension or by using your browser's "clear site data" / extension-data
controls. Re-running onboarding or "reset stats" clears the corresponding data.

## Children's privacy

Antechamber does not knowingly collect any data from anyone, including children.

## Changes to this policy

If this policy changes, the "Last updated" date above will change accordingly.

## Contact

Questions about this policy: **yash.tyagi@bookswagon.in**
