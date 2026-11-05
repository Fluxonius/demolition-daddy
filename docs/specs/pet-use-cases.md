# Pet use cases (MVP)

- **Area:** pet
- **Owner (role ID):** pet
- **Status:** draft
- **Builds on:** [foundation spec §4.5](../foundation-spec.md#45-pet-state-model), [§4.6](../foundation-spec.md#46-nudge-policy-escalation-ladder)

## Goal
Six use cases the engine implements now. Each one says what we observe and how the pet's state changes: load, mood, visual overlay, reasons, nudge.

## Shared rules
- **Session.** A session starts on the first event after 3+ hours with no events. Reload Window does not start a new session.
- **Break.** `ext.breakStart`, or no Cursor window focused for ≥ 3 min.
- **Nudge timing** (from §4.6). Nudges are raised only at a boundary `Moment`, and:
  - never if the user typed in the last 20 s;
  - at most one per 10 min;
  - never the same `id` twice in a row;
  - none while `onBreak` or before `urgentUntil`.
- **Exception.** `agent-done` (UC3) ignores the cooldown and `urgentUntil`. It is a status message, not a break nudge.
- **Mood `focused`** (load 30–60) blocks L1 nudges from UC4. Other use cases nudge in any mood.

## Settings
Engine options, exposed by the extension as user settings.

| Setting | Default | Used by |
|---|---|---|
| `tokenBudget` | `100000` (`0` = off) | UC2 |
| `longWaitMin` | `3` | UC3 |
| `breakReminderMin` | `50` | UC4 |
| `bedtime` | `"22:00"` (`"off"` = off) | UC6 |
| `wakeTime` | `"06:00"` | UC6 |

## Behavior

### UC1. Idle
- **When:** load < 30 and not on a break.
- **Pet:** mood `happy`.
  - It bounces on `afterAgentResponse` and reads along.
  - With no events it blinks and sways.
- **Nudges:** none.
- **Exit:**
  - load > 30 → `focused` (hysteresis ±3);
  - overlays from UC2–UC6 are drawn on top.

### UC2. Token budget for the session
- **Counter:** `stats.estTokens = Σ chars / 4` over `beforeSubmitPrompt`, `afterAgentResponse` and `afterAgentThought` since the session start.
  - Hooks expose text length only; real token usage is not available.
  - The UI labels the number as "≈ tokens".
- **≥ 75% of `tokenBudget`:**
  - overlay `stuffed`;
  - reason "~75k tokens this session".
- **≥ 100%:** one L1 nudge, `id: 'token-budget'`, kind `micro`. Example text: "We chewed through 100k tokens together. Snack break for you?"
- **After 100%:** `stuffed` stays until the session ends.
- **Load:** no extra gain; response length already adds load (§4.5).

### UC3. Long wait for the agent
- **Open turn:** a `beforeSubmitPrompt` whose `gen` has no `stop` yet. Wait time is the age of the oldest open turn across all conversations.
- **30 s, load ≥ 30:** micro-break nudge, a 20-20-20 exercise. Example text: "The agent is busy — look out the window with me for 20 seconds." This time was idle anyway, so nothing is taken from the user.
- **`longWaitMin`, any load:**
  - overlay `bored`;
  - reason "waiting 3 min on the agent";
  - L1 nudge `id: 'long-wait'`, kind `long`. Example text: "This one's a big job. Stretch or grab water — I'll watch it for you."
- **`stop` after a long wait:** nudge `id: 'agent-done'`, kind `agent-done`. The extension shows it in the panel; if no Cursor window is focused it also shows a toast.
- **`stop` during an exercise:** the pet finishes the exercise quietly.
- **Abandoned turn:** an open turn whose conversation has no events for 15 min is treated as closed, with no `agent-done`.
- **Load:** waiting adds none; normal idle decay applies.

### UC4. Long without a break
- **Counter:** `stats.sinceBreakMs`.
- **`breakReminderMin`:**
  - the pet yawns;
  - drift +0.5/min starts (§4.5);
  - L1 nudge `id: 'long-break'`, kind `long`. Example text: "50 minutes straight. Walk around for 5?"
  - If mood is `focused`, the nudge waits until the mood leaves `focused`.
- **90 min:** L2 in any mood. The pet looks `melting`, the status bar is tinted, and a toast appears.
- **Later:** next nudge after the 10-min cooldown. Two snoozes → L2 (§4.6).
- **Return from a break:**
  - "Welcome back!" and `sinceBreakMs = 0`;
  - ≥ 5 min resets the ladder;
  - ≥ 15 min caps load at 20.

### UC5. Fix-it loop
- **Signal:** a prompt flagged `frustrated` or `caps`, or a `stop` with status `aborted` or `error`.
- **Load per signal** (§4.5): +3 per flagged prompt, +5 per aborted or error stop.
- **Loop:** ≥ 3 signals within a rolling 10 min.
  - overlay `sweaty`;
  - reason "3 'fix it's in 10 min";
  - L1 nudge with the running count. Example text: "That's the 3rd 'fix it'. Maybe the agent is tired? So are you."
  - The advice alternates by `id`: `fix-loop-break` ("step away for 2 minutes") and `fix-loop-new-chat` ("start a fresh chat").
- **Loop ends:** 10 min without a signal, or a break.

### UC6. Late hour
- **Night:** from `bedtime` to `wakeTime`, local time; it may wrap past midnight.
- **At night:**
  - overlay `nightcap` and a dim palette;
  - drift +0.3/min (§4.5);
  - reason "past bedtime".
- **First boundary after `bedtime`:** nudge `id: 'bedtime'`, kind `stop-for-today`. Example text: "It's past 22:00. Wrap up and leave a note for tomorrow-you?"
  - It repeats at most once per hour.
  - During the night, nudges from other use cases use kind `long` or `stop-for-today`, never `micro`.
- **`bedtime` + 2 h:**
  - mood `sleeping` at any load;
  - this sleep is visual only, it does not raise L2/L3 or engage the soft lock;
  - `resting` still overrides it during a break.

## Other scenarios (not in MVP scope)
Moved from the foundation spec unchanged. Not specified for the engine yet.

### S1. First install
- **Narrative:** Dana installs the `.vsix`. A paw icon appears in the Activity Bar.
- **Trigger:** first extension activation, and no hook entries found in `~/.cursor/hooks.json`.
- **Pet:** sleeps in an egg. A bubble says "Connect me to your agent so I can keep you company", with a **Connect** button. After Connect the extension merges the hooks and asks for "Reload Window, then start a new chat". On the first hook event the pet hatches: *happy*, load 0.

### S5. Parallel agents
- **Narrative:** Dana runs three chats at once and jumps between them.
- **Trigger:** `parallelConvs` (distinct `conv` IDs active in the last 10 min) is 2 or more. `subagentStart` events also count.
- **Pet:** load gain is multiplied (×1.2 per extra conversation, capped). It visually juggles balls, one per active chat. The `reasons` list shows "3 agents at once".

### S8. Break taken
- **Narrative:** Dana clicks **Let's go**, or just walks away.
- **Trigger:**
  - The **Break** button sends `ext.breakStart`.
  - A natural break: no Cursor window focused for ≥ 3 min. The extension emits `ext.windowBlur` and later `ext.windowFocus`.
- **Pet:**
  - During the break it is *resting* and the load decays fast.
  - For a guided break, the pet leads a 60-second exercise (20-20-20, cyclic sighing, stand and stretch, rotated each time).
  - On return: "Welcome back!". Load drops. Optionally the pet comes back from an "adventure" with a hat or item. A break of ≥ 10–15 min resets the escalation ladder.

### S9. Ignored nudges (escalation)
- **Narrative:** Dana clicks **Later** twice and keeps working.
- **Trigger:** two `ext.snooze` events, or load ≥ 85.
- **Pet:**
  - L2: the pet falls asleep, colors fade, the status bar tint changes. Lines vary every time.
  - L3 (only if the soft lock is enabled, see [foundation §4.7](../foundation-spec.md#47-soft-prompt-lock--open-decision-decide-at-checkpoint-1)): the next prompt is held back with the pet's message.

### S10. Urgent work override
- **Narrative:** Production is down. Dana can't take a break now.
- **Trigger:** Dana clicks **I'm on it, urgent** in the pet panel, or starts a prompt with `!urgent` while the lock is active.
- **Pet:**
  - It respects the choice: "Okay, I'll hold the fort." Nudges are muted for 30–60 min (an "urgent window").
  - The lock is bypassed; overrides are limited per day.
  - The pet still mirrors load, so it looks tired, but it stays silent until the window ends.
  - It doesn't punish the override, although each override costs a little pet energy as a gentle cost.

### S11. Long chat
- **Narrative:** A single conversation grows huge.
- **Trigger:** `preCompact` with a high `contextPct`.
- **Pet:** this is our one in-chat message channel (`user_message`): "Long thread! Good moment to stand up while the agent compacts."

### S12. Failure modes
- **Extension off:** hooks keep logging and Cursor is unaffected. When the extension starts, the engine replays the log tail and catches up.
- **Hook script fails:** Cursor continues (fail-open). The pet just sees fewer events.
- **`state.json` is stale** (older than 2 min): the hook ignores it, so it never blocks without a live extension.

## Contract impact
Additive, in a separate `contract:` PR.
- `createPetEngine` options: `tokenBudget`, `longWaitMin`, `breakReminderMin`, `bedtime`, `wakeTime`.
- `PetState.stats.estTokens: number`.
- `PetState.overlays?: Array<'stuffed' | 'bored' | 'sweaty' | 'nightcap'>`.
- `Nudge.kind` gains `'agent-done'`.

## Files touched
- `engine/src/`: reducer, load score, nudge policy.
- `engine/test/`: one fixture per use case.
- `extension/package.json`: the settings above.
- `docs/foundation-spec.md`: see "Foundation changes" below.

Change notes for other roles:
- `hooks` (contract change, `contract/events.ts` and `pet-hook.js`): `afterAgentThought` must log `data.chars`. The `frustrated`/`caps` flags depend on the regex (foundation Q6).

## Test / demo check
- `node --test` in `engine/`: one fixture per use case, with an injected clock.
- Demo: `replay.mjs --speed 60` with a low `tokenBudget` and `bedtime` set to a few minutes from now.

## Foundation changes
Update `docs/foundation-spec.md` in the same PR:
- §4.5 night drift starts at `bedtime`, not a fixed 22:00. Forced `sleeping` after `bedtime` + 2 h.
- §4.6 L2 is also raised at 90 min without a break. The time-based L1 moves from 25–30 min to `breakReminderMin` (50). `agent-done` is exempt from cooldown and the urgent mute.
- New signal: the session token budget (UC2).

## Open questions
- Can the extension show anything outside Cursor? VS Code toasts appear inside the window, so `agent-done` may only be seen on return. Owner: `pet` (glue), with `ui` for the look.
