import { defineConfig } from 'wxt';
import path from 'node:path';

/**
 * onnxruntime-web contains `new URL('….asyncify.wasm', import.meta.url)`, so Vite
 * emits a hashed copy of the 23MB WASM into assets/. At runtime we never load it —
 * the offscreen doc points wasmPaths at the stable root copy (shipped from public/)
 * via the transformers wasm-cache path. So the hashed copy is pure dead weight
 * (~half the package). Drop it from the bundle. The `assets/` guard guarantees we
 * never touch the root copy (which isn't under assets/).
 */
function dropDuplicateOrtWasm() {
  return {
    name: 'drop-duplicate-ort-wasm',
    generateBundle(_options: unknown, bundle: Record<string, unknown>) {
      for (const fileName of Object.keys(bundle)) {
        if (fileName.startsWith('assets/') && /ort-wasm-.*\.wasm$/.test(fileName)) {
          delete bundle[fileName];
        }
      }
    },
  };
}

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Antechamber',
    description: 'Add friction to YouTube distractions and reward focus — adaptive, on-device.',
    permissions: ['storage', 'unlimitedStorage', 'offscreen'],
    host_permissions: ['*://*.youtube.com/*', 'https://www.googleapis.com/*'],
    // WASM (the embedding model) needs 'wasm-unsafe-eval'. WXT only injects this
    // automatically in dev (`serve`); production builds omit the CSP entirely and
    // fall back to Chrome's default `script-src 'self'`, which BLOCKS WebAssembly.
    // Setting it here applies it to both dev and production builds.
    content_security_policy: {
      extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self';",
    },
  },
  vite: () => ({
    plugins: [dropDuplicateOrtWasm()],
    resolve: {
      alias: {
        // Vite 8 resolves the "node" export condition first, which picks
        // transformers.node.mjs — the wrong build for a service worker.
        // An absolute-path alias bypasses the exports field entirely and
        // forces the browser/web build.
        '@huggingface/transformers': path.resolve(
          __dirname,
          'node_modules/@huggingface/transformers/dist/transformers.web.js',
        ),
      },
    },
    // Don't let the bundler try to parse/inline the WASM files — they're
    // loaded at runtime by onnxruntime-web from the extension root.
    assetsInclude: ['**/*.wasm'],
    optimizeDeps: {
      exclude: ['onnxruntime-web', '@huggingface/transformers'],
    },
    build: {
      // The offscreen chunk (transformers.js, ~518kB) legitimately exceeds the
      // default 500kB warning threshold; it loads once in a hidden document.
      chunkSizeWarningLimit: 700,
    },
  }),
});
