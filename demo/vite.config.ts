import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const API = process.env.API_URL ?? "http://localhost:4000";

export default defineConfig({
  plugins: [react()],
  resolve: {
    // One React instance for the demo and the library source it imports.
    dedupe: ["react", "react-dom"],
    // Use the library's source directly so the demo always reflects local changes.
    alias: {
      "semi-functional-email-auth": fileURLToPath(new URL("../src/index.ts", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    // Same-origin proxy: the session cookie set by the backend just works.
    proxy: {
      "/create-token": API,
      "/me": API,
      "/logout": API,
    },
  },
});
