import { defineConfig } from "astro/config";
import solid from "@astrojs/solid-js";

export default defineConfig({
  integrations: [solid()],
  output: "static",
  vite: {
    define: {
      __API_BASE__: JSON.stringify(process.env.PUBLIC_API_BASE ?? ""),
    },
    server: {
      proxy: {
        "/api": "http://localhost:8787",
      },
    },
  },
});
