# Settings window

- **Area:** ui (window, file) + contract proposal for pet and hooks
- **Owner (role ID):** ui
- **Status:** draft (window done; engine/hooks wiring proposed)
- **Builds on:** [foundation spec §4.5–4.7](../foundation-spec.md#45-pet-state-model), [pet use cases → Settings](pet-use-cases.md#settings)

## Goal
One small pixel-styled window where the user tunes how the pet watches their AI-work fatigue: quiet hours, work rhythm, thresholds, nudge intensity, breaks and the opt-in soft prompt-lock.

## Behavior
- **Open:** right-click the pet → **Settings…** (Quit stays in the same menu); the ⚙ button that appears while hovering the pet; the tray / menu-bar icon menu (on Windows/Linux a left click on the tray icon opens it too). `npm start -- --settings` opens it at launch.
- **Window:** separate frameless Electron window (`overlay/web/settings.html`), always on top, Esc / × / Done close it.
- **Save:** every change is validated and written immediately (atomic tmp + rename) to `$CURSOR_PET_DIR/settings.json` (default `~/.cursor-pet/settings.json`). Invalid values are clamped or replaced with defaults. **Defaults** restores the table below.
- **Hand edits:** the overlay polls the file once a second, so editing `settings.json` by hand updates both windows.
- **Soft prompt-lock** is **off by default**, shown with an orange warning, and enabling it asks for confirmation.
- **Applied live by the overlay (ui):** `pet.name` (window title, a11y label), `pet.sound` (8-bit chirp on each new nudge), `pet.showMeter`, and `night.quietHours` as a UI-side safety net: inside quiet hours the overlay hides nudge bubbles and shows the sleeping face (except `resting`/`egg`).

## Contract impact — PROPOSAL for `pet` and `hooks` (contract change)
**Status: proposed, not yet in `contract/`.** The `ui` role does not edit `engine/`, `hooks/` or `contract/`. Suggested additive change, in a separate `contract: …` PR by `pet`:

- New file `<petDir>/settings.json`, **written only by the overlay**, read by the engine (and by the hook for `lock.enabled`).
- Readers must treat a missing or unparsable file as "all defaults", ignore unknown keys and clamp out-of-range values (the reference implementation is `normalize()` in `overlay/lib/settings.js`).
- `version: 1`. Future changes are additive; a breaking change bumps `version`.
- Proposed `contract/settings.ts`: `export interface PetSettings { version: 1; pet: {...}; night: {...}; work: {...}; load: {...}; nudges: {...}; breaks: {...}; lock: {...} }` mirroring the table below.

Mapping to existing engine options (`createPetEngine`, [pet-use-cases](pet-use-cases.md#settings)): `tokenBudget` ← `load.tokenBudget`, `longWaitMin` ← `work.longWaitMin`, `breakReminderMin` ← `work.breakReminderMin`, `bedtime` ← `night.lateNightWarning ? night.bedtime : "off"`, `wakeTime` ← `night.wakeTime`.

New knobs for `pet` (defaults equal today's spec constants, so adopting them changes nothing until a user edits them):
- `load.tiredAt` / `load.overworkedAt` — mood thresholds for `tired` (60) and `melting` (85), §4.5.
- `work.overworkMin` — L2 at 90 min without a break (UC4).
- `load.fixLoopPrompts` — frustrated prompts in 10 min that make a fix loop (UC5, 3).
- `load.maxParallelAgents` — parallel conversations before the parallel-agents warning (3, BCG).
- `nudges.intensity` — highest ladder level: `off` = L0, `gentle` = L1, `normal` = L2, `persistent` = L3 (only when `lock.enabled`).
- `nudges.cooldownMin` (10), `nudges.snoozesToEscalate` (2), `nudges.urgentMuteMin` (30–60 → 45), §4.6.
- `night.quietHours`, `night.quietStart`, `night.quietEnd` — engine should emit no nudges (except `agent-done`) and may force `sleeping`.
- `breaks.exerciseSec` (60), `breaks.longBreakMin` (5), `breaks.exercises` — rotate only enabled exercises (never empty).
- `lock.enabled` (false), `lock.bypassesPerDay` (3), `lock.unlockSec` (60), §4.7. `hooks` should only ever lock when `lock.enabled` is true **and** `state.json` has an active lock.

### Fields

**Pet**

| Key | Type | Default | Range | Read by |
|---|---|---|---|---|
| `pet.name` | text | `"Pixel"` | ≤ 16 chars | ui |
| `pet.sound` | bool | `false` |  | ui |
| `pet.showMeter` | bool | `true` |  | ui |

**Night & quiet hours**

| Key | Type | Default | Range | Read by |
|---|---|---|---|---|
| `night.lateNightWarning` | bool | `true` |  | pet |
| `night.bedtime` | time | `"22:00"` | `HH:MM` | pet |
| `night.wakeTime` | time | `"06:00"` | `HH:MM` | pet |
| `night.quietHours` | bool | `true` |  | ui+pet |
| `night.quietStart` | time | `"00:00"` | `HH:MM` | ui+pet |
| `night.quietEnd` | time | `"07:00"` | `HH:MM` | ui+pet |

**Work rhythm**

| Key | Type | Default | Range | Read by |
|---|---|---|---|---|
| `work.breakReminderMin` | number | `50` | 10–180 min | pet |
| `work.overworkMin` | number | `90` | 20–300 min | pet |
| `work.longWaitMin` | number | `3` | 1–30 min | pet |

**Load thresholds**

| Key | Type | Default | Range | Read by |
|---|---|---|---|---|
| `load.tiredAt` | number | `60` | 30–95 % | pet |
| `load.overworkedAt` | number | `85` | 40–100 % | pet |
| `load.tokenBudget` | number | `100000` | 0–10000000 tokens | pet |
| `load.fixLoopPrompts` | number | `3` | 2–20 /10 min | pet |
| `load.maxParallelAgents` | number | `3` | 1–10 agents | pet |

**Nudges**

| Key | Type | Default | Range | Read by |
|---|---|---|---|---|
| `nudges.intensity` | select | `"normal"` | `off`, `gentle`, `normal`, `persistent` | pet |
| `nudges.cooldownMin` | number | `10` | 2–120 min | pet |
| `nudges.snoozesToEscalate` | number | `2` | 1–10 snoozes | pet |
| `nudges.urgentMuteMin` | number | `45` | 10–240 min | pet |

**Breaks**

| Key | Type | Default | Range | Read by |
|---|---|---|---|---|
| `breaks.exerciseSec` | number | `60` | 20–300 s | pet |
| `breaks.longBreakMin` | number | `5` | 1–60 min | pet |
| `breaks.exercises` | multi | `["eyes-20-20-20","cyclic-sigh","stretch"]` | `eyes-20-20-20`, `cyclic-sigh`, `stretch` | pet |

**Soft prompt-lock**

| Key | Type | Default | Range | Read by |
|---|---|---|---|---|
| `lock.enabled` | bool | `false` |  | pet+hooks |
| `lock.bypassesPerDay` | number | `3` | 1–20 /day | pet |
| `lock.unlockSec` | number | `60` | 15–300 s | pet |

## Files touched
`overlay/lib/settings.js`, `overlay/main.js`, `overlay/preload.js`, `overlay/preload-settings.js`, `overlay/web/settings.{html,css,js}`, `overlay/web/index.html`, `overlay/web/pet.{js,css}`, `overlay/test/settings.test.js`, `overlay/README.md`, this spec.

Change requests (not made here): `pet` — read `settings.json` in the engine runner and add `contract/settings.ts`; `hooks` — gate the prompt-lock on `lock.enabled`.

## Test / demo check
- `cd overlay && npm test` covers defaults, validation, atomic writes and wrap-around quiet hours.
- `CURSOR_PET_DIR=/tmp/pet npm start -- --settings`, toggle something, then `cat /tmp/pet/settings.json`.

## Open questions
- Should quiet hours also pause load drift, or only mute nudges?
