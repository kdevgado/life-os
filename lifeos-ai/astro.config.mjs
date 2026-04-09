import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  integrations: [react()],
  vite: {
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: "auto",

        devOptions: {
          enabled: true,
        },

        workbox: {
          globPatterns: ["**/*"], // simpler, avoids mismatch warning
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
              src: "/icons/pwa-192.ico",
              sizes: "192x192",
              type: "image/x-icon",
              purpose: "any maskable"
            },
            {
              src: "/icons/pwa-512.ico",
              sizes: "512x512",
              type: "image/x-icon",
              purpose: "any maskable"
            }
          ]
        }
      })
    ]
  }
});