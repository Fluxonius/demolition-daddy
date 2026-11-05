# Floating pet overlay (Electron) with a localhost fallback

- **Area:** ui
- **Owner (role ID):** ui
- **Status:** agreed
- **Builds on:** [foundation spec §2.2, §4.1, §4.4.1](../foundation-spec.md#22-decision)

## Goal
The pet is visible while the team works in Cursor's **Agents Window**, which does not load VS Code extensions. It floats on the desktop as a small transparent always-on-top window, and the same page can be opened in Cursor's built-in Browser tab.

## Why not inside Cursor (checked 2026-11-05)
- **Agents Window + extensions:** extensions don't load there, on purpose; Cursor staff recommend the Editor view for extension workflows ([forum](https://forum.cursor.com/t/extensions-in-agent-window/156603), [Agents Window docs](https://cursor.com/docs/agent/agents-window)). A sidebar webview is only visible in the classic editor.
- **Canvas:** a `.canvas.tsx` React file rendered beside the chat, but it may only import `cursor/canvas` and must not call `fetch()`; data is baked in when the agent writes it ([docs](https://cursor.com/docs/agent/tools/canvas)). It can't watch `state.json`, so no live pet.
- **Built-in Browser tab:** opens any `http://localhost` / `127.0.0.1` page (File > New Browser) ([docs](https://cursor.com/docs/agent/tools/browser)). This is our in-Cursor fallback.
- **Plugins:** bundle hooks, rules, skills and MCP servers; no custom UI surface ([docs](https://cursor.com/docs/plugins)).

## Behavior
- `npm start` opens a 220×260 transparent, frameless, always-on-top, non-resizable window at the bottom-right of the primary display. No Dock/taskbar icon; a tray (menu-bar) icon and a right-click menu offer show/hide, reset position and Quit. Not click-through.
- Drag the pet to move the window. Click to pet it (`ext.petInteraction`).
- The main process watches `$CURSOR_PET_DIR/state.json` and pushes every change to the page. The page sets `mood-<mood>` on `#root`, a load meter, the first `reasons` entry, and a bubble for `nudge.level >= 1` with **Let's go / Later**.
- State missing or `updatedAt` older than 2 min: grey "engine offline" look.
- `npm run serve` serves the same page on `http://127.0.0.1:4517/`; it polls `/state.json` every second and POSTs clicks to `/action`.
- Clicks become `ext.*` lines in `events.jsonl` (see `overlay/README.md`).

## Contract impact
None. Reads `PetState` (§4.4) from `state.json`; writes existing `ext.*` event types (§4.3).

## Files touched
`overlay/**` only. Change notes for other roles are in the foundation spec §4.4.1 and §6 (Q11–Q12).

## Test / demo check
- `cd overlay && npm test`.
- `CURSOR_PET_DIR=/tmp/pet npm run fake` + `CURSOR_PET_DIR=/tmp/pet npm start`: the pet cycles through all moods and shows nudges.
- Verified on Linux under Xvfb (moods, bubble, drag, click → event) and the fallback in headless Chrome. **Not yet run on macOS**: check transparency, tray icon and always-on-top over a full-screen Cursor.

## Open questions
- Should the overlay spawn the engine runner itself so the demo is one command? (needs `pet`'s runner first)
