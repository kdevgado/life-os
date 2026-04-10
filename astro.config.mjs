import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  integrations: [react()],
  vite: {
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: false,
        devOptions: {
          enabled: true,
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
            {
              src: "/icons/pwa-192-maskable.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "maskable",
            },
            {
              src: "/icons/pwa-512-maskable.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable",
            },
          ],
          screenshots: [
            {
              src: "/screenshots/desktop-wide.png",
              sizes: "1280x720",
              type: "image/png",
              form_factor: "wide",
              label: "LifeOS desktop workspace",
            },
            {
              src: "/screenshots/mobile-home.png",
              sizes: "540x1200",
              type: "image/png",
              label: "LifeOS mobile workspace",
            },
          ],
        },
      }),
    ],
  },
});
