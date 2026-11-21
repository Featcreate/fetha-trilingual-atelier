import netlify from "@netlify/vite-plugin-tanstack-start";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const isNetlifyBuild = process.env.NETLIFY === "true";

export default defineConfig({
  nitro: isNetlifyBuild ? false : { preset: "node-server" },
  tanstackStart: {
    server: { entry: "server" },
  },
  vite: {
    plugins: isNetlifyBuild ? [netlify()] : [],
    server: {
      allowedHosts: ["fetha-trilingual-atelier-2.onrender.com"],
    },
  },
});
