import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [
    react(),
    {
      name: "development-csp",
      apply: "serve",
      transformIndexHtml: (html) =>
        html.replace(
          /<meta\s+http-equiv="Content-Security-Policy"[^>]*\/>/,
          "",
        ),
    },
  ],
  base: "./",
  server: { port: 5173, strictPort: true },
});
