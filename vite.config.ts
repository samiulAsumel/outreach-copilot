import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Frontend deploys to Cloudflare Pages, the API deploys as its own Worker
// (worker/index.ts, via `wrangler deploy`) — matching this account's
// existing pattern (portbill, carview, world-kitchen-atlas all split this
// way) rather than one combined Worker-with-assets. In dev, requests to
// /api/* are proxied to a locally running `wrangler dev` instance so the
// browser only ever talks to one origin, same as production talks to two
// origins but without CORS getting in the way locally.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8787',
    },
  },
});
