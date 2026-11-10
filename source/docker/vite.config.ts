import { defineConfig } from "vite";
import vinext from "vinext";
import tailwindcss from "@tailwindcss/postcss";
import { fileURLToPath } from "node:url";

// Separate from the Windows D1 configuration; no Cloudflare service is contacted.
export default defineConfig({
  plugins: [vinext()],
  css: { postcss: { plugins: [tailwindcss()] } },
  resolve: { alias: { "cloudflare:workers": fileURLToPath(new URL("../server/container-env.ts", import.meta.url)) } },
});
