import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// PORT / API_PORT let the end-to-end tests run their own pair of servers
// without touching the development ones.
const port = Number(process.env.PORT) || 5174;
const apiPort = Number(process.env.API_PORT) || 5050;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port,
    strictPort: true,
    proxy: {
      "/api": `http://localhost:${apiPort}`,
    },
  },
});
