// Pure engine: TelemetrySnapshot + FatigueAssessment (contract/telemetry.ts) -> PetState (foundation §4.4).
// No IO and no `vscode` import; the runner in ../scripts/run.mjs does the file work.

type Exercise = 'eyes-20-20-20' | 'cyclic-sigh' | 'stretch' | 'walk';

export interface Nudge {
  id: string;
  level: 0 | 1 | 2 | 3;
  moment: 'agentWorking' | 'agentStopped' | 'beforeSubmit' | 'idle';
  kind: 'micro' | 'long' | 'stop-for-today';
  exercise?: Exercise;
  text: string;
}

export interface PetState {
  v: 1;
  updatedAt: number;
  load: number;
  mood: string;
  reasons: string[];
  stats: Record<string, number>;
  agentWorking: boolean;
  onBreak: boolean;
  nudge?: Nudge;
}

interface Advice { id: string; minutes: number; exercise?: string; text: string }
interface Assessment { load: number; mood: string; conditions: { id: string; evidence: string[] }[]; advice: Advice[] }

const MIN = 60_000;
export const NUDGE_MIN_LOAD = 50;
export const SNOOZE_MS = 15 * MIN;
const EXERCISES: string[] = ['eyes-20-20-20', 'cyclic-sigh', 'stretch', 'walk'];

function toNudge(a: Advice, load: number, agentWorking: boolean): Nudge {
  const kind = a.id === 'stop-for-today' ? 'stop-for-today' : a.minutes >= 5 ? 'long' : 'micro';
  const nudge: Nudge = {
    id: a.id,
    level: load >= 85 ? 3 : load >= 70 ? 2 : 1,
    moment: agentWorking ? 'agentWorking' : 'agentStopped',
    kind,
    text: a.text,
  };
  if (a.exercise && EXERCISES.includes(a.exercise)) nudge.exercise = a.exercise as Exercise;
  return nudge;
}

export function buildPetState(snapshot: any, assessment: Assessment, opts: { now: number; lastSnoozeAt?: number | null }): PetState {
  const { now, lastSnoozeAt = null } = opts;
  const w60 = snapshot.windows.last60m;
  const reasons = assessment.conditions.flatMap((c) => c.evidence).slice(0, 3);
  const snoozed = lastSnoozeAt !== null && now - lastSnoozeAt < SNOOZE_MS;
  const advice = assessment.advice[0];
  const state: PetState = {
    v: 1,
    updatedAt: now,
    load: assessment.load,
    mood: assessment.mood,
    reasons,
    stats: {
      prompts: w60.prompts,
      agentTurns: w60.agentTurns ?? 0,
      filesEdited: w60.filesEdited ?? 0,
      readChars: w60.responseChars,
      waitMs: snapshot.openTurnMs ?? 0,
      sessionMs: snapshot.session.durationMs,
      sinceBreakMs: snapshot.sinceBreakMs,
      parallelConvs: snapshot.parallelConvs,
      aborts: w60.aborts,
      frustration: w60.frustration,
      snoozes: snapshot.feedback.snoozes60m,
    },
    agentWorking: !!snapshot.agentWorking,
    onBreak: !!snapshot.onBreak,
  };
  if (!state.onBreak && !snoozed && advice && assessment.load >= NUDGE_MIN_LOAD) {
    state.nudge = toNudge(advice, assessment.load, state.agentWorking);
  }
  return state;
}
