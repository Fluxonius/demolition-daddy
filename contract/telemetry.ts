// Telemetry snapshot and fatigue analyzer contract (docs/specs/hooks-fatigue-signals.md).
// Built from events.jsonl by hooks/telemetry.mjs; analyzed by hooks/analyzer/ (rules or LLM).
// Numbers and ids only: no prompt, response, command or path text ever appears here.
// Additive changes only.

export interface WindowStats {
  prompts: number;
  promptChars: number;
  words: number;
  fillers: number;
  frustration: number;
  profanity: number;
  rejections: number;
  polite: number;
  exclaims: number;
  questions: number;
  pastedLines: number;
  voicePrompts: number;
  capsPrompts: number;
  duplicatePrompts: number;   // near-duplicate (SimHash) of a prompt in the previous 30 min
  responses: number;
  responseChars: number;
  thoughtMs: number;
  turns: number;              // stop events
  aborts: number;
  errors: number;             // stop.status = error
  interrupts: number;         // aborted stops + interrupted tools
  toolFailures: number;       // non-interrupt tool failures
  shellRuns: number;
  failedShellRuns: number;
  filesEdited: number;        // distinct basenames
  linesAdded: number;
  linesRemoved: number;
  subagents: number;
  compactions: number;
  waitMs: number;             // closed turns: prompt → stop
  quickReviews: number;       // prompt < 15 s after a turn with ≥ 2000 response chars or ≥ 50 changed lines
  convSwitches: number;       // prompt in a different conversation than the previous prompt
  userChars: number;          // editor sensor; 0 without the extension
  undos: number;
  failedRuns: number;
}

export type TrendId = 'promptChars' | 'promptGap' | 'fillersPerPrompt' | 'politePerPrompt';

export interface TelemetrySnapshot {
  v: 1;
  at: number;                 // epoch ms
  localHour: number;          // 0..23
  session: { startedAt: number; durationMs: number };  // new session after ≥ 3 h without events
  sinceBreakMs: number;
  onBreak: boolean;
  agentWorking: boolean;
  openTurnMs: number;         // age of the oldest open turn, 0 if none
  parallelConvs: number;      // distinct conversations in the last 10 min
  windows: { last10m: WindowStats; last60m: WindowStats; session: WindowStats };
  // last 30 min vs earlier in the session; < 1 means "less than before". null = not enough data
  trends: Record<TrendId, number | null>;
  // medians from the 7 days before this session; null until there is enough history
  baseline: {
    ready: boolean;
    sessions: number;
    promptsPer10m: number | null;
    responseCharsPer10m: number | null;
    linesChangedPer10m: number | null;
    promptChars: number | null;
    fillersPerPrompt: number | null;
  };
  timeline: Array<{ start: number; prompts: number; responseChars: number; linesChanged: number; failures: number; frustration: number }>;  // 5-min buckets, last 2 h
  days: Array<{ date: string; activeMin: number; prompts: number; lateMin: number }>;  // last 7 local days, oldest first
  feedback: { lastCalibration: { at: number; feeling: 'fine' | 'drained' } | null; snoozes60m: number; breaksToday: number };
}

export type ConditionId =
  | 'eye-strain' | 'decision-fatigue' | 'stuck-loop' | 'rushing'
  | 'scattered' | 'drained' | 'late' | 'waiting';

export type AdviceId =
  | 'eyes-20-20-20' | 'palming'
  | 'next-steps-on-paper' | 'close-extra-chats' | 'walk'
  | 'step-away' | 'cyclic-sigh' | 'fresh-chat' | 'rubber-duck'
  | 'breath-before-send' | 'read-the-diff' | 'stretch'
  | 'single-task'
  | 'screen-free-break' | 'water-and-food' | 'touch-grass'
  | 'stop-for-today' | 'note-for-tomorrow'
  | 'refill-water';

export type Exercise = 'eyes-20-20-20' | 'cyclic-sigh' | 'stretch' | 'walk';  // = Nudge.exercise (foundation §4.4)

export interface Condition {
  id: ConditionId;
  confidence: number;         // 0..1; reported when ≥ 0.5
  evidence: string[];         // e.g. "frustration=3 in 10 min", "prompts/10m 14 vs baseline 5"
}

export interface Advice {
  id: AdviceId;
  condition: ConditionId;
  minutes: number;
  exercise?: Exercise;
  text: string;               // the pet's English line, ≤ 140 chars
}

export interface Assessment {
  v: 1;
  at: number;
  source: 'rules' | 'llm';
  load: number;               // 0..100
  mood: 'happy' | 'focused' | 'tired' | 'melting' | 'sleeping' | 'resting';
  conditions: Condition[];    // strongest first, at most 3
  advice: Advice[];           // best first, at most 3
}

export interface FatigueAnalyzer {
  analyze(snapshot: TelemetrySnapshot): Promise<Assessment>;
}
