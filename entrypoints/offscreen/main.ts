import { pipeline, env } from '@huggingface/transformers';
import { MODEL_ID } from '@/lib/defaults';

/**
 * Offscreen document — the ONLY place the WASM embedding model runs.
 *
 * onnxruntime-web loads its WASM glue with a dynamic import(), which the HTML
 * spec forbids inside a service worker (ServiceWorkerGlobalScope). An offscreen
 * document is a normal Document context where import() is allowed, so the model
 * loads here and the service worker talks to it by message.
 *
 * This file is intentionally dumb: it embeds text and returns plain number[][].
 * All caching, classification math and storage stay in the background SW.
 */

env.allowLocalModels = false;
// Don't try to stash the WASM in the browser Cache API. transformers.js
// pre-fetches the binary and calls caches.put(), but Cache.put() rejects the
// `chrome-extension://` request scheme our bundled WASM is served from, which
// surfaces a noisy "Failed to cache … scheme 'chrome-extension' is unsupported"
// warning. The WASM is already local to the extension, so caching buys nothing;
// with this off, ORT loads it straight from wasmPaths. (The model-file cache for
// the MiniLM download from huggingface.co is separate and still works.)
(env as Record<string, unknown>).useWasmCache = false;
// Point onnxruntime at the WASM files bundled at the extension root (copied
// from public/). transformers 4.2.0 requests the *asyncify* variant on
// non-Safari, and it only pre-fetches/caches the binary when wasmPaths is an
// OBJECT with .wasm + .mjs keys (see backends/onnx.js shouldUseWasmCache) — a
// bare string falls through to ORT's own path guessing and 404s. numThreads=1
// avoids the SharedArrayBuffer / COOP-COEP cross-origin-isolation requirement
// that extension pages don't satisfy.
const wasmRoot = browser.runtime.getURL('/');
(env.backends.onnx.wasm as Record<string, unknown>).wasmPaths = {
  wasm: `${wasmRoot}ort-wasm-simd-threaded.asyncify.wasm`,
  mjs: `${wasmRoot}ort-wasm-simd-threaded.asyncify.mjs`,
};
(env.backends.onnx.wasm as Record<string, unknown>).numThreads = 1;
(env.backends.onnx.wasm as Record<string, unknown>).proxy = false;

type Embedder = (text: string, opts: object) => Promise<{ data: Float32Array }>;

let embedderPromise: Promise<Embedder> | null = null;
function getEmbedder(): Promise<Embedder> {
  if (!embedderPromise) {
    const p = pipeline('feature-extraction', MODEL_ID) as unknown as Promise<Embedder>;
    embedderPromise = p.catch((err: unknown) => {
      embedderPromise = null; // allow retry after a transient failure
      console.error('[Antechamber/offscreen] model load failed', err);
      throw err;
    });
  }
  return embedderPromise;
}

/** Embed each text → unit-normalized vector as a plain number[] (JSON-safe). */
async function embedMany(texts: string[]): Promise<number[][]> {
  const embed = await getEmbedder();
  const out: number[][] = [];
  for (const text of texts) {
    const r = await embed(text, { pooling: 'mean', normalize: true });
    out.push(Array.from(r.data as Float32Array));
  }
  return out;
}

// Only handle messages addressed to the offscreen doc. We use the
// sendResponse + `return true` pattern (works on every Chrome version, unlike
// promise-returning listeners). Returning undefined for non-offscreen messages
// leaves them for the background's own onMessage handler — no interference.
browser.runtime.onMessage.addListener((msg: unknown, _sender, sendResponse) => {
  const m = msg as { target?: string; type?: string; texts?: string[] };
  if (m?.target !== 'offscreen') return;
  if (m.type === 'embed') {
    embedMany(m.texts ?? [])
      .then((vectors) => sendResponse({ ok: true, vectors }))
      .catch((err: unknown) => sendResponse({ ok: false, error: String(err) }));
    return true; // keep the message channel open for the async sendResponse
  }
  if (m.type === 'ping') {
    sendResponse({ ok: true });
    return;
  }
  return;
});

console.log('[Antechamber/offscreen] ready');
