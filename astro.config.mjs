import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  integrations: [react()],
  vite: {
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
          icons: [
            {
              src: "/icons/pwa-192.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any",
            },
            {
              src: "/icons/pwa-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any",
            },
          ],
        },
      }),
    ],
  },
});