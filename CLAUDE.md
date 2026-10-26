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

  Views write `innerHTML` and attach listeners. Small module-level UI state (calendar month, the week shown in the calendar summary, filter chips) lives in `ui` in `util.js`.
- **Storage:** `js/db.js` wraps four IndexedDB stores: `templates` (saved workouts), `logs` (one per workout done on a date), `settings` (key/value) and `steps` (daily step counts keyed by date, separate from workouts and not shown as calendar dots). Views load whole stores with `getAll` and filter in memory. Adding a store means bumping `DB_VERSION` and creating it in `onupgradeneeded`; add it to `STORES` (so import clears it), to the object `exportAll` returns, and to `importAll`, which must tolerate older backups that lack it.
- **Logs follow their saved workout.** A log stores its `templateId` and, per exercise, `exId` (the saved exercise's permanent `id`), plus its own numbers: sets, weights, reps, distances, times, feel and notes. Template edits never change those.
  - **Names come from the current template.** Title, exercise names and type (between `strength` and `core` only) are filled in at read time by `withCurrentNames` in `js/names.js`. Views load logs with `loadLogs()`, never `db.getAll('logs')`, so a rename shows everywhere: calendar, day, log screen, weekly summary and Progress.
  - **Last known names.** Logs also keep `title` and exercise `name` as last known names, for when the workout is deleted or an exercise is removed from it. `stampNames()` refreshes them; it runs on template Save, before Delete and in the link migration.
  - **What edits affect.** Removing an exercise from a template leaves it, with its data, in past logs. Adding one only affects new logs; old logs never get empty rows. Deleting a template keeps its logs under their last known name.
  - **Creating a log.** `createLog` in `views/add.js` copies the template's exercises (ids and names) as the starting point for a new log.
- **"Last time" and pre-fill:**
  - `priorLogs` (in `util.js`) finds earlier logs with the same `templateId`, `type` and `activity`.
  - `previousExercise` matches by `exId` only. Exercises without a link fall back to matching each other by name, and only within the same measure (reps vs time). `createLog` must pass `{ exId: e.id, ... }`, because template exercises store their id as `id`.
  - Progress (`js/stats.js`) groups by `exId` and also joins exercises sharing a current name, so the same exercise in two workouts has one history.
- **Merge exercises** (Settings): lists log exercise names not linked to any current template exercise (old spellings, removed exercises, deleted workouts) and links a chosen group to a saved exercise (`unmatchedExercises` / `mergeExercise` in `names.js`). Names are never matched by guessing.
- **Workout types** (`TYPES` in `util.js`):
  - `strength` and `core` are "exercise types" (`isExerciseType`). Each exercise has sets with `kg` plus `reps`, or plus `sec` when `mode: 'time'`. `perSide: true` means reps and weight are for one side; `volumeKg` counts those sets twice.
  - `cardio` logs carry an `activity`. Each activity's fields, colour and calculated value (pace/speed) are config in `js/cardio.js`; the log form, day card, summaries and Edit screen are all generated from it. Add a cardio activity by adding config there, not new logic.
  - `mobility` and `class` record a duration in minutes.
- **Progress tab** (`views/progress.js`): charts are hand-drawn inline SVG (no chart library, so it works offline). Strength history and personal records come from `js/stats.js`, which groups the same exercise across workouts and renames (by `exId` or name). A record is the heaviest set, with ties broken by reps. The log screen uses `priorBests` from the same module for its "New PR!" tag and toast. The Workouts overview at the top works out each strength workout's % change from that workout's own sessions in the range, so a card's figure is the average of the exercise rows it opens to. The weekly summary's Strength progress uses the same per-exercise % (top-set weight, under 1% counts as same).
- **Migrations:** data migrations live in `js/migrate.js`. They must be idempotent. Older backups and devices still hold old shapes, such as `type: 'run'` / `'walk'` and exercises without `exId`, so a new shape change needs a migration added here.
  - **Every launch:** `migrateCardio` runs, wrapped in `try`/`catch` so it can't block startup.
  - **One-time link migration:** `runLinkMigration` links logs to templates by exact title, and exercises by exact name, then stamps names. It's started from a card on the calendar that saves a JSON backup first (`saveFile` in `util.js`), and it sets the `linkedLogs` setting when done.
  - **After a backup import:** `views/settings.js` runs `migrateCardio` and `linkAllLogs`.
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
