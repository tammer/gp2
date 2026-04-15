/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  /**
   * Canonical backend base URL for resolve + pipeline APIs (no trailing slash).
   * Override per-service with VITE_RESOLVE_API_BASE_URL / VITE_PIPELINE_API_BASE_URL when needed.
   */
  readonly VITE_API_BASE_URL?: string
  /** Base URL for POST /api/sources/resolve (no trailing slash); overrides VITE_API_BASE_URL when set */
  readonly VITE_RESOLVE_API_BASE_URL?: string
  /** Base URL for pipeline endpoints; overrides VITE_RESOLVE_API_BASE_URL / VITE_API_BASE_URL when set */
  readonly VITE_PIPELINE_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
