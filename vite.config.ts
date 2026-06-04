import { defineConfig } from 'vite';
import electron from 'vite-plugin-electron';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  base: './',
  build: {
    outDir: 'dist/renderer',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist/main',
            rollupOptions: {
              external: ['electron', 'screenshot-desktop', 'pngjs'],
            },
          },
        },
        onstart(args) {
          // Electron restarts when main process recompiles
          args.startup();
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload();
        },
        vite: {
          build: {
            outDir: 'dist/main',
            rollupOptions: {
              external: ['electron'],
            },
          },
        },
      },
    ]),
  ],
});
