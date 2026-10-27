import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const API = process.env.API_URL ?? "http://localhost:4000";
const src = (path: string) => fileURLToPath(new URL(`../src/${path}`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // One React instance for the demo and the library source it imports.
    dedupe: ["react", "react-dom"],
    // Use the library's source directly so the demo always reflects local changes.
    alias: [
      { find: /^semi-functional-email-auth\/passkeys$/, replacement: src("passkeys/index.ts") },
      { find: /^semi-functional-email-auth$/, replacement: src("index.ts") },
    ],
  },
  server: {
    port: 5173,
    // Same-origin proxy: the session cookie set by the backend just works.
    proxy: {
      "/create-token": API,
      "/me": API,
      "/logout": API,
      "/passkeys": API,
    },
  },
});
