# Demolition Daddy — Foundation Spec

Status: **v1, frozen for the hackathon start.** Changes go through a PR titled `docs: foundation …` and are announced in team chat.
Audience: the three teammates and their coding agents. Every feature spec in [`docs/specs/`](specs/) builds on this document.

**TL;DR**
- A Tamagotchi-style pet that lives in Cursor's sidebar and gets tired *with* you while you work with AI coding agents. It recovers only when *you* rest. Pitch line: *"Other coding pets eat your tokens. Ours eats your breaks."*
- Integration: **Cursor Hooks → local JSONL event log → VS Code extension (engine + sidebar webview + status bar).** Hooks are the only way to see agent activity; the extension is the only good place for UI and window-focus signals.
- The pet never dies, never guilts, never blocks by default. The optional soft prompt-lock is opt-in and has an override.
- Three roles with stable IDs and non-overlapping folders (§5.2):
  - **`ui`** (Design & UI): how everything looks.
  - **`hooks`** (Cursor hooks & events): what we observe from Cursor.
  - **`pet`** (Pet behavior & glue): what the pet feels and does, and the wiring between the other two. `pet` is the integrator: it stewards `contract/` and merges to `main`.
- Everyone builds against fixtures in `contract/`, so nobody waits for anybody.

---

## 1. Vision

### 1.1 Problem
AI agents shift developer work from *creating* to *supervising*: deciding what to ask, reading agent output, reviewing diffs, waiting. Supervision is the part most strongly linked to fatigue ("AI brain fry", HBR/BCG 2026; CHI 2026 "When Help Hurts"). People in this mode also misjudge themselves: in METR's 2025 study developers were 19% slower with AI but believed they were 20% faster. Self-assessment is unreliable, so an external, friendly signal helps.

Existing break reminders (Stretchly, Workrave, TomoBreak) only know time and keystrokes. Existing Cursor pets (Codogotchi, cursor-gotchi, CursorToys Pet, Buddy, tokengotchi) reward *more* AI usage and punish absence. Nobody uses the agent's own rhythm (prompt → wait → read → decide) to time breaks.

### 1.2 Product in one paragraph
A small pet in the Cursor sidebar mirrors your cognitive load. Every prompt you send, every long answer you read, every file the agent edits, every aborted run and every hour without a break makes it more tired. When load is high, the pet asks you to step away, and it does this only at natural boundaries: while the agent is working, or right after it stops. When you take a break, the pet rests too, recovers, and may bring something back. It is a mirror, not a nag.

### 1.3 Target user
- **Primary:** a developer or indie hacker who spends 4+ hours a day in Cursor's agent chat, often with several agents in parallel, often late.
- **Secondary (not MVP):** heavy users of other agent tools (Claude Code, Codex) and team leads.
- **Not our user:** someone who needs strict RSI enforcement. Workrave already covers that.

### 1.4 Principles
1. **The pet never dies and progress is never lost.** The worst state is "asleep on the Send button". One break brings it back.
2. **No guilt, no moralizing, no medical claims.** We show "load", not a diagnosis. Tone: playful, short, varied.
3. **Interrupt only at task boundaries.** Agent is working, agent just stopped, or user is about to send the next prompt. Never while the user is typing or editing.
4. **Always snoozable.** Every nudge has a "Later". Escalation is gradual (see §4.6).
5. **Blocking is opt-in and escapable.** The soft prompt-lock is off by default, has an override keyword, and fails open.
6. **Breaks are rewarded, work is not.** Loot and growth come only from rest, never from tokens or prompts.
7. **Natural breaks count.** Leaving Cursor unfocused for a few minutes counts as a break without any button press.
8. **Privacy first, local only.** We never store prompt or response text. We store lengths, counts, durations and boolean flags. Nothing leaves the machine.
9. **Fail-open everywhere.** If our hook crashes or the extension is off, Cursor works exactly as before.
10. **Vary everything.** Identical reminders stop being noticed after the second time (Anderson et al., CHI 2015). Rotate lines, poses and break exercises.

### 1.5 Non-goals (hackathon)
- A standalone desktop overlay window (Electron/Tauri).
- Support for tools other than Cursor (IDE agent chat). Cursor CLI works through the same hooks, but we don't target it.
- ML or LLM analysis of mood. A local keyword regex is enough for "frustration".
- An economy, shop, achievements, multiplayer, statistics dashboard or settings UI beyond a couple of toggles.
- Multiple characters, evolution stages, customization.
- Cloud agents. Project hooks load at agent start there, and `beforeSubmitPrompt` does not apply.
- Any health or productivity claim we can't support.

---

## 2. Integration decision

### 2.1 Options evaluated

| Option | Sees agent activity? | Can show UI? | Can detect breaks? | Cost in 2 h | Verdict |
|---|---|---|---|---|---|
| **Cursor Hooks** (`hooks.json`) | **Yes, push-based**: prompts, agent stops, responses, file edits, tools, subagents, sessions, compaction | Very limited: `preCompact.user_message`, `beforeSubmitPrompt` block message | No | Low; prototype measured at ~28 ms per call | **Use as the signal source** |
| **VS Code extension** (runs in Cursor) | No. `vscode.cursor` only exposes `mcp.registerServer` and `plugins.registerPath` | **Yes**: sidebar webview, status bar, notifications with buttons | **Yes**: `window.onDidChangeWindowState`, typing activity | Medium | **Use as host for engine and UI** |
| **Cursor plugin** (`.cursor-plugin/plugin.json`) | Bundles hooks, rules, MCP; same signals as hooks | No webview UI by itself | No | Low–medium | **Post-hackathon packaging** ("one-click install") |
| **Skills / rules** (`.cursor/rules/*.mdc`, skills) | No; they only add text to the agent's context | No | No | Low | **Not a signal source.** Useful for repo conventions only |
| **MCP server** | Only when the agent decides to call a tool (pull, not push); can't see waiting or reading time | No | No | Medium | **Optional bonus**: an agent can ask "is my human tired?" and answer shorter. Register from the extension |
| **Standalone desktop app** | Still needs hooks for signals | Yes, but outside the editor | Yes (OS idle) | High (packaging, windows, IPC) | **Rejected for MVP.** No new signals, more work, more intrusive |

### 2.2 Decision
**Hooks → local event log → VS Code extension with a sidebar webview.** This confirms the tech plan's recommendation, with three refinements:

1. **Install hooks globally for real users, per project for us.**
   - This repo ships `.cursor/hooks.json` so the team dogfoods while building. We get free real fixtures this way.
   - The product installer merges entries into `~/.cursor/hooks.json` without overwriting other entries, so the pet works in every project. User-level hook commands run from `~/.cursor/`, so the installer writes an **absolute path** to the hook script.
2. **The extension owns installation.**
   - On first activation it offers "Connect pet to Cursor agent", which runs the same merge as `hooks/install.mjs` using the hook script bundled inside the extension.
   - It also offers "Disconnect", which removes our entries.
   - This gives a single install step (`.vsix`) for the demo and for users.
3. **The hook stays dumb and synchronous.**
   - It appends one line to the log and returns immediately. Its only read is `state.json`, and only for the optional prompt-lock.
   - It never talks to the extension over a network, so it doesn't depend on ports or on the extension being alive.

### 2.3 Tradeoffs we accept
- **No "diff accepted/rejected" signal.** Neither hooks nor the extension API expose it. Proxies: `afterFileEdit` counts, and user typing shortly after agent edits.
- **Webviews don't render in Cursor's bottom panel** (known Cursor bug), so the pet lives in a sidebar view container. Status bar is the always-visible fallback.
- **Project hooks require a trusted workspace.** Hooks may need a "Reload Window" and a new chat after install.
- **Windows runs hook commands through PowerShell.** We use `node <script>`, not bash, and never a GUI process (Cursor won't wait for it).
- **Invalid JSON from a `before*` hook blocks the action.** Our hook always prints valid JSON (`{"continue":true}` for `beforeSubmitPrompt`, `{}` otherwise) and always exits 0.
- **Cursor CLI in `-p` mode doesn't fire `beforeSubmitPrompt`, and cloud agents ignore it.** The pet degrades gracefully: waiting time is then estimated from `sessionStart`/`stop`.
- **File-based IPC has a small latency** (polling or `fs.watch`, ~250–500 ms). Acceptable for a pet.

---

## 3. User scenarios

All user scenarios live in [specs/pet-use-cases.md](specs/pet-use-cases.md).

---

## 4. Architecture

### 4.1 Overview

```
Cursor agent ──hooks──▶ node hooks/pet-hook.js ──append──▶ $PET_DIR/events.jsonl
                              │ (reads state.json only for optional soft lock)
                              ▼
VS Code extension in Cursor (extension host)
  ├─ engine (pure TS, no `vscode` import)      ◀── tails events.jsonl                  [pet]
  │    events → PetState (load, mood, reasons, nudge) ──▶ writes $PET_DIR/state.json
  ├─ glue: activation, state store, ext.* signals (focus/blur, typing),                [pet]
  │        commands, nudge dispatcher (picks a channel, see §4.8)
  │          │ ToWebview / FromWebview messages, NudgeChannel calls
  │          ▼
  ├─ ui: sidebar webview (pet, animations, bubble, buttons), status bar look,          [ui]
  │      notification look, NudgeChannel renderers
```

The `[role]` tags show who owns each part. Data flows one way: `hooks` produces events, `pet` turns them into state and decisions, and `ui` renders them. User clicks flow back from `ui` as `FromWebview` messages to `pet`.

`PET_DIR` defaults to `~/.cursor-pet/` and can be overridden with the `CURSOR_PET_DIR` env variable. Replay and tests always use a temp directory.

### 4.2 Components and owners

| Component | Folder | Owner | Responsibility |
|---|---|---|---|
| Event contract | `contract/events.ts`, `contract/fixtures/*.jsonl` | `hooks` (authors), `pet` (approves) | `PetEvent` fields that hooks emit. Recorded and synthetic event logs |
| State and UI contract | `contract/state.ts`, `contract/actions.ts`, `contract/fixtures/states.json` | `pet` (authors), `ui` (approves) | `PetState`, `Nudge`, `NudgeChannel`, webview messages. One state per mood |
| Hook script | `hooks/pet-hook.js` | `hooks` | stdin JSON → one normalized `PetEvent` line. Local frustration flag. Hook side of the soft lock. Always exit 0 |
| Installer | `hooks/install.mjs` | `hooks` | Merge or remove our entries in `~/.cursor/hooks.json`; idempotent. Exports a function that the glue calls for the Connect button |
| Dogfood config | `.cursor/hooks.json` | `hooks` | Project-level hooks for this repo |
| Engine | `engine/src/` | `pet` | Reducer and load score, tail of the log, nudge policy (when and what: timing, cooldown, escalation, override, exercise choice, pet lines), `state.json` writer, clock injection |
| Replay / time-warp | `engine/scripts/replay.mjs` | `pet` | Play a fixture into a temp `PET_DIR` with compressed time |
| Extension glue | `extension/package.json`, `extension/src/extension.ts`, `extension/src/glue/` | `pet` | Activation, manifest contributions (views, commands, settings), engine wiring, state store, `ext.*` signals, commands, nudge dispatcher, `.vsix` build |
| Presentation | `extension/src/ui/`, `extension/webview/`, `extension/media/` | `ui` | Webview view provider and HTML/CSS/JS, sprites and animations per mood and per exercise, status bar look, notification look, `NudgeChannel` renderers |

**Fatigue-fighting split.** `pet` decides **when** to intervene and **what** the intervention is: the nudge level, the exercise (20-20-20, cyclic sigh, stretch), the pet's line, the escalation and the override rules. `ui` decides **how it looks and feels**: the animation for each mood and exercise, the bubble and toast design, colors and motion. `hooks` decides **what we can observe**: which Cursor events exist, what each one means and which fields it carries. The meeting points are `Nudge` (`pet` → `ui`) and `PetEvent` (`hooks` → `pet`).

### 4.3 Event contract (`contract/events.ts`)
One JSON object per line in `events.jsonl`. Version field `v` allows additive evolution.

```ts
export type HookEventType =               // = hook_event_name, no renaming
  | 'beforeSubmitPrompt' | 'afterAgentResponse' | 'afterAgentThought' | 'stop'
  | 'afterFileEdit' | 'postToolUse' | 'postToolUseFailure' | 'afterShellExecution'
  | 'sessionStart' | 'sessionEnd' | 'subagentStart' | 'subagentStop'
  | 'preCompact' | 'afterTabFileEdit';

export type ExtEventType =
  | 'ext.windowFocus' | 'ext.windowBlur' | 'ext.userTyping'
  | 'ext.breakStart' | 'ext.breakEnd'
  | 'ext.snooze' | 'ext.urgentStart' | 'ext.urgentEnd'
  | 'ext.petInteraction' | 'ext.calibrate';

export interface PetEvent {
  v: 1;
  ts: number;                 // epoch ms
  src: 'hook' | 'ext' | 'replay';
  type: HookEventType | ExtEventType | (string & {});  // unknown types are ignored, never crash
  conv?: string;              // conversation_id
  gen?: string;               // generation_id (one per user message)
  data: {
    chars?: number;           // length of prompt or response text; text itself is NEVER stored
    flags?: Array<'frustrated' | 'caps' | 'urgent'>;  // computed locally in the hook
    status?: 'completed' | 'aborted' | 'error';       // stop, sessionEnd
    tool?: string;            // postToolUse tool_name
    file?: string;            // afterFileEdit file_path (basename is enough)
    edits?: number;           // edits.length
    durationMs?: number;      // duration | duration_ms
    contextPct?: number;      // preCompact context_usage_percent
    subagentType?: string;
    action?: 'pet' | 'feed';  // ext.petInteraction
    minutes?: number;         // ext.breakStart / ext.urgentStart planned length
    feeling?: 'fine' | 'drained';  // ext.calibrate ("I'm fine" / "I'm fried")
    window?: string;          // ext.*: per-window id (several Cursor windows share one log)
  };
}
```

Rules:
- **Append-only.** Writers use `appendFileSync`, one line per event. Readers skip malformed lines.
- **Only `extension/` writes `ext.*` events**, and it writes them through `engine.push()`, which also appends them to the log. The log stays the single source of truth for replay.
- **Additive changes only** while the hackathon runs: new optional fields or new types. Never rename or remove.

### 4.4 Engine API and state (`contract/state.ts`)

```ts
export type Mood = 'egg' | 'happy' | 'focused' | 'tired' | 'melting' | 'sleeping' | 'resting';
export type NudgeLevel = 0 | 1 | 2 | 3;   // see §4.6
export type Moment = 'agentWorking' | 'agentStopped' | 'beforeSubmit' | 'idle';

export interface Nudge {
  id: string;                 // stable id for dedupe/cooldown, e.g. 'eyes-20-20-20'
  level: NudgeLevel;
  moment: Moment;             // boundary at which it was raised
  kind: 'micro' | 'long' | 'stop-for-today';
  exercise?: 'eyes-20-20-20' | 'cyclic-sigh' | 'stretch' | 'walk';  // ui maps each to an animation
  text: string;               // English line chosen and rotated by the engine (pet); ui only renders it
}

export interface PetState {
  v: 1;
  updatedAt: number;
  load: number;               // 0..100, higher = more tired
  mood: Mood;
  reasons: string[];          // human-readable: "55 min without a break", "3 agents at once"
  stats: {
    prompts: number; agentTurns: number; filesEdited: number; readChars: number;
    waitMs: number; sessionMs: number; sinceBreakMs: number;
    parallelConvs: number; aborts: number; frustration: number; snoozes: number;
  };
  agentWorking: boolean;      // open beforeSubmitPrompt without stop
  onBreak: boolean;
  urgentUntil?: number;       // nudges muted until this time
  nudge?: Nudge;              // at most one active nudge
  lock?: { active: boolean; text: string; bypassesLeft: number };  // only if soft lock enabled
}

export interface PetEngine {
  push(e: PetEvent): void;
  onState(cb: (s: PetState) => void): () => void;
  getState(): PetState;
  dispose(): void;
}

export declare function createPetEngine(opts: {
  dir: string;                // PET_DIR
  now?: () => number;         // injectable clock (tests, time-warp)
  speed?: number;             // time-warp multiplier, default 1
  softLock?: boolean;         // default false
}): PetEngine;

// webview <-> extension messages
export type ToWebview = { type: 'state'; state: PetState };
export type FromWebview =
  | { type: 'action'; action: 'pet' | 'feed' | 'startBreak' | 'snooze' | 'urgent' | 'calibrateFine' | 'calibrateDrained' }
  | { type: 'nudgeShown' | 'nudgeAccepted' | 'nudgeDismissed'; id: string };
```

Breaks are pushed as events (`ext.breakStart`), not through a special method, so replay sees them too.

### 4.5 Pet state model

**Signals** (all local, all derived from the log):

| Signal | Source | Why it's load |
|---|---|---|
| Time since last break | Event timestamps; window focus | Strongest predictor (break meta-analyses) |
| Decisions: prompts per window | `beforeSubmitPrompt` | Supervision effort |
| Reading volume: response chars, files edited | `afterAgentResponse.chars`, `afterFileEdit` | Verification load (CHI 2026) |
| Waiting time / fragmentation | `beforeSubmitPrompt` → `stop` (same `gen`) | Attention fragmentation |
| Churn: aborts and errors | `stop.status`, `postToolUseFailure` | Failure loops |
| Frustration | `flags: ['frustrated' \| 'caps']` | Looping and irritation |
| Parallel agents | Distinct `conv` in the last 10 min, `subagentStart` | More than 3 AI tools at once lowers productivity (BCG) |
| Late hours | Local clock ≥ 22:00 | Circadian fatigue |
| Self-calibration | `ext.calibrate` | Proxies are noisy; let the user correct |

**Load score.** This is a starting formula owned by `pet`. Coefficients are tuned so that ~90 min of dense work without a break reaches *tired*/*melting*.
- **Gain:**
  - prompt +4;
  - response +1 per 1000 chars (max +5 per response);
  - edited file +1;
  - aborted or error stop +5;
  - frustrated prompt +3;
  - subagent start +2;
  - multiply all gains by `1 + 0.2 × (parallelConvs − 1)`, capped at ×1.6.
- **Drift:**
  - after 50 min without a break, +0.5 per minute;
  - from 22:00 on, +0.3 per minute.
- **Decay:**
  - −1 per minute of normal work with no events;
  - −10 per minute during a break (button, or no Cursor window focused for ≥ 3 min);
  - a break of ≥ 15 min sets load to at most 20.
- **Calibration:** "I'm fine" −15; "I'm fried" sets load to at least 70.

**Moods** (with hysteresis of ±3 so the pet doesn't flicker):

| Load | Mood | Behavior |
|---|---|---|
| — | `egg` | Before the first hook event (not connected yet) |
| 0–30 | `happy` | Bounces on agent answers, reads along |
| 30–60 | `focused` | Concentrated and quiet. Never nudges |
| 60–85 | `tired` | Yawns. L1 nudges at boundaries |
| 85–95 | `melting` | Puddle, spiral eyes on long output. L2, suggests a long break |
| 95–100 | `sleeping` | Asleep on the Send button. L2, or L3 if the soft lock is on |
| any | `resting` | On break. Overrides the table above |

### 4.6 Nudge policy (escalation ladder)
- **L0 (always):** mood mirrors load. No text.
- **L1:** load ≥ 60, or ≥ 25–30 min continuous session, or an agent waiting window ([UC3](specs/pet-use-cases.md#uc3-long-wait-for-the-agent)). A bubble with **Let's go / Later**.
- **L2:** load ≥ 85, or 2 snoozes. Sleepy pet, status bar tint, a toast notification with buttons.
- **L3:** soft prompt-lock. Only if enabled (§4.7).

Timing rules (`pet` implements, `ui` renders whatever nudge is active):
- Raise nudges only at a boundary `Moment`: agent working for > 30 s, right after `stop`, or before submit. Never while the user typed in the last 20 s (`ext.userTyping`).
- At most one nudge per 10 min (cooldown per level). No nudges during `urgentUntil` or `onBreak`.
- Rotate texts and exercises. Never show the same `id` twice in a row.
- Any natural break of ≥ 5 min resets the ladder to L0.

### 4.7 Soft prompt-lock — OPEN DECISION (decide at checkpoint 1)
**Idea:** at L3, `beforeSubmitPrompt` returns `{"continue": false, "user_message": "Pixel fell asleep on your keyboard. 60 seconds and we're back."}`. This is the biggest "wow" for the demo, and the biggest risk of the user uninstalling.

**Constraints, if we build it:**
- **Off by default.** Enabled only by an explicit toggle (setting or onboarding choice).
- **Hook side (`hooks`):**
  - The hook decides **instantly** from `state.json`: `lock.active && now − updatedAt < 120 s`. No waiting and no network.
  - Any error means `{"continue":true}`.
- **Lock decision and bypass (`pet`):** the engine sets `lock` in `state.json`.
  - A prompt starting with `!urgent` always passes. It counts as an override and emits the `urgent` flag.
  - Limited to `bypassesLeft` per day (e.g., 3). After that the lock just doesn't engage that day; we never trap the user.
- **Unlock:** a 60 s guided break in the pet panel, or 3 min unfocused. `pet` defines it; `ui` designs the locked and unlock screens.
- **Limits:** doesn't work in cloud agents or CLI `-p`. That's acceptable.

**Options:**
- (a) Build it for the demo behind the toggle.
- (b) Fake it in the demo with replay only.
- (c) Skip it.

Default if nobody decides: **(a) if roles `hooks` and `pet` are on track at checkpoint 1, otherwise (c).**

### 4.8 Attention actions — EXTENSION POINT
The engine (`pet`) decides **when**, **what** and **how hard** by producing a `Nudge`. The glue's dispatcher (`pet`) picks a channel. Channels are renderers implemented by `ui`, so they decide **how it looks**. New actions can be added in separate feature specs without touching the engine.

```ts
// contract/actions.ts
export interface NudgeChannel {
  id: string;                                   // 'bubble' | 'toast' | 'statusBar' | ...
  minLevel: NudgeLevel;
  canShow(state: PetState): boolean;            // e.g. toast only if window focused
  show(nudge: Nudge, state: PetState): Promise<'accepted' | 'dismissed' | 'ignored'>;
}

// Seam between glue (pet) and presentation (ui). The extension.ts entry point (pet) calls
// ui's activateUi() exported from extension/src/ui/index.ts.
export interface UiBridge {
  onState(cb: (s: PetState) => void): () => void;   // glue → ui
  send(msg: FromWebview): void;                      // ui → glue (button clicks, nudge results)
}
export type ActivateUi = (ctx: unknown /* vscode.ExtensionContext */, bridge: UiBridge) => NudgeChannel[];
```

Candidate actions from the research, roughly in priority order:

| Action | Level | Effort | Notes |
|---|---|---|---|
| Mood mirror + status bar `🐱 72%` | L0 | low | MVP |
| Sidebar speech bubble with Let's go / Later | L1 | low | MVP |
| Micro-break while the agent works (20-20-20, look out the window) | L1 | low | MVP; uses UC3 |
| Guided 60 s break led by the pet (20-20-20, cyclic sighing, stretch; rotated) | L1–L2 | low–med | MVP top-3 |
| Toast notification with buttons | L2 | low | |
| Status bar tint / pet fades | L2 | low | |
| In-chat message on `preCompact` (`user_message`) | L1 | low | Only in-chat channel besides the lock |
| Adventure + loot on return (hats, postcards; longer break = rarer loot) | reward | med | Finch-style |
| Soft prompt-lock with `!urgent` bypass | L3 | low | §4.7, opt-in |
| Agent-aware tone via MCP or `sessionStart.additional_context` ("user is tired; be concise") | — | med | Bonus |
| End-of-day summary ("140 decisions, ~30 pages read") without judgement | — | med | Post-MVP |
| Webcam presence or pose check (MediaPipe, local, consent) | verify | high | Stretch |
| "Touch grass" photo check | verify | med | Stretch, privacy concerns |
| Full-screen strict overlay | L4 | med | Opt-in only, likely never |

Do **not** use `stop.followup_message`. It auto-sends a prompt to the agent.

### 4.9 Time-warp and replay (demo)
- **Clock injection.** The engine takes `now()` and `speed`. With `speed = 60`, one real second counts as one minute for all time-based rules.
- **Replay.** `node engine/scripts/replay.mjs <fixture> --speed 60 --dir <tmp>` rewrites fixture timestamps relative to now and appends lines on schedule.
- **Demo mode.** The extension exposes a "Pet: Demo mode (time-warp ×60)" command that points the engine at a temp `PET_DIR` and starts replay, so the real log stays clean.
- **Fixtures** (in `contract/fixtures/`):
  - `session-calm.jsonl` and `session-overload.jsonl`: one synthetic and one recorded from real dogfooding;
  - `states.json`: one `PetState` per mood, plus one with an active nudge per exercise, so `ui` can build the whole UI without the engine.

### 4.10 Privacy and safety checklist
- No prompt or response text on disk. Lengths and flags only. The frustration regex runs inside the hook.
- File paths: store the basename, or nothing.
- Everything stays in `PET_DIR`. No telemetry and no network.
- Hooks always exit 0 and always print valid JSON.

---

## 5. Team plan

### 5.1 Repo layout and ownership

```
demolition-daddy/
├─ AGENTS.md                     all agents read this first (language, roles)         pet
├─ README.md                     entry point, install + demo (filled at the end)      pet
├─ .cursor/
│  ├─ rules/repo-conventions.mdc                                                      pet
│  └─ hooks.json                 dogfood hooks for this repo                          hooks
├─ contract/
│  ├─ events.ts                  PetEvent                                             hooks (pet approves)
│  ├─ state.ts, actions.ts       PetState, Nudge, NudgeChannel, UiBridge, messages    pet (ui approves)
│  └─ fixtures/
│     ├─ *.jsonl                 event logs (synthetic + recorded)                    hooks
│     └─ states.json             one state per mood and per exercise                  pet
├─ hooks/                        pet-hook.js, install.mjs                             hooks
├─ engine/                       src/, test/, scripts/replay.mjs (no vscode import)   pet
├─ extension/
│  ├─ package.json, esbuild.mjs, tsconfig.json                                        pet
│  ├─ src/extension.ts           activate(): wires engine, glue and ui                pet
│  ├─ src/glue/                  state store, ext.* signals, commands, dispatcher     pet
│  ├─ src/ui/                    webview provider, status bar + toast renderers       ui
│  ├─ webview/                   pet HTML/CSS/JS, animations                          ui
│  └─ media/                     sprites, icons                                       ui
└─ docs/
   ├─ foundation-spec.md         this document                                        pet stewards, all via PR
   └─ specs/                     feature specs, one file per feature                  author of the spec
```

Conflict rules:
- **Edit only your role's paths.** For anything else, write a change note (see AGENTS.md "Claim a role") and let the owner make the change.
- **`extension/package.json` belongs to `pet`.** `ui` needs view, icon and color contributions in it, so `pet` creates them in the skeleton (view container `demolitionDaddy`, view `demolitionDaddy.pet`). `ui` asks `pet` for further changes.
- **No root `package.json` and no shared lockfile.** `engine/` and `extension/` each have their own. `hooks/` has zero dependencies (plain Node ≥ 18).
- **`extension/` bundles `../engine/src`, `../contract` and `../hooks/install.mjs`** with esbuild, so there's no npm linking.
- **`contract/` changes are additive only,** in a separate PR titled `contract: …`, announced in chat. It needs approval from `pet` plus the consuming role.

**Integrator: `pet`.** `pet` stewards `contract/` and merges cross-folder PRs. Reasons:
- `pet` sits in the middle of the data flow. It consumes `hooks`' events and produces `ui`'s state, so it's the only role that touches both contracts.
- Integration bugs show up in the glue, and the end-to-end smoke test runs through it.
- `hooks` has an open-ended research load (real payloads, platform quirks), and `ui` has the art load. Making either of them the merger would slow the critical path.

To keep `pet` from becoming a bottleneck, every author still self-merges PRs that touch only their own paths, once tests and the smoke check pass.

### 5.2 Roles
Claim a role by its ID: "I'm taking role `hooks`". Branch prefixes, commit areas and spec areas use the same IDs.

| Role ID | Name | Owns | First tasks (T0 → checkpoint 1) | Freeze deliverable | Interfaces with |
|---|---|---|---|---|---|
| **`ui`** | Design & UI | `extension/src/ui/`, `extension/webview/`, `extension/media/` | Pick the pet's name and art style. Build the sidebar pet as a standalone page first (open `webview/index.html` in a browser, switch through `states.json`). Draw all 7 moods and the 4 exercise animations. Design the bubble, status bar and toast | `activateUi()` with the webview provider and `NudgeChannel` renderers for bubble, toast and status bar. Guided-break screens, locked screen, Connect screen, loot reveal | `pet`, through `ToWebview`/`FromWebview`, `UiBridge`, `NudgeChannel`, `Mood` and `exercise` IDs |
| **`hooks`** | Cursor hooks & events | `hooks/`, `.cursor/hooks.json`, `contract/events.ts`, `contract/fixtures/*.jsonl` | Write `contract/events.ts` from §4.3. Implement `pet-hook.js` and `.cursor/hooks.json`. Verify real payload fields in Cursor for each hook. Record one real session as a fixture and write one synthetic overload fixture | Idempotent installer and uninstaller exported as a function. Frustration flag. `preCompact` message. Hook side of the soft lock (if chosen). A doc of which hook means what (`docs/specs/hooks-event-map.md`) | `pet`, through `events.jsonl` (`PetEvent`), `state.json` (lock), and the `install()`/`uninstall()` API |
| **`pet`** | Pet behavior & glue (integrator) | `engine/`, `extension/package.json`, `extension/src/extension.ts`, `extension/src/glue/`, `contract/state.ts`, `contract/actions.ts`, `contract/fixtures/states.json`, `AGENTS.md`, `README.md`, `.cursor/rules/` | Write `contract/state.ts` and `actions.ts` from §4.4 and §4.8, plus `states.json`; push them first, since `ui` needs them. Create the extension skeleton (manifest, `activate`, an empty view) so `ui` can press F5. Engine reducer and load score passing `node --test` on fixtures | Nudge policy (boundaries, cooldown, ladder, override, exercise rotation, pet lines), `speed` time-warp, `replay.mjs`, `state.json` writer, lock decision, `ext.*` signals, dispatcher, demo-mode command, `.vsix`. End-to-end smoke test after each merge | `hooks` (events in, lock out) and `ui` (state out, clicks in) |

Fixtures decouple everyone: `pet` builds the engine on event fixtures, `ui` builds the UI on state fixtures, and `hooks` produces real data.

### 5.3 Branches and PRs
- **Branches:** `ui/<topic>`, `hooks/<topic>`, `pet/<topic>` (e.g., `pet/load-score`). Parallel agents of the same person use separate git worktrees.
- **Small PRs into `main` every 30–40 min.** Run `git pull --rebase origin main` before opening a PR.
- **Merging:** the author may merge their own PR if it only touches their own paths and tests or the smoke check pass. `pet` merges contract and cross-folder PRs.
- **Commit messages:** `<area>: <imperative summary>`, in English. Areas: `ui`, `hooks`, `pet` (engine or glue), `contract`, `docs`. Example: `pet: add break decay`.
- **Agent prompts** start with: "You are role `pet`. Edit only the paths owned by `pet` in AGENTS.md. Read everything else, but don't modify it." Attach `@AGENTS.md`, `@contract` and `@docs/foundation-spec.md`.

### 5.4 Timeline
About 2 hours remain after this document lands. T0 is the moment everyone has pulled `main`.

| Time | What |
|---|---|
| T0 → T+0:10 | Everyone claims a role and reads this spec. `hooks` pushes `contract/events.ts`. `pet` pushes `contract/state.ts`, `actions.ts`, `states.json` and the extension skeleton. `ui` proposes the pet's name and style (emoji/CSS or pixel art); `pet` drafts 3 nudge lines |
| T+0:10 → T+0:50 | Sprint 1, in parallel |
| **T+0:50** | **Checkpoint 1** (5 min, voice): checkpoint 1 deliverables done? **Decide the soft lock (§4.7)** |
| T+0:55 → T+1:10 | Integration 1: a real prompt in Cursor makes the pet react |
| T+1:10 → T+1:40 | Sprint 2: nudges, guided break, time-warp demo, optional lock |
| **T+1:40** | **Feature freeze, checkpoint 2** |
| T+1:40 → T+1:55 | Bug fixes only. Clean install on a second laptop. **Record a backup demo video** |
| T+1:55 → T+2:00 | Pitch rehearsal and buffer |

### 5.5 Demo script (~2 min)
1. Hook line: "You're 6 hours into vibe coding and don't notice your brain melting. METR: devs with AI were 19% slower and felt 20% faster."
2. A happy pet reads along as we send a real prompt.
3. Time-warp ×60 replay of `session-overload`: three hours, 80 prompts, night. The pet gets tired, then melts. A "fix it, still broken" prompt brings sweat drops.
4. A long agent task starts. The pet says "The agent is thinking, stand up and stretch with me". The presenter actually stands up.
5. *(Optional)* The soft lock holds the next prompt. A 30 s guided breath, then the pet wakes up and the prompt goes through.
6. The pet returns from an adventure with a hat. Close with: "Other coding pets eat your tokens. Ours eats your breaks."

---

## 6. Open questions

| # | Question | Owner | Default if undecided |
|---|---|---|---|
| Q1 | Build the soft prompt-lock? (§4.7) | all, at checkpoint 1 | (a) if `hooks` and `pet` are on track, else (c) |
| Q2 | Pet name and art style | `ui` | Emoji + CSS; name "Pixel" |
| Q3 | Multiple Cursor windows: each runs an engine. Who writes `state.json`, and when is it "no window focused"? | `pet` | Every window's engine reads the same log, so they agree; last writer of `state.json` wins. Focus events carry `data.window`. "No Cursor window focused" means the latest focus event of every known window is a blur |
| Q4 | Exact load coefficients and thresholds | `pet` | §4.5 values; tune with real fixtures |
| Q5 | Does the extension auto-install global hooks, or does the project `.cursor/hooks.json` suffice for the demo? | `hooks` + `pet` | Demo: project hooks. Connect button if time allows |
| Q6 | Frustration regex: which words, and which languages (EN + RU)? | `hooks` | Small EN + RU list; flag only |
| Q7 | Loot/adventure: in MVP or not? | `pet` decides, `ui` draws | One hat after a ≥ 60 s break, if time allows |
| Q8 | `ext.userTyping` noise: how to separate agent edits from user typing | `pet` | Treat edits within 2 s after `afterFileEdit` as agent edits |
| Q9 | Can hooks give token usage or model cost per turn? (would be a better load signal than char counts) | `hooks` | Use `chars` until verified |
| Q10 | Packaging after the hackathon: Cursor plugin (hooks + MCP) plus extension? | all | Post-hackathon |

---

## 7. Feature specs
- **Location:** `docs/specs/<area>-<feature>.md`, where area is a role ID (`ui`, `hooks`, `pet`), `contract` or `cross`. Examples: `pet-nudge-policy.md`, `ui-guided-break.md`, `hooks-event-map.md`.
- **Template:** copy [`docs/specs/TEMPLATE.md`](specs/TEMPLATE.md). Keep a spec to 1–2 screens. Link the sections of this foundation spec it builds on.
- **Process:** open a spec as a short PR (or include it in your first feature PR) before larger work.
- **Conflicts:** if a spec contradicts this document, update this document in the same PR and tell the team.

## Sources
Research notes (team store, Russian): idea analysis, break-nudge research, tech plan. Key external sources:
- Cursor docs:
  - [Cursor Hooks](https://cursor.com/docs/hooks)
  - [Cursor Extension API](https://cursor.com/docs/extension-api)
  - [Cursor plugins](https://cursor.com/docs/plugins)
  - [MCP](https://cursor.com/docs/mcp)
  - [Rules](https://cursor.com/docs/rules)
  - [Worktrees](https://cursor.com/docs/configuration/worktrees)
- VS Code: [Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- Fatigue and productivity research:
  - [HBR/BCG "AI brain fry"](https://hbr.org/2026/03/when-using-ai-leads-to-brain-fry)
  - [CHI 2026 "When Help Hurts"](https://dl.acm.org/doi/full/10.1145/3772318.3791176)
  - [METR 2025](https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/)
- Breaks and interruptions:
  - [Albulescu et al. 2022 (micro-breaks)](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0272460)
  - [Bailey & Konstan 2006 (interruption timing)](https://interruptions.net/literature/Bailey-CHB06_1.pdf)
  - [Anderson et al. CHI 2015 (habituation)](https://neurosecurity.net/media/Anderson_et_al._CHI_2015.pdf)
  - [Balban et al. 2023 (cyclic sighing)](https://www.cell.com/cell-reports-medicine/fulltext/S2666-3791%2822%2900474-8)
- [Finch](https://finchcare.com/about-finch) and [Stretchly](https://hovancik.net/stretchly/about/) as mechanic references.
