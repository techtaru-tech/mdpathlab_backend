/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_GOOGLE_MAPS_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  // Google's official callback, invoked when the Maps JS API key is missing, invalid, or blocked
  // by an HTTP-referrer restriction.
  gm_authFailure?: () => void;
}
