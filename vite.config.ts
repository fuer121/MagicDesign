import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5188,
    strictPort: true,
    proxy: {
      "/api": "http://localhost:8787",
      "/uploads": "http://localhost:8787",
      "/generated": "http://localhost:8787",
      "/exports": "http://localhost:8787",
      "/海报素材": "http://localhost:8787"
    }
  }
});
