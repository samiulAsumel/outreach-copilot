import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cloudflare } from '@cloudflare/vite-plugin';

// The cloudflare() plugin runs worker/index.ts inside the real workerd
// runtime during `vite dev`, so D1 and Workers AI bindings behave exactly
// as they will in production — no separate mock server needed.
export default defineConfig({
  plugins: [react(), cloudflare()],
});
