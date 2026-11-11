import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // sqlite-wasm localiza o .wasm via import.meta.url; o pre-bundle do Vite quebraria isso.
  optimizeDeps: { exclude: ['@sqlite.org/sqlite-wasm'] },
  worker: { format: 'es' },
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.png'],
      // Precache inclui o sqlite3.wasm para o app abrir offline.
      workbox: { globPatterns: ['**/*.{js,css,html,wasm,png,svg,webmanifest}'] },
      manifest: {
        name: 'Mecanica Systems',
        short_name: 'Mecanica',
        description: 'Gestão para oficinas mecânicas',
        lang: 'pt-BR',
        display: 'standalone',
        start_url: '/',
        theme_color: '#1d4ed8',
        background_color: '#ffffff',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
    }),
  ],
});
