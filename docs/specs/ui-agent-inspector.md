# Agent Inspector window

- **Area:** ui (window, simulated events, engine spawn) + a marked reasoning-log hook in the pet runner
- **Owner (role ID):** ui
- **Status:** done
- **Builds on:** [foundation §4.3–4.4.1](../foundation-spec.md), [ui-settings](ui-settings.md), [hooks-fatigue-signals](hooks-fatigue-signals.md)

## Goal
Show judges, live, that Pixel is driven by real Cursor hook events that an AI agent (the Cursor CLI, with the local rules engine as fallback) analyzes.

## Behavior
- **Open:** hover the pet and click **AI** (next to ⚙), right-click → **Demo / Agent Inspector…**, or tray menu. `npm start -- --inspector` opens it at launch; `--scenario` also plays the story.
- **Header badges:** LIVE (real hooks) or SANDBOX (simulated events); engine status (spawned pid, external runner or stopped); AI status from the latest `llm` log entry: Cursor CLI ✓, or "unavailable (reason) → fallback: local rules engine".
- **Pane 1, hook events:** tail of `events.jsonl` (newest first), with the type, key numeric fields and conversation id, tagged REAL HOOK, PET UI or SIMULATED.
- **Pane 2, agent reasoning:** tail of `agent-log.jsonl`: `start`, `llm-request`, `llm` (the numbers-only snapshot sent to the Cursor CLI, its JSON answer, duration or error) and `decision` (metrics received, source badge, load → mood and why, conditions with evidence, nudge).
- **Pane 3, pet state:** the mood face, load meter, "decided by" badge, the latest why, the nudge text as a bubble, and clicks (`actions.jsonl` and overlay `ext.*` events).
- **Simulate buttons:** each one appends `data.simulated: true` PetEvents, stamped relative to now, to the sandbox `events.jsonl` (`$TMPDIR/napcat-sandbox`). The app switches the pet, the watchers and the engine to the sandbox. Clicks add up; **Reset sandbox** clears it. **Late night** restarts the sandbox engine with `TZ` set so the local clock reads 23:00. **Back to live** returns to the real pet dir.
- **Play scenario (~60 s):** reset, then fresh (0 s) → 40 min of focused work (8 s) → 75 min with no break and faster prompts, so the pet is tired and nudges (20 s) → `ext.breakStart` (36 s) → `ext.breakEnd` + "I'm fine" (50 s), so the pet says welcome back.
- **Engine spawn:** `overlay/lib/engine.js` forks `engine/scripts/run.mjs --dir <dir> --every 2 --llm` with Electron's Node (`ELECTRON_RUN_AS_NODE`) and adds `~/.local/bin` to `PATH` for `agent`. It skips the spawn if another runner wrote `state.json` within 30 s. The packaged app ships `engine/` and `hooks/` as `extraResources`. On a packaged first launch (no `state.json`), it plays the scenario in the sandbox.

## Contract impact
New file `<petDir>/agent-log.jsonl`, written by the engine runner and read by the overlay. Its lines are `{ v: 1, ts, kind: 'start' | 'llm-request' | 'llm' | 'decision', metrics?, source?, load?, mood?, why?, conditions?, nudge?, cli? }`. It holds numbers, ids and the model's JSON answer only, never prompt text, and rotates at 2 MB. Simulated events add `data.simulated: true` (an unknown key, ignored by telemetry).

## Files touched
ui: `overlay/lib/{engine,inspector,simulate}.js`, `overlay/main.js`, `overlay/preload{,-inspector}.js`, `overlay/web/inspector.{html,css,js}`, `overlay/web/{index.html,pet.js,pet.css}`, `overlay/package.json`, `overlay/test/inspector.test.js`, this spec.
**pet (outside ui, approved by the human for this demo):** `engine/scripts/run.mjs`, where a block marked "Agent Inspector reasoning log" writes `agent-log.jsonl` and wraps the Cursor CLI `complete`; and `README.md`, the "See the agent think" judges step.

## Test / demo check
`cd overlay && npm test` covers simulations, the scenario mood arc through the real runner, the log, `tail` and the AI status. Run `CURSOR_PET_DIR=/tmp/pet npm start -- --inspector --scenario` to watch it.
