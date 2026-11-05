# Cursor Activity and Rest Assistant — Implementation Brief

## Purpose
Build an assistant that observes activity in Cursor and suggests appropriate moments to rest. Editor activity and AI workflow events are behavioral proxies, not direct measurements of fatigue or frustration. Keep tiredness and workflow friction separate; validate interpretations with optional user feedback.

This document summarizes the implementation options discussed. API availability and payloads must be verified against the supported Cursor releases before implementation. Proposed metrics and thresholds are product hypotheses, not validated clinical or psychological measures.

## Recommended architecture

```text
Cursor editor extension ── editor events ───┐
                                          ├── Local desktop receiver
Cursor hook scripts ───── Agent events ────┘          │
                                                     v
                                         Rolling feature aggregation
                                                     │
                                                     v
                                          Personal baseline + rules
                                                     │
                                                     v
                                        Reminders + optional feedback
```

Use a thin extension as an editor sensor. Use Cursor hooks for explicit AI activity. Keep storage, scoring, preferences, and notifications in a standalone desktop application.

- Editor API subscriptions run inside the extension host; an external application cannot simply import `vscode` to attach to Cursor.
- A desktop Node.js extension can forward metadata through local HTTP, WebSocket, or OS IPC.
- Hooks invoke external scripts and exchange JSON through stdin/stdout. Those scripts can forward metadata directly, without an extension.
- A hooks-only version can observe AI workflow, but not the full editor event set.

## Editor signals

| Signal | API | Proposed use / qualification |
|---|---|---|
| Window focus | `window.state.focused`, `window.onDidChangeWindowState` | Focused time, not proof of presence or work. |
| Document changes | `workspace.onDidChangeTextDocument` | Inserted/deleted character counts and edit bursts. Ignore events with empty `contentChanges` for edit volume. |
| Undo/redo | `TextDocumentChangeEvent.reason`, `TextDocumentChangeReason.Undo` / `.Redo` | Reversal bursts normalized by edit activity. |
| Cursor and selection changes | `window.onDidChangeTextEditorSelection` | Navigation activity; optional `event.kind` can help classify origin. Not raw keyboard/mouse monitoring. |
| Viewport movement | `window.onDidChangeTextEditorVisibleRanges` | Navigation/scrolling proxy, not raw wheel input. |
| File/tab transitions | `window.onDidChangeActiveTextEditor`, `window.tabGroups.onDidChangeTabs` | Context switching and repeated returns. |
| Diagnostics | `languages.onDidChangeDiagnostics`, `languages.getDiagnostics()` | Error/warning counts, persistence, recurring codes. |
| Saves | `workspace.onDidSaveTextDocument` | Context for edit-save-run loops. |
| Task processes | `tasks.onDidStartTaskProcess`, `tasks.onDidEndTaskProcess` | Run duration, repetition, exit codes for task-managed executions. |
| Terminal execution | `window.onDidStartTerminalShellExecution`, `window.onDidEndTerminalShellExecution` | Duration and exit codes where shell integration is available. |
| Debug sessions | `debug.onDidStartDebugSession`, `debug.onDidTerminateDebugSession` | Repeated debugging loops and duration. |

Document changes can originate from typing, paste, formatting, AI, extensions, external changes, or undo/redo. Do not equate change events with keystrokes or human effort. The public editor API does not supply a general global-keypress feed, system-wide idle detector, or universal command-execution event.

## Cursor Agent and Tab hooks

| Hook | Proposed use |
|---|---|
| `beforeSubmitPrompt` | Prompt cadence; start of a user request. |
| `afterAgentResponse` | Completed assistant message and visible response size. |
| `stop` | Agent loop completion and status: completed, aborted, or error. |
| `afterFileEdit` | Identify Agent edits for AI attribution. |
| `afterTabFileEdit` | Identify applied Tab edits; not a complete suggestion acceptance-rate denominator. |
| `preToolUse`, `postToolUse` | Tool activity and duration where provided. |
| `postToolUseFailure` | Failures and interruptions; inspect `failure_type` and `is_interrupt`. |
| `afterShellExecution` | Agent shell-command execution information. Avoid storing output by default. |
| `sessionStart`, `sessionEnd` | Conversation/session lifecycle. |

Keep assistant-message completion (`afterAgentResponse`) separate from agent-loop completion (`stop`). Common hook metadata includes `conversation_id`, `generation_id`, `hook_event_name`, and `cursor_version`; verify fields for supported versions.

Configuration options discussed:
- User scope: `~/.cursor/hooks.json` — appropriate for a personal assistant across projects.
- Project scope: `.cursor/hooks.json`.
- Hooks may also be distributed through Cursor plugins.

Correlate AI edits with editor changes using available identifiers, file/range information, and timing. Treat attribution as best-effort: hooks and editor events are not guaranteed to form a perfect one-to-one stream.

## Token measurement

### Individual-user MVP: estimates only
Hooks expose prompt/response text, but do not document exact total input/output token counters. Tokenize locally using a tokenizer appropriate to the selected model if useful.

Use explicit names such as:
```json
{
  "estimatedUserPromptTokens": 120,
  "estimatedVisibleResponseTokens": 850,
  "tokenMeasurement": "estimated-visible-text"
}
```

Do not label these total model usage. A user prompt is not the complete serialized model input, and a final response is not every intermediate output. Model selection, context, tools, and thinking can make these quantities different. Visible response size is a candidate review-load feature, not evidence that the user read it.

### Team Admin API: reported usage with delay
Endpoint discussed: `POST https://api.cursor.com/teams/filtered-usage-events`.

Token-based usage events can contain `tokenUsage.inputTokens`, `outputTokens`, `cacheWriteTokens`, and `cacheReadTokens`. A `conversationId`, when present, can support conversation-level association. Do not assume an exact join to a hook `generation_id`.

The documented hourly aggregation/polling guidance makes this a historical-analysis integration, not an immediate per-turn trigger. Requires appropriate team API access. Keep privileged credentials out of distributed client extensions.

### Enterprise OpenTelemetry: request telemetry
- `cursor.token.usage`: aggregate token metric, with input/output/cache categories.
- `cursor.api.request`: request logs containing token counts.
- Use request logs with `cursor.conversation.id` for conversation attribution; aggregate metric datapoints do not carry conversation IDs.
- Deduplicate using `cursor.event.id` before aggregation.
- Content export is a separate opt-in; token metadata need not imply exporting messages.
- Enterprise-only; server-side export requires a public HTTPS OTLP collector, not a desktop localhost endpoint.

### Cloud Agents
`GET /v1/agents/{id}/usage` provides per-run and total usage for Cloud Agents. It is not a general telemetry endpoint for arbitrary local IDE conversations.

## Proposed feature groups

### Sustained activity
- Focused time with recent observable interaction.
- Time since a configurable inactivity interval.
- Editing/navigation burst duration.
- Active interaction versus AI waiting.

Silence is unknown: the person may be reading, thinking, away, or using another application. Never label inactivity as a confirmed restorative break.

### Workflow friction
- Undo/redo bursts relative to edit volume.
- Repeated edits in the same region.
- Persistent diagnostics.
- Repeated failed build/test cycles.
- Aborted or failed Agent turns and interrupted tools.
- Prompt → AI edit → failed command → follow-up prompt loops.
- Manual rework after AI edits.

Normalize features against the user's own history and context. Do not trigger from a single raw count or describe a precise frustration percentage without calibration.

### Optional feedback
Offer a lightweight check-in: Fine / Tired / Stuck / Frustrated. Keep feedback optional and use it to evaluate feature usefulness and reminder timing.

## Event contract proposal

This is an application-defined schema, not a built-in Cursor payload.

```ts
type ActivityEvent = {
  schemaVersion: 1;
  timestamp: string;
  instanceId: string;
  source: "editor" | "cursor-hook";
  type: string;
  conversationId?: string;
  generationId?: string;
  windowMs?: number;
  insertedChars?: number;
  deletedChars?: number;
  undoEvents?: number;
  durationMs?: number;
  outcome?: "completed" | "aborted" | "error";
  focused?: boolean;
};
```

Use a random instance ID per editor-window session. Preserve source and measurement provenance. Prefer counts/timings to content. If processing file identity is necessary, keep it local and use minimized identifiers rather than persisting full paths.

## Local bridge and privacy requirements

- Bind the local receiver to loopback, not all network interfaces.
- Authenticate requests with a per-install secret; validate payloads and size limits.
- Batch events and keep forwarding non-blocking.
- Bound buffering; define retry/drop behavior when the app is offline.
- Track connection state independently from inactivity.
- Provide pause, snooze, clear retention settings, and deletion controls.
- Do not persist code, prompts, terminal output, or user identity by default.
- If text is used for token estimation, process it locally and discard it after extracting the needed counts.
- Do not scrape Cursor's private databases or DOM, or intercept typing commands as a keylogger.

## Remote workspace considerations

Extensions can run locally or on SSH/WSL/container hosts. `localhost` refers to whichever host runs the code. Investigate `"extensionKind": ["ui"]` for the sensor, and verify event coverage and placement in supported Cursor configurations. Do not assume hook scripts execute on the desktop in every environment; test transport routing explicitly.

## Reminder behavior

Start with explainable rules, a quiet status indicator, and dismissible reminders. Prefer natural pauses such as Agent completion or a run ending rather than interrupting typing. Example wording:

> You've had a long active session and several unsuccessful run cycles. This might be a good moment for a short pause.

All thresholds, weights, and reminder schedules remain to be defined and tested. Avoid medical claims and authoritative assertions about mood.

## Implementation sequence and acceptance checks

1. Compatibility spike
   - Select supported Cursor versions and desktop platforms.
   - Verify editor API availability, hook payloads, and hook installation/distribution.
   - Exercise local, multi-window, and remote-workspace configurations.
2. Local transport
   - Implement authenticated receiver and schema validation.
   - Verify offline behavior, bounded buffering, window identity, and reconnect state.
3. Editor sensor
   - Capture focus, changes, undo/redo, navigation, diagnostics, and run outcomes.
   - Test typing, paste, format-on-save, external changes, AI edits, and empty content-change events.
4. Hook sensor
   - Capture prompt, message completion, loop completion, AI edits, and failures.
   - Verify message-versus-loop distinction and best-effort AI attribution.
5. Feature aggregation
   - Implement configurable rolling windows and baseline storage.
   - Keep observed facts separate from inferred activity states.
6. Reminders and feedback
   - Add pause/snooze and optional state check-ins.
   - Evaluate false positives before adding complex scoring.
7. Optional usage integrations
   - Add visible-text token estimates first.
   - Add Admin API or Enterprise telemetry only where access and latency suit the deployment.

## Open decisions

- Is the first release a desktop app plus sensor, or an extension-only prototype?
- Which operating systems and remote setups are supported?
- What counts as recent activity, a long session, or a candidate pause?
- How much local history is retained, and when is a personal baseline usable?
- Which reminder outcomes define success without encouraging excessive nudging?
- Are team/Enterprise deployments in scope, or only individual accounts?

## Official documentation discussed

- VS Code API: https://code.visualstudio.com/api/references/vscode-api
- Extension host: https://code.visualstudio.com/api/advanced-topics/extension-host
- Remote extensions: https://code.visualstudio.com/api/advanced-topics/remote-extensions
- Extension manifest: https://code.visualstudio.com/api/references/extension-manifest
- Cursor extensions: https://cursor.com/help/customization/extensions
- Cursor hooks: https://cursor.com/docs/hooks
- Cursor plugins: https://cursor.com/docs/reference/plugins
- Team Admin API: https://cursor.com/docs/account/teams/admin-api
- Enterprise OpenTelemetry: https://cursor.com/docs/enterprise/opentelemetry-export
- OpenTelemetry wire reference: https://cursor.com/docs/enterprise/opentelemetry-export/wire.md
- Cloud Agents endpoints: https://cursor.com/docs/cloud-agent/api/endpoints

These references were discussed in the conversation; this summary does not independently re-audit every API contract. Recheck the official documentation during the compatibility spike.
