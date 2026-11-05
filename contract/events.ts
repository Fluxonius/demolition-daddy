// Event contract: one PetEvent per line in $CURSOR_PET_DIR/events.jsonl (foundation §4.3).
// Additive changes only: new optional fields or new types. Never rename or remove.
// Signal meanings: docs/specs/hooks-fatigue-signals.md and docs/specs/hooks-event-map.md.

export type HookEventType =               // = hook_event_name, no renaming
  | 'beforeSubmitPrompt' | 'afterAgentResponse' | 'afterAgentThought' | 'stop'
  | 'afterFileEdit' | 'postToolUse' | 'postToolUseFailure' | 'afterShellExecution'
  | 'sessionStart' | 'sessionEnd' | 'subagentStart' | 'subagentStop'
  | 'preCompact' | 'afterTabFileEdit';

export type ExtEventType =
  | 'ext.windowFocus' | 'ext.windowBlur' | 'ext.userTyping'
  | 'ext.breakStart' | 'ext.breakEnd'
  | 'ext.snooze' | 'ext.urgentStart' | 'ext.urgentEnd'
  | 'ext.petInteraction' | 'ext.calibrate'
  // Editor sensor (VS Code extension API, optional). Emitted per window, aggregated over ≤ 60 s.
  | 'ext.textEdit' | 'ext.undoRedo' | 'ext.diagnostics' | 'ext.runEnd';

export type PromptFlag = 'frustrated' | 'caps' | 'urgent';

export interface PetEvent {
  v: 1;
  ts: number;                 // epoch ms
  src: 'hook' | 'ext' | 'replay';
  type: HookEventType | ExtEventType | (string & {});  // unknown types are ignored, never crash
  conv?: string;              // conversation_id (subagentStart: parent_conversation_id)
  gen?: string;               // generation_id (one per user message)
  data: {
    chars?: number;           // length of prompt, response, thought or shell output; text itself is NEVER stored
    flags?: PromptFlag[];     // computed locally in the hook
    status?: 'completed' | 'aborted' | 'error';       // stop, subagentStop
    tool?: string;            // postToolUse / postToolUseFailure tool_name; 'Shell' for afterShellExecution
    file?: string;            // afterFileEdit / afterTabFileEdit: basename only
    edits?: number;           // edits.length
    durationMs?: number;      // duration | duration_ms
    contextPct?: number;      // preCompact context_usage_percent
    subagentType?: string;
    action?: 'pet' | 'feed';  // ext.petInteraction
    minutes?: number;         // ext.breakStart / ext.urgentStart planned length
    feeling?: 'fine' | 'drained';  // ext.calibrate ("I'm fine" / "I'm fried")
    window?: string;          // ext.*: per-window id; "overlay" for overlay clicks, "os-idle" for OS idle blur/focus

    // beforeSubmitPrompt language features (counts over the prompt; computed in memory, text discarded)
    words?: number;
    fillers?: number;         // um, uh, э, ну, типа, короче, …
    frustration?: number;     // "fix it", "still not", "опять", "не работает", …
    profanity?: number;
    rejection?: boolean;      // starts with "no", "revert", "нет", "не то", …
    polite?: number;          // please, thanks, пожалуйста, спасибо
    exclaims?: number;        // runs of "!!" or longer
    questions?: number;       // runs of "??" or longer
    pastedLines?: number;     // lines that look like errors or stack traces
    voiceLike?: boolean;      // looks dictated rather than typed
    sim?: string;             // 64-bit SimHash (16 hex chars) of word bigrams; prompts ≥ 20 chars only
    attachments?: number;

    // agent outcome and review load
    failure?: 'error' | 'timeout' | 'permission_denied';  // postToolUseFailure failure_type
    interrupt?: boolean;      // postToolUseFailure is_interrupt (user cancelled)
    failed?: boolean;         // afterShellExecution: output looks like a failure
    linesAdded?: number;      // afterFileEdit / afterTabFileEdit
    linesRemoved?: number;
    contextTokens?: number;   // preCompact
    reason?: string;          // sessionEnd: completed | aborted | error | window_close | user_close

    // editor sensor (ext.textEdit, ext.undoRedo, ext.diagnostics, ext.runEnd)
    insertedChars?: number;   // user edits only; agent edits come from afterFileEdit
    deletedChars?: number;
    undos?: number;
    redos?: number;
    errors?: number;          // current diagnostics totals
    warnings?: number;
    runKind?: 'task' | 'terminal' | 'debug';
    exitCode?: number;
  };
}
