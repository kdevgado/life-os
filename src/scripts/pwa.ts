// src/scripts/pwa.ts
import { registerSW } from "virtual:pwa-register";

if (typeof window !== "undefined") {
  registerSW({
    immediate: true,
  });
}