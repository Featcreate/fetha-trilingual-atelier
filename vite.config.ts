import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    server: {
      allowedHosts: ["fetha-trilingual-atelier-5.onrender.com"],
    },
  },
});
