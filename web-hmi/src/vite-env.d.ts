/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_BASE_PATH: string | undefined;
  readonly VITE_API_PREFIX: string | undefined;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
