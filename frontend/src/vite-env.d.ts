/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Base URL of the FastAPI backend, with no trailing slash — e.g.
   * `http://localhost:8000` locally, or the deployed backend's origin.
   * Set in `docker-compose.yml` (Task 10) and in Vercel's env vars (Task 11).
   */
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
