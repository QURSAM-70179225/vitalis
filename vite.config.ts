/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

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
      const list = ['/', ...files.filter((f) => f !== '/sw.js' && !f.endsWith('.map'))];
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
  plugins: [react(), swPrecache()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: {
    chunkSizeWarningLimit: 900,
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
