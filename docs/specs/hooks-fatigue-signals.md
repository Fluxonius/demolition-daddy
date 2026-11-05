# Fatigue signals and condition analyzer

- **Area:** hooks
- **Owner (role ID):** hooks
- **Status:** agreed
- **Builds on:** [foundation spec §1.4, §4.3, §4.5, §4.6, §4.10](../foundation-spec.md), [pet use cases](pet-use-cases.md), [implementation brief](cursor_activity_assistant_implementation_brief.md) (research input)

## Goal
Collect every privacy-safe signal Cursor gives us, turn it into a telemetry snapshot with personal baselines, and let an analyzer (rules today, an LLM when plugged in) name the user's *condition* (not just a load number) and pick rest advice that fits that condition: tired eyes get 20-20-20, a fix-it loop gets "step away and start a fresh chat", a long haul gets "go touch grass".

## Principles
- **Features, not text.** The hook sees prompt, response, thought and shell output text, extracts counts and flags in memory, and discards the text. Nothing in `events.jsonl`, `baseline.json` or LLM input contains user text, code, commands or full paths. This keeps the hard rule in `AGENTS.md`.
- **Proxies, not diagnoses.** Every signal is a behavioral proxy. The analyzer reports conditions with a confidence and the evidence behind them; the pet never claims to know how the user feels.
- **Compare with the user, not with a constant.** A voice-dictating user says "um"/"э" all the time; that is their baseline, not fatigue. Most signals are scored as a deviation from the user's own rolling baseline. Absolute defaults apply only until there is enough history.
- **Combine signals.** No single count triggers a condition. "Many prompts per minute" alone can be flow; with shrinking prompts, rejections and interrupts it is rushing.

## Data sources

| Source | Available | What it gives |
|---|---|---|
| Cursor hooks | Always (Agents Window and editor) | Prompts, responses, thoughts, loop stops with status, agent file edits, tool use and failures (incl. user interrupts), shell runs, sessions, subagents, context compaction. Every payload also has `conversation_id`, `generation_id`, `model`, `transcript_path` |
| Overlay (Electron) | When the overlay runs | OS idle time (`powerMonitor`), button clicks, self-report ("I'm fine" / "I'm fried"), nudge accepted / snoozed / ignored |
| Extension API | Classic editor only, optional | Window focus, user typing volume, undo/redo, diagnostics, saves, task/terminal exit codes |
| Clock and history | Always | Local hour, bedtime, session length, past days |

## Signal catalog

Computed in the hook (per event, text discarded right away) or in the telemetry layer (over windows of events).

**Prompt language** (hook, `beforeSubmitPrompt`):

| Signal | How | May indicate |
|---|---|---|
| `chars`, `words` | lengths | Shrinking prompts over a session: terseness, depletion |
| `fillers` | EN `um, uh, like, you know, basically`; RU `э, эм, ну, типа, короче, как бы, вот` | Disfluency rises with cognitive load in speech input; baseline-relative only |
| `voiceLike` | filler density, no newlines or code fences, long run-on sentences | Input mode. Switches the baseline used for fillers and punctuation |
| `frustration` | EN `fix it, still, again, doesn't work, broken, why`; RU `не работает, опять, снова, всё ещё, до сих пор, почини, сломал` | Fix-it loop (UC5) |
| `profanity` | small EN + RU list | Irritation |
| `rejection` | prompt starts with `no, wrong, revert, undo, нет, не то, откати, верни` | Rejecting agent output; churn |
| `caps`, `exclaims`, `questions` | uppercase ratio, `!!`, `??` runs | Irritation, urgency |
| `polite` | `please, thanks, пожалуйста, спасибо` | A drop against the session start is a weak irritation signal (experimental, low weight) |
| `pastedLines` | lines that look like stack traces or error output | Debugging loop |
| `sim` | 64-bit SimHash of word shingles, prompts ≥ 20 chars only | Near-duplicate prompts: the user repeats themselves |

**Tempo and attention** (telemetry layer):

| Signal | How | May indicate |
|---|---|---|
| Prompts per 10 min | count | Supervision load (with baseline) |
| Inter-prompt gap trend | median gap, last 30 min vs session | Speeding up: rushing |
| Review time | `stop` → next prompt in the same conversation | Very short after a long response or many edited lines: skimming, rubber-stamping |
| User interrupts | `stop.status = aborted`, `postToolUseFailure.is_interrupt` | Impatience |
| Conversation switches | prompt goes to a different `conv` than the previous one | Context switching |
| Parallel conversations | distinct `conv` in 10 min, `subagentStart` | Multitasking (BCG: > 3 AI tools at once hurts) |
| Agent wait | open turn age | Not fatigue; a micro-break opportunity (UC3) |

**Agent outcome and review load** (hook + telemetry layer):

| Signal | How | May indicate |
|---|---|---|
| Loop errors | `stop.status = error`, `postToolUseFailure` (`failure`) | Failure loop |
| Failing shell runs | hook flags `failed` from an error regex over the output, then drops the output | Test/build failure loop |
| Reading volume | `afterAgentResponse.chars`, `afterAgentThought.durationMs` | Eye and reading load |
| Diff volume | `afterFileEdit`: files, `linesAdded`, `linesRemoved` | Review load (CHI 2026) |
| Long threads | `preCompact.contextPct`, `contextTokens` | One conversation is dragging on |

**Time, presence and feedback:**

| Signal | Source | May indicate |
|---|---|---|
| Time since break, session length, active hours today | timestamps, OS idle ≥ 3 min | Strongest single predictor (foundation §4.5) |
| Local hour vs `bedtime`, late days in a row | clock, history | Circadian fatigue (UC6) |
| Undo bursts, persistent diagnostics, failed task runs | extension, optional | Editor-side churn |
| Self-report, nudge accepted/snoozed/ignored | overlay | Ground truth labels and personalization |

## Conditions and advice
The analyzer returns zero or more conditions, each with a confidence (0–1) and evidence (signal ids with values and baselines). Advice comes from a fixed catalog; the LLM may reword the line but cannot invent new advice ids.

| Condition | Main evidence | Pet hint | Advice (rotated) |
|---|---|---|---|
| `eye-strain` | high reading volume or diff volume in the last 60 min, long time since break | tired, squinting | 20-20-20 (`eyes-20-20-20`), palming and blinking for 1 min |
| `decision-fatigue` | prompts per hour above baseline, ≥ 3 parallel chats, prompts getting shorter | tired | write the next 3 steps on paper, close all chats but one, 5-min walk (`walk`) |
| `stuck-loop` | frustration, profanity or rejection words, near-duplicate prompts, pasted errors, failing runs, aborts within 10 min | sweaty overlay | step away 2 min, cyclic sigh (`cyclic-sigh`), fresh chat with a 3-line summary, explain it to a rubber duck |
| `rushing` | interrupts, gaps shrinking, rubber-stamp reviews, caps and `!!` | jittery | one cyclic sigh before the next send, read the diff once, stretch (`stretch`) |
| `scattered` | frequent conversation switches, parallel chats, focus switches | juggling | single-task for 25 min, mute the other chats |
| `drained` | ≥ 90 min without a break, ≥ 3 h session, fillers above baseline, politeness drop, shorter prompts, "I'm fried" | melting | 15-min break away from screens, water and food, go outside ("touch grass") |
| `late` | past `bedtime` | nightcap overlay | stop for today, leave a note for tomorrow |
| `waiting` | agent working > 30 s | bored overlay | micro-break: stretch, refill water |

Load and mood still follow foundation §4.5–§4.6; conditions add the *why* and the *what to do*. The pet engine stays the authority on when a nudge is shown.

## Analyzer
- **Input: `TelemetrySnapshot`.** Window stats (last 10 min, last 60 min, session), trends (last 30 min vs session), baseline deltas, a 2-hour timeline in 5-min buckets (counts only), daily summaries for the last 7 days, recent self-reports and nudge outcomes.
- **Output: `Assessment`.** `{ at, load, mood, conditions[], advice[], source: 'rules' | 'llm' }`.
- **`FatigueAnalyzer` interface:** `analyze(snapshot) → Promise<Assessment>`. Two implementations:
  - **Rules (default, offline).** Weighted signals per condition, thresholds relative to the baseline. Deterministic and tested on fixtures.
  - **LLM (pluggable).** Gets the snapshot JSON, the condition and advice catalogs, and the rules opinion, and returns JSON. Its output is validated: unknown ids are dropped, numbers are clamped, a line over 140 chars is replaced by the catalog line. Any error, timeout (90 s) or invalid output falls back to the rules result. Callers should run it at most every 5 min and only at boundaries (foundation §4.6).
- **Provider.** A `complete(messages) → Promise<string>` function is injected. The default is the **Cursor CLI** (`agent -p --output-format json --mode ask --trust`). It runs in its own workspace, `$CURSOR_PET_DIR/llm`, reads the request from `request.md` there, and is marked with `CURSOR_PET_SELF=1`; the hook ignores events from either marker, so the pet doesn't count its own analysis as user work. `PET_LLM_CMD` and `PET_LLM_MODEL` override the command and the model. The CLI sends the request to Cursor's servers. That request holds numbers only, but it still needs the foundation §1.4/§4.10 clause in the change notes below.
- **Baseline.** Computed on the fly from `events.jsonl`: medians of per-10-min rates (prompts, response chars, changed lines) over the 7 days before the current session, plus the median prompt length and the mean fillers per prompt. It is `ready` after 3 earlier sessions and 6 active 10-min buckets; until then absolute defaults apply.
- **Tuning log (later).** Appending each assessment to `$PET_DIR/assessments.jsonl` (numbers and ids only), next to self-reports and nudge outcomes, would let us check the weights against what users actually said.

## Opt-in deeper context (later, not in the first PR)
Every hook payload carries `transcript_path`. A local-only analyzer could read the transcript in memory to extract richer features (tone shifts, topic thrash) without writing any text. It stays off by default, needs a local model and needs a foundation change (§4.10).

## Contract impact
Additive, in a separate `contract: …` PR (approval: `pet`).
- `contract/events.ts`: `PetEvent` per foundation §4.3, plus optional `data` fields `words`, `fillers`, `profanity`, `rejection`, `polite`, `exclaims`, `questions`, `pastedLines`, `voiceLike`, `sim`, `failure`, `interrupt`, `failed`, `linesAdded`, `linesRemoved`, `contextTokens`, `reason`, and editor-sensor types `ext.textEdit`, `ext.undoRedo`, `ext.diagnostics`, `ext.runEnd`. OS idle reuses `ext.windowBlur`/`ext.windowFocus` with `data.window: "os-idle"` (foundation Q11).
- `contract/telemetry.ts` (new): `TelemetrySnapshot`, `Assessment`, `ConditionId`, `AdviceId`, `FatigueAnalyzer`.

## Files touched
- `hooks/pet-hook.js`, `hooks/lib/`: hook entry, normalization and in-memory feature extraction.
- `hooks/telemetry.mjs`: log reader, windows, trends, baseline, timeline.
- `hooks/analyzer/`: `catalog.mjs` (conditions and advice), `rules.mjs`, `llm.mjs` (validation and fallback), `cursor-cli.mjs` (provider).
- `hooks/insights.mjs`: CLI that prints the snapshot and the assessment.
- `hooks/install.mjs`, `.cursor/hooks.json`, `hooks/scripts/make-fixtures.mjs`, `contract/fixtures/*.jsonl`, `docs/specs/hooks-event-map.md`.
- Under `hooks` ownership by explicit decision of the team lead, although conditions and advice are "when and what" (`pet`): `hooks/analyzer/`. `pet` may move it into `engine/` later; it has no dependencies.

Change notes for other roles:
- `pet`: the engine consumes `Assessment` (conditions → overlays and reasons, advice → `Nudge.text`/`exercise`). `AGENTS.md` and foundation §2.3 say "print `{}` otherwise", but `subagentStart` is a permission hook in Cursor, where `{}` may block the subagent; the hook returns `{"permission":"allow"}` there. Foundation §1.4/§4.10 needs a clause for the opt-in LLM.
- `pet` (extension glue, optional): emit the editor-sensor `ext.*` events above.
- `ui`: emit OS idle as `ext.windowBlur`/`ext.windowFocus` with `data.window: "os-idle"`; draw the condition overlays (`sweaty`, `bored`, `nightcap`, juggling).

## Test / demo check
- `node --test hooks/test/` (Node ≥ 18): feature extraction per language (EN, RU, dictated), privacy checks (no input text in any event), hook fail-open and permission answers, installer merge, telemetry windows and breaks, the rules analyzer on `session-calm` and `session-overload`, LLM validation and fallback, the Cursor CLI provider against a fake `agent`.
- `node hooks/scripts/make-fixtures.mjs` regenerates the fixtures deterministically.
- `node hooks/insights.mjs [--dir <PET_DIR>] [--llm] [--json]` prints the snapshot and the assessment for a live log.

## Open questions
- The Cursor CLI provider is tested against a fake `agent` only. Verify it with the real CLI (`agent login` first), including whether `CURSOR_PET_SELF` reaches hooks that the CLI runs. Owner: `hooks`.
- Is a SimHash of prompts ≥ 20 chars acceptable privacy-wise, or should duplicate detection stay inside the hook? Owner: `hooks` + `pet`.
- Sending numbers to Cursor's servers through the CLI vs foundation §1.4 "nothing leaves the machine": the analyzer is opt-in (`--llm`) until the foundation says otherwise. Owner: all.
