import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/postcss";
import { buildOverview } from "../core/overview.ts";
import { screenshotItems } from "./fixtures.ts";

// Standalone preview: no app server, database, extension, or retailer requests.
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  publicDir: fileURLToPath(new URL("../public", import.meta.url)),
  css: { postcss: { plugins: [tailwindcss()] } },
  server: { host: "127.0.0.1", port: 4317, strictPort: true },
  build: { outDir: "../.build/screenshot-preview", emptyOutDir: true },
  plugins: [react(), {
    name: "synthetic-screenshot-api",
    configureServer(server) {
      const now = Date.now();
      const items = screenshotItems(now);
      server.middlewares.use((req, res, next) => {
        res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws://127.0.0.1:4317; font-src 'self' data:; object-src 'none'; form-action 'none'");
        const url = new URL(req.url ?? "/", "http://127.0.0.1:4317");
        if (!url.pathname.startsWith("/api/")) return next();
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "This screenshot preview is read-only." }));
        } else if (url.pathname === "/api/items") {
          res.end(JSON.stringify({ items }));
        } else if (url.pathname === "/api/items/history") {
          res.end(JSON.stringify({ history: items.find(item => item.id === url.searchParams.get("id"))?.history ?? [] }));
        } else if (url.pathname === "/api/overview") {
          res.end(JSON.stringify(buildOverview(items, now, url.searchParams.get("clubId") ?? undefined, url.searchParams.get("includeArchived") === "1")));
        } else {
          res.statusCode = 404;
          res.end(JSON.stringify({ error: "Unavailable in the synthetic preview." }));
        }
      });
    },
  }],
});
