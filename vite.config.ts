/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

/**
 * Photo OCR (Tesseract.js) served from the app itself, so scanning works offline and never
 * calls a CDN. Files are copied from node_modules at build time and served from there in dev.
 * They are NOT precached (≈ 7 MB): the service worker caches them the first time the scanner is used.
 */
const TESSERACT_FILES: Record<string, string> = {
  'tesseract/worker.min.js': 'node_modules/tesseract.js/dist/worker.min.js',
  'tesseract/core/tesseract-core-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',
  'tesseract/core/tesseract-core-simd-lstm.wasm.js': 'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  // English, "best_int" model (2.9 MB, Apache-2.0, from @tesseract.js-data/eng).
  'tesseract/lang/eng.traineddata.gz': 'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
};

function tesseractAssets(): Plugin {
  const root = fileURLToPath(new URL('.', import.meta.url));
  return {
    name: 'vitalis-tesseract-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const key = (req.url ?? '').split('?')[0].replace(/^\//, '');
        const src = TESSERACT_FILES[key];
        if (!src || !existsSync(join(root, src))) return next();
        res.setHeader('Content-Type', key.endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
        createReadStream(join(root, src)).pipe(res);
      });
    },
    writeBundle(options) {
      const out = options.dir ?? join(root, 'dist');
      for (const [dest, src] of Object.entries(TESSERACT_FILES)) {
        mkdirSync(join(out, dest, '..'), { recursive: true });
        copyFileSync(join(root, src), join(out, dest));
      }
    },
  };
}

/** Injects the list of built files into dist/sw.js so the whole app is precached for offline use. */
function swPrecache(): Plugin {
  return {
    name: 'vitalis-sw-precache',
    apply: 'build',
    closeBundle() {
      const dist = fileURLToPath(new URL('./dist', import.meta.url));
      const files: string[] = [];
      const walk = (d: string) =>
        readdirSync(d).forEach((f) => {
          const p = join(d, f);
          if (statSync(p).isDirectory()) walk(p);
          else files.push('/' + relative(dist, p).split('\\').join('/'));
        });
      walk(dist);
      const list = ['/', ...files.filter((f) => f !== '/sw.js' && !f.endsWith('.map') && !f.startsWith('/tesseract/'))];
      const hash = createHash('sha256');
      list.forEach((f) => f !== '/' && hash.update(readFileSync(join(dist, f))));
      const swPath = join(dist, 'sw.js');
      const sw = readFileSync(swPath, 'utf8')
        .replace("'__VERSION__'", JSON.stringify(hash.digest('hex').slice(0, 12)))
        .replace('self.__PRECACHE__ ||', `${JSON.stringify(list)} ||`);
      writeFileSync(swPath, sw);
    },
  };
}

export default defineConfig({
  plugins: [react(), tesseractAssets(), swPrecache()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  // Render (and similar hosts) run `npm start`: allow their web addresses.
  preview: { allowedHosts: ['.onrender.com'] },
  build: {
    chunkSizeWarningLimit: 900,
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
