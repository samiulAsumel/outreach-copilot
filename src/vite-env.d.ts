/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Absolute origin of the deployed API Worker, e.g.
  // "https://outreach-copilot-api.<subdomain>.workers.dev". Empty/unset in
  // dev, where vite.config.ts's proxy handles /api locally.
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
