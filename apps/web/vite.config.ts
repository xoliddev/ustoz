import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * `vite build --mode demo` → GitHub Pages: base /ustoz/, the backend runs in a Web Worker (PGlite + the real
 * services). Other modes → the real HTTP API (VITE_API_URL).
 */
export default defineConfig(({ mode }) => {
  const demo = mode === 'demo' || (mode === 'development' && process.env.VITE_TARGET !== 'http');
  return {
    base: demo && mode === 'demo' ? '/ustoz/' : '/',
    define: {
      'import.meta.env.VITE_TARGET': JSON.stringify(demo ? 'demo' : 'http'),
      'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL ?? ''),
    },
    plugins: [react()],
    // PGlite resolves its WASM + data bundle via import.meta.url; pre-bundling breaks those URLs
    optimizeDeps: { exclude: ['@electric-sql/pglite'] },
    worker: { format: 'es' },
    build: {
      target: 'es2022',
      chunkSizeWarningLimit: 1500,
      assetsInlineLimit: (file: string) => (file.endsWith('.wasm') || file.endsWith('.data') || file.endsWith('.tar.gz') ? false : undefined),
    },
    server: { port: 4180, strictPort: true, proxy: { '/v1': process.env.API_PROXY_TARGET ?? 'http://localhost:4182' } },
    preview: { port: 4181, strictPort: true },
  };
});
