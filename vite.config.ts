import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// During `vite dev` we proxy /api to `vercel dev` (running on 3000) so the
// React app and the serverless functions feel like one server.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
