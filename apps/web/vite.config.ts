import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  css: { postcss: { plugins: [] } },
  server: {
    port: 5174,
    cors: { origin: "http://127.0.0.1:5174" },
    strictPort: true,
    fs: {
      strict: true,
      allow: [
        fileURLToPath(new URL("./", import.meta.url)),
        fileURLToPath(new URL("../../packages/contracts", import.meta.url)),
        fileURLToPath(new URL("../../node_modules", import.meta.url)),
      ],
      deny: [
        "**/.env*",
        "**/.git/**",
        "**/.data/**",
        "**/.local/**",
        "**/.dev.vars*",
        "**/*.{pem,crt,key,p12,pfx,encrypted}",
        "**/*.sqlite*",
        "**/*.db",
      ],
    },
    // Desktop-managed filesystems can miss native watch events.
    watch: { usePolling: true, interval: 500 },
    proxy: { "/api": { target: "http://127.0.0.1:4000", changeOrigin: false } },
  },
  optimizeDeps: { include: ["react", "react-dom/client", "livekit-client"] },
});
