/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_TARGET: 'demo' | 'http';
  readonly VITE_API_URL: string;
}
