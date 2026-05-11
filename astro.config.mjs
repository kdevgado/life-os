import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  integrations: [react()],
  vite: {
    esbuild: {
      jsxDev: false,
    },
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: "script",
        devOptions: {
          enabled: false,
        },
        workbox: {
          globPatterns: ["**/*.{html,js,css,png,svg,ico,webp}"],
          navigateFallback: "index.html",
        },
        manifest: {
          id: "/",
          name: "LifeOS",
          short_name: "LifeOS",
          description: "LifeOS productivity and planning app",
          start_url: "/",
          scope: "/",
          display: "standalone",
          background_color: "#ffffff",
          theme_color: "#ffffff",
          shortcuts: [
            {
              name: "Quick Access",
              short_name: "Quick",
              description: "Open today's tasks and quick notes",
              url: "/quick",
              icons: [
                {
                  src: "/icons/pwa-192.png",
                  sizes: "192x192",
                  type: "image/png",
                },
              ],
            },
          ],
          icons: [
            {
              src: "/icons/pwa-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "/icons/pwa-192-maskable.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "maskable",
            },
            {
              src: "/icons/pwa-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "/icons/pwa-512-maskable.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
        },
      }),
    ],
  },
});
