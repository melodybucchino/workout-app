# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Personal workout tracker: a mobile-first PWA for one person's iPhone. Plain HTML/CSS/ES modules, no build step, no dependencies, no backend. All data lives on the device in IndexedDB.

## Commands

- **Preview locally:** `node serve.mjs` → http://localhost:8080. It also prints a LAN address for the phone. Python's `http.server` can't accept connections on this Mac, so don't use it.
- **Syntax-check a module:** `node --check` treats `.js` as CommonJS here, so copy the file to a `.mjs` path first. For example: `cp js/views/log.js /tmp/x.mjs && node --check /tmp/x.mjs`.
- **Deploy:** commit and `git push origin main`. GitHub Pages serves `main` at https://melodybucchino.github.io/workout-app/. To confirm the build finished: `gh api repos/melodybucchino/workout-app/pages/builds/latest --jq '.status + " " + .commit[0:7]'`. `gh` is installed at `~/.local/bin/gh`, because Homebrew is broken on this Mac.
- **Tests:** there's no test suite in the repo. Changes have been verified by driving headless Chrome (`/Applications/Google Chrome.app`) over the DevTools protocol at a 390×844 iPhone viewport:
  - Node is v18, so there's no global `WebSocket`; a minimal CDP client is needed.
  - Use a fresh `--user-data-dir` for each run.
  - Kill stray `--remote-debugging-port` Chromes after a crashed run, or the next run attaches to the stale browser.
  - Test dates are relative to the real "today", so avoid hard-coding it.

## Shipping a change

1. Bump `VERSION` in `sw.js` for every deploy.
2. Add any new file to `FILES` in `sw.js`, or it won't work offline.
3. The service worker serves from the cache and refreshes in the background (bypassing GitHub Pages' 10-minute HTTP cache). The user therefore sees an update on the second launch; on iPhone that means force-closing the app between launches.

## Architecture

- **Routing:** `js/app.js` is a hash router. Each view in `js/views/` is `async (ctx) => {}`, and `ctx` provides:
  - `app` (root element), `params`, `query`
  - `alive()`: check it after every `await`, so a stale render doesn't overwrite a newer one
  - `onLeave(fn)`: cleanup, such as flushing autosaves
  - `rerender()`

  Views write `innerHTML` and attach listeners. Small module-level UI state (calendar month, filter chips) lives in `ui` in `util.js`.
- **Storage:** `js/db.js` wraps four IndexedDB stores: `templates` (saved workouts), `logs` (one per workout done on a date), `settings` (key/value) and `steps` (daily step counts keyed by date, separate from workouts and not shown as calendar dots). Views load whole stores with `getAll` and filter in memory. Adding a store means bumping `DB_VERSION` and creating it in `onupgradeneeded`; add it to `STORES` (so import clears it), to the object `exportAll` returns, and to `importAll`, which must tolerate older backups that lack it.
- **Logs are snapshots.** Adding a workout to a day (`createLog` in `views/add.js`) copies the template's title, exercises and activity into the log. Editing or deleting a template must never change existing logs. This is a hard user requirement.
- **"Last time" and pre-fill:**
  - `priorLogs` (in `util.js`) finds earlier logs with the same `templateId`, `type` and `activity`.
  - `previousExercise` matches an exercise by `exId` (a link to the template exercise's `id`) or by name, and only within the same measure (reps vs time).
  - Renames keep their history through `exId`. `createLog` must pass `{ exId: e.id, ... }`, because template exercises store the link as `id`.
- **Workout types** (`TYPES` in `util.js`):
  - `strength` and `core` are "exercise types" (`isExerciseType`). Each exercise has sets with `kg` plus `reps`, or plus `sec` when `mode: 'time'`. `perSide: true` means reps and weight are for one side; `volumeKg` counts those sets twice.
  - `cardio` logs carry an `activity`. Each activity's fields, colour and calculated value (pace/speed) are config in `js/cardio.js`; the log form, day card, summaries and Edit screen are all generated from it. Add a cardio activity by adding config there, not new logic.
  - `mobility` and `class` record a duration in minutes.
- **Migrations:** data migrations live in `js/migrate.js`. They must be idempotent, and they run on every launch (each wrapped in `try`/`catch` so they can't block startup) and again after a backup import in `views/settings.js`. Older backups and devices still hold old shapes, such as `type: 'run'` / `'walk'` and exercises without `exId`, so a new shape change needs a migration added here.
- **Units:** weights are always stored in kg. The lbs setting only converts for display and entry (`kgToDisplay`/`displayToKg`).
- **Dates:** stored as local `YYYY-MM-DD` keys. Weeks start on Monday. Date labels are built by hand in `fmt`, because browsers disagree on short month names ("Sep" vs "Sept").
- **Circular import:** `util.js` and `cardio.js` import each other. That only works because nothing is called at module top level, and `cardio.js` only references `util.js` function declarations there. Keep it that way.

## UI conventions

- Design tokens and the per-type colours (`--strength`, `--core`, `--cardio`, …) are in `styles.css`.
  - **Calendar dots:** coloured by category.
  - **Cardio activity shades:** applied inline from `cardio.js`.
- Reference screenshots of the original design are in `design/`. That folder is gitignored and kept private.
- Fonts are self-hosted in `fonts/` so they work offline: Bricolage Grotesque for titles and big numbers, DM Sans for everything else.
- iPhone constraints:
  - Tap targets are at least 44px.
  - Inputs are at least 16px, to stop iOS zooming in.
  - Number fields use `inputmode`. The iOS number pad has no colon, so time inputs insert colons as digits are typed (`digitsToTime`, `holdDigits`).
- `confirm()` is used for destructive template and log actions. Removing a set uses an Undo toast instead.
- The user isn't a command-line user. Explain changes in plain terms, and tell them to force-close and reopen the app to get an update.
