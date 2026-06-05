import { defineConfig } from "vite";
import { resolve } from "path";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Root is the frontend directory (where index.html lives)
  root: ".",

  plugins: [react()],

  // BASE_PATH is set in Railway dashboard (e.g. /marketplace/). Defaults to / for local dev.
  base: process.env.BASE_PATH || "/",

  // Dev server proxies API calls to the Express backend
  server: {
    port: 5173,
    proxy: {
      "/v1": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      "/socket.io": {
        target: "http://localhost:3000",
        ws: true,
      },
    },
  },

  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: resolve(__dirname, "index.html"),
    },
  },
});
