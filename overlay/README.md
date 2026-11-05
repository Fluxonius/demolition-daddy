# overlay/ — floating desktop pet (Electron) + localhost fallback

Owner: role **`ui`**. Spec: [foundation §2.2, §4.1, §4.4.1](../docs/foundation-spec.md) and [ui-electron-overlay](../docs/specs/ui-electron-overlay.md).

The pet is a plain web page (`web/`: HTML + inline SVG + CSS) that renders `PetState` from `$CURSOR_PET_DIR/state.json` (default `~/.cursor-pet/state.json`). Two hosts show the same page:

| Host | Command | How it gets state | Where you see it |
|---|---|---|---|
| Electron overlay (main) | `npm start` | Main process watches `state.json` (`fs.watch` on the dir + 1 s poll) and pushes it over IPC | Transparent, frameless, always-on-top window, bottom-right of the screen |
| Localhost fallback | `npm run serve` | Page polls `GET /state.json` every second | Any browser, including Cursor's built-in Browser tab |

## Run

```bash
cd overlay
npm install          # Electron only; the binary downloads on the first `npm start`
npm start            # floating pet
npm run fake         # in another terminal: writes a fake state.json, cycling all moods every 4 s
npm run serve        # fallback: http://127.0.0.1:4517/ (PORT and HOST env override)
npm test             # node --test: watcher and action mapping
```

Use a scratch state dir while developing: `CURSOR_PET_DIR=/tmp/pet npm run fake` and `CURSOR_PET_DIR=/tmp/pet npm start`.

Preview a mood without any state: open the fallback with `?mood=tired` (or `egg`, `happy`, `focused`, `melting`, `sleeping`, `resting`).

In Cursor's Agents Window: **File > New Browser**, then go to `http://127.0.0.1:4517/`.

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
