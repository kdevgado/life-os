# Implement widget experience starting with mobile PWA quick access page

## Goal

Build LifeOS toward a true mobile widget experience in three steps:

1. Ship a mobile-first PWA quick access page for today's tasks and notes.
2. Wrap the PWA with Capacitor for Android and iOS app shells.
3. Add native Android App Widget and iOS WidgetKit support.

## Phase 1: PWA quick access

- Confirmed existing PWA foundations:
  - `public/manifest.webmanifest` exists.
  - Manifest uses `display: standalone`.
  - `vite-plugin-pwa` is configured in `astro.config.mjs`.
  - `AppShell.astro` registers `/sw.js` during production builds.
- Added `/quick` and `/widget` routes for a mobile widget-style surface.
- Quick access supports:
  - Today's task summary.
  - Recent notes summary.
  - Quick add task for today.
  - Quick note capture.
  - Large tap targets and narrow-screen layout.

## Phase 2: Native wrapper

- Add Capacitor.
- Configure Android and iOS app projects.
- Bundle the current PWA and set the app start route to `/quick` where useful.
- Verify home-screen launch speed and offline shell behavior.

## Phase 3: Native widgets

- Android: create an App Widget with a quick task summary and add action.
- iOS: create a WidgetKit extension with today's items and a tap target back into LifeOS.

## Verification checklist

- Build passes with the quick access routes.
- Install the production PWA on a phone.
- Open `/quick` from the installed app.
- Add a task and note from mobile.
- Confirm the task and note appear in the main LifeOS experience.
