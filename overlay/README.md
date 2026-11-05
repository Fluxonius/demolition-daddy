# overlay/ — floating desktop pet (Electron) + localhost fallback

Owner: role **`ui`**. Spec: [foundation §2.2, §4.1, §4.4.1](../docs/foundation-spec.md) and [ui-electron-overlay](../docs/specs/ui-electron-overlay.md).

The pet is a plain web page (`web/`: HTML + pixel-art SVG + CSS) that renders `PetState` from `$CURSOR_PET_DIR/state.json` (default `~/.cursor-pet/state.json`). Two hosts show the same page:

| Host | Command | How it gets state | Where you see it |
|---|---|---|---|
| Electron overlay (main) | `npm start` | Main process watches `state.json` (`fs.watch` on the dir + 1 s poll) and pushes it over IPC | Transparent, frameless, always-on-top window, bottom-right of the screen |
| Localhost fallback | `npm run serve` | Page polls `GET /state.json` every second | Any browser, including Cursor's built-in Browser tab |

## Run

```bash
cd overlay
npm install          # Electron only; the binary downloads on the first `npm start`
npm run demo         # pet + fake engine together, in a scratch state dir (quitting the pet stops both)
npm start            # floating pet
npm run fake         # in another terminal: writes a fake state.json, cycling all moods every 4 s
npm run serve        # fallback: http://127.0.0.1:4517/ (PORT and HOST env override)
npm test             # node --test: watcher, action mapping, sprite grid checks
npm run preview -- out.html   # standalone all-moods preview (one self-contained HTML file)
```

Use a scratch state dir while developing: `CURSOR_PET_DIR=/tmp/pet npm run fake` and `CURSOR_PET_DIR=/tmp/pet npm start`.

Preview without any state: add `?mood=tired` (or `egg`, `happy`, `focused`, `melting`, `sleeping`, `resting`), `?exercise=stretch` and/or `?overlays=nightcap,sweaty` to the page URL.

In Cursor's Agents Window: **File > New Browser**, then go to `http://127.0.0.1:4517/`.

## Editing the pet
Open `web/sprites.js`. One character is one pixel; colors are letters in `PALETTE` (`.` = transparent).
- `BODY` is the same for every mood (black by default). Moods change only the face.
- `FACES.<mood>` is a 10×6 grid drawn over the body at `FACE_ORIGIN`. Every mood in the contract needs one.
- `BLINK` is drawn over the face for 140 ms every few seconds (moods in `BLINK_MOODS`). Use `K` to paint over open eyes.
- `EXERCISES.<exercise>` (same 10×6 size) replaces the mood face during a guided break: when the user clicks **Let's go** on a nudge with an `exercise` (for 60 s), or while `onBreak` and `nudge.exercise` are set.
- `OVERLAYS.<name>` are small accessories with their own origin, drawn on top for each name in `PetState.overlays` (`stuffed`, `bored`, `sweaty`, `nightcap`). They never change the body.
- `Z` floats above the head in `Z_MOODS`.
- The pet is always fully opaque. Only the window background is transparent. A missing or stale state shows the `egg` face and an "engine offline" label.

Reload `web/preview.html` (open it directly, or via `npm run serve` at `/preview.html`) to see all moods. `npm test` catches ragged rows and unknown colors.

## States (use case → state → trigger → face)
The overlay derives what to show from `state.json` in `web/display.js`. One example per row lives in `web/states.js`; `npm run fake` cycles through all of them, `web/preview.html` shows them side by side, and `npm test` checks every row. Use cases are in `docs/specs/pet-use-cases.md`.

| State | Use case | Trigger (state.json / UI) | Face | Accessories | Bubble |
|---|---|---|---|---|---|
| `offline` | S12 engine offline | no state.json, or updatedAt > 2 min old | `offline` | `question` | — |
| `egg` | S1 not connected yet | mood 'egg' | `egg` | — | — |
| `hatched` | S1 first hook event | mood changes from 'egg' (2.5 s) | `surprised` | — | — |
| `happy` | UC1 idle | mood 'happy' (load < 30) | `happy` | — | — |
| `watching` | UC1 agent working | agentWorking, mood 'happy' or 'focused' | `watching` | — | — |
| `focused` | S3 focused session | mood 'focused' (load 30-60) | `focused` | — | — |
| `bored` | UC3 long wait | overlays has 'bored' (proposed) | `watching` | `bored` | — |
| `juggling` | S5 parallel agents | stats.parallelConvs >= 2 (2 or 3+ balls) | `focused` | `juggle3` | — |
| `stuffed` | UC2 token budget | overlays has 'stuffed' (proposed) | `happy` | `stuffed` | — |
| `tired` | UC4 long without a break | mood 'tired' (load 60-85) | `tired` | — | — |
| `asking` | UC3/UC4 break nudge (L1) | nudge.level 1, mood 'happy'/'focused'/'tired' | `asking` | — | nudge + buttons |
| `exercise` | S8 guided break | Let's go on a nudge with exercise (60 s), or onBreak + nudge.exercise | `exercise: stretch` | — | — |
| `resting` | S8 break taken | onBreak (mood resting) | `resting` | — | — |
| `welcome` | S8 back from a break | onBreak goes true -> false (6 s) | `celebrate` | `sparkles` | message |
| `loot` | S8 adventure loot | overlays has 'crown' (proposed) | `happy` | `crown` | — |
| `agent-done` | UC3 agent finished | nudge.kind 'agent-done' (proposed) | `alert` | `alert-mark` | message |
| `sweaty` | UC5 fix-it loop | overlays has 'sweaty' (proposed) | `asking` | `sweaty` | nudge + buttons |
| `melting` | UC4 90 min / S9 L2 | mood 'melting' (load 85-95) | `melting` | — | nudge + buttons |
| `urgent` | S10 urgent override | urgentUntil in the future (nudges muted) | `determined` | `helmet` | — |
| `nightcap` | UC6 late hour | overlays has 'nightcap' (proposed) | `asking` | `nightcap` | nudge + buttons |
| `sleeping` | UC6 bedtime + 2 h / S9 | mood 'sleeping' (load 95+ or late) | `sleeping` | `nightcap` | — |
| `locked` | S9 soft lock (L3) | lock.active | `sleeping` | `lock` | message |

Face priority when several apply: offline → hatched → exercise → welcome back → locked → agent done → asking → urgent → watching → mood. Clicking the pet shows `hearts` for 1.5 s. Two parallel agents show `juggle2` (two balls).

Not shown on the pet: S11 long chat (`preCompact` speaks in the chat, not in the overlay) and the snooze itself (the bubble just closes).

### Contract proposal for `pet` (not implemented in `contract/`)
The overlay already handles these fields if the engine writes them; nothing breaks if it doesn't.
- `PetState.overlays?: Array<'stuffed' | 'bored' | 'sweaty' | 'nightcap' | 'crown'>`. The first four are already proposed in `pet-use-cases.md`; `crown` is new (loot after a break, foundation Q7).
- `Nudge.kind: 'agent-done'` (already proposed in `pet-use-cases.md`) → `alert` face, bubble without buttons.
- Keep `nudge.exercise` set while `onBreak` during a guided break, so the exercise face shows even after a restart.
- No change needed for: `agentWorking` (watching), `stats.parallelConvs` (juggling), `urgentUntil` (urgent), `lock` (locked), `onBreak` (resting / welcome back).

## Controls (Electron)
- **Drag** the pet to move the window. **Click** the pet to pet it.
- **Right-click** the pet, or use the tray/menu-bar icon: show/hide, move back to bottom-right, DevTools, **Quit**.
- macOS: no Dock icon (accessory app); the window stays above other apps and follows you across Spaces.

## Files
| Path | What |
|---|---|
| `main.js` | Electron main: window, tray, `state.json` watcher, IPC (drag, menu, actions) |
| `preload.js` | Exposes `window.petHost` (`onState`, `send`, `dragBy`, `showMenu`) to the page |
| `web/` | The pet page. Mood = class `mood-<mood>` on `#root`; `offline` when state is missing or older than 2 min |
| `web/sprites.js` | **Pixel art, edit by hand.** Palette, body grid, one face grid per mood, blink frame, sleep "z" |
| `web/pixel.js`, `web/pixel.css` | Renders grids to crisp SVG `<rect>`s; idle bob and "z" float animations |
| `web/display.js` | `displayState(state, ui)`: PetState → face, exercise, accessories, bubble |
| `web/states.js` | One example state per use case (fake writer, preview and tests use it) |
| `web/preview.html` | Every state side by side (`?still`, `?dark`) |
| `serve.mjs` | Zero-dependency HTTP server for the fallback: static `web/`, `GET /state.json`, `POST /action` |
| `lib/pet-dir.js` | `CURSOR_PET_DIR` resolution, `readState()`, `watchState()` |
| `lib/actions.js` | Maps `FromWebview` messages to `ext.*` `PetEvent`s and appends them to `events.jsonl` |
| `scripts/fake-state.mjs` | Fake engine for UI work and demos |

## Button clicks
With no extension host, the overlay appends user actions straight to `events.jsonl` as `PetEvent`s with `src: "ext"` and `data.window: "overlay"`:

| Page message | Event |
|---|---|
| `nudgeAccepted`, `action: startBreak` | `ext.breakStart` (`minutes: 1`) |
| `nudgeDismissed`, `action: snooze` | `ext.snooze` |
| `action: urgent` | `ext.urgentStart` (`minutes: 30`) |
| `action: pet` / `feed` | `ext.petInteraction` |
| `action: calibrateFine` / `calibrateDrained` | `ext.calibrate` |
