import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: "client",
  publicDir: "client/public",
  build: { outDir: "../dist/public", emptyOutDir: true },
  server: { host: "127.0.0.1", allowedHosts: ["localhost", "127.0.0.1"], fs: { strict: true, deny: ["**/.*"] } },
});
