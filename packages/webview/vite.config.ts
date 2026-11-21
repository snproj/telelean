import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const here = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

/**
 * The extension generates the webview HTML itself (CSP + nonce), so the build has a JS entry instead of an
 * index.html and emits fixed file names: dist/webview/webview.js, dist/webview/webview.css and assets/.
 * public/boot.js (the classic script the HTML loads before the stylesheet) is copied verbatim to dist/webview/boot.js.
 */
export default defineConfig({
  root: here('.'),
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@telelean/core': here('../core/src/index.ts'),
    },
  },
  build: {
    // TELELEAN_WEBVIEW_OUT redirects a test build away from the extension's dist/ (which a linked install may be running).
    outDir: process.env['TELELEAN_WEBVIEW_OUT'] ?? here('../extension/dist/webview'),
    emptyOutDir: true,
    // VS Code 1.140 embeds Chromium 150.
    target: 'chrome130',
    cssCodeSplit: false,
    modulePreload: false,
    assetsInlineLimit: 0,
    sourcemap: true,
    reportCompressedSize: false,
    rolldownOptions: {
      input: here('src/main.tsx'),
      output: {
        format: 'es',
        entryFileNames: 'webview.js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: (asset) =>
          asset.names.some((name) => name.endsWith('.css')) ? 'webview.css' : 'assets/[name][extname]',
      },
    },
  },
});
