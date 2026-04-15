/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /** Base URL for POST /api/sources/resolve (no trailing slash), e.g. http://127.0.0.1:5000 */
  readonly VITE_RESOLVE_API_BASE_URL?: string
  /** Base URL for pipeline endpoints (evaluate-article, run); falls back to VITE_RESOLVE_API_BASE_URL in code when unset */
  readonly VITE_PIPELINE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
