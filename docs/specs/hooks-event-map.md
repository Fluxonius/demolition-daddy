# Hook event map

- **Area:** hooks
- **Owner (role ID):** hooks
- **Status:** agreed
- **Builds on:** [foundation spec §4.3](../foundation-spec.md#43-event-contract-contracteventsts), [hooks-fatigue-signals](hooks-fatigue-signals.md)

## Goal
One table that says, for each Cursor hook we listen to, what we keep in `events.jsonl`, what it means for the pet, and what the hook answers. Payload fields are from [Cursor Hooks docs](https://cursor.com/docs/hooks) (checked 2026-11-05); real payloads still need a recorded fixture.

## Behavior

Every event: `v: 1`, `ts`, `src: "hook"`, `type` = `hook_event_name`, `conv` = `conversation_id`, `gen` = `generation_id`. Text fields (`prompt`, `text`, `command`, `output`, `task`, `summary`, `error_message`, `edits[].*_string`) are reduced to numbers and dropped.

| Hook | Kept in `data` | Meaning for the pet | Hook answers |
|---|---|---|---|
| `beforeSubmitPrompt` | `chars`, `words`, `flags`, `fillers`, `frustration`, `profanity`, `rejection`, `polite`, `exclaims`, `questions`, `pastedLines`, `voiceLike`, `sim`, `attachments` | A decision; opens a turn; prompt language | `{"continue":true}` |
| `afterAgentResponse` | `chars` | Reading load | `{}` |
| `afterAgentThought` | `chars`, `durationMs` | Agent thinking time (waiting) | `{}` |
| `stop` | `status` | Closes the turn; `aborted` = user interrupt, `error` = failure | `{}` (never `followup_message`) |
| `afterFileEdit`, `afterTabFileEdit` | `file` (basename), `edits`, `linesAdded`, `linesRemoved` | Review load | `{}` |
| `postToolUse` | `tool`, `durationMs` | Agent activity (keeps the turn alive) | `{}` |
| `postToolUseFailure` | `tool`, `durationMs`, `failure`, `interrupt` | Failure loop, or impatience if `interrupt` | `{}` |
| `afterShellExecution` | `tool: "Shell"`, `durationMs`, `chars`, `failed` | Failing test/build loop | `{}` |
| `sessionStart` | — | Conversation opened | `{}` |
| `sessionEnd` | `reason`, `durationMs` | Conversation closed | `{}` |
| `subagentStart` | `subagentType` (`conv` = `parent_conversation_id`) | Parallel work | `{"permission":"allow"}` — a permission hook; `{}` may block the subagent |
| `subagentStop` | `subagentType`, `status`, `durationMs` | Parallel work ends | `{}` (never `followup_message`) |
| `preCompact` | `contextPct`, `contextTokens` | Long thread | `{"user_message": "Long thread! Good moment to stand up while the agent compacts."}` |

Not listened to: `preToolUse`, `beforeShellExecution`, `beforeMCPExecution`, `beforeReadFile` and the other permission hooks, which we have no reason to touch.

Skipped events: if `CURSOR_PET_SELF=1` is set, or `workspace_roots` contains `$CURSOR_PET_DIR/llm`, the hook logs nothing (our own Cursor CLI analyzer runs).

## Contract impact
See [hooks-fatigue-signals](hooks-fatigue-signals.md#contract-impact).

## Files touched
`hooks/lib/normalize.js`, `hooks/lib/features.js`, `hooks/pet-hook.js`, `.cursor/hooks.json`.

## Test / demo check
`node --test hooks/test/` (`normalize.test.mjs`, `pet-hook.test.mjs`).

## Open questions
- Record a real session as `contract/fixtures/session-recorded.jsonl` to confirm the fields above on our Cursor version.
