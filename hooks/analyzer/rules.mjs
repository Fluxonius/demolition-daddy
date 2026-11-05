// Offline, deterministic FatigueAnalyzer (contract/telemetry.ts). Also the fallback for the LLM analyzer.
// Weights are product hypotheses (docs/specs/hooks-fatigue-signals.md); tune them against self-reports.
import { MAX_ITEMS, MIN_CONFIDENCE, adviceFor, moodFor } from './catalog.mjs';

const MIN = 60_000;
const CALIBRATION_TTL = 60 * MIN;
const BEDTIME_HOUR = 22;
const WAKE_HOUR = 6;
const DIFF_LINE_CHARS = 40;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const ramp = (x, lo, hi) => clamp((x - lo) / (hi - lo), 0, 1);
const round = (x) => Math.round(x * 100) / 100;
const shrink = (trend) => (trend === null ? 0 : ramp(1 - trend, 0.2, 0.6));

function conditions(s) {
  const w10 = s.windows.last10m;
  const w60 = s.windows.last60m;
  const b = s.baseline.ready ? s.baseline : null;
  const sinceMin = s.sinceBreakMs / MIN;
  const sessionMin = s.session.durationMs / MIN;
  const out = [];
  const add = (id, confidence, evidence) => out.push({ id, confidence: round(clamp(confidence, 0, 1)), evidence: evidence.filter(Boolean) });

  const read60 = w60.responseChars + DIFF_LINE_CHARS * (w60.linesAdded + w60.linesRemoved);
  const baseRead = b && b.responseCharsPer10m !== null ? 6 * (b.responseCharsPer10m + DIFF_LINE_CHARS * (b.linesChangedPer10m ?? 0)) : 0;
  const readScore = baseRead > 0 ? ramp(read60 / baseRead, 1.5, 3) : ramp(read60, 20000, 60000);
  add('eye-strain', 0.6 * readScore + 0.4 * ramp(sinceMin, 30, 90), [
    `read ~${Math.round(read60 / 1000)}k chars of responses and diffs in 60 min` + (baseRead > 0 ? ` (usual ~${Math.round(baseRead / 1000)}k)` : ''),
    sinceMin >= 30 && `${Math.round(sinceMin)} min since the last break`,
  ]);

  const promptScore = b && b.promptsPer10m ? ramp(w60.prompts / 6 / b.promptsPer10m, 1.3, 2.5) : ramp(w60.prompts, 15, 40);
  add('decision-fatigue', 0.45 * promptScore + 0.3 * ramp(s.parallelConvs, 2, 4) + 0.25 * shrink(s.trends.promptChars), [
    `${w60.prompts} prompts in 60 min` + (b && b.promptsPer10m ? ` (usual ~${Math.round(b.promptsPer10m * 6)})` : ''),
    s.parallelConvs >= 2 && `${s.parallelConvs} conversations at once`,
    shrink(s.trends.promptChars) > 0 && `prompts are ${Math.round((1 - s.trends.promptChars) * 100)}% shorter than earlier`,
  ]);

  const loop = {
    frustration: w10.frustration, profanity: w10.profanity, rejections: w10.rejections, 'repeated prompts': w10.duplicatePrompts,
    'pasted errors': w10.pastedLines >= 2 ? 1 : 0, aborts: w10.aborts, 'agent errors': w10.errors,
    'tool failures': w10.toolFailures, 'failing runs': w10.failedShellRuns + w10.failedRuns,
  };
  add('stuck-loop', ramp(Object.values(loop).reduce((a, n) => a + n, 0), 1, 5),
    Object.entries(loop).filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n} in 10 min`));

  add('rushing',
    0.35 * ramp(w10.interrupts, 0, 3) + 0.35 * ramp(w10.quickReviews, 0, 2) + 0.15 * shrink(s.trends.promptGap) + 0.15 * ramp(w10.exclaims + w10.capsPrompts, 0, 3), [
      w10.interrupts > 0 && `${w10.interrupts} interrupts in 10 min`,
      w10.quickReviews > 0 && `${w10.quickReviews} long answers approved within 15 s`,
      shrink(s.trends.promptGap) > 0 && 'prompts are coming faster than earlier',
      w10.exclaims + w10.capsPrompts > 0 && `${w10.exclaims + w10.capsPrompts} shouty prompts`,
    ]);

  add('scattered', 0.6 * ramp(w60.convSwitches, 3, 10) + 0.4 * ramp(s.parallelConvs, 2, 4), [
    `${w60.convSwitches} conversation switches in 60 min`,
    s.parallelConvs >= 2 && `${s.parallelConvs} conversations at once`,
  ]);

  const fillerRate = w60.prompts ? w60.fillers / w60.prompts : 0;
  const fillerScore = b && b.fillersPerPrompt !== null
    ? ramp(fillerRate / Math.max(b.fillersPerPrompt, 0.25), 1.3, 2.5)
    : (s.trends.fillersPerPrompt === null ? 0 : ramp(s.trends.fillersPerPrompt, 1.2, 2));
  const politeDrop = s.trends.politePerPrompt === null ? 0 : ramp(1 - s.trends.politePerPrompt, 0.3, 0.8);
  const cal = s.feedback.lastCalibration;
  const fried = cal && cal.feeling === 'drained' && s.at - cal.at <= CALIBRATION_TTL;
  const drained = 0.6 * ramp(sinceMin, 60, 120) + 0.1 * ramp(sessionMin, 120, 240) + 0.1 * fillerScore + 0.1 * politeDrop + 0.1 * shrink(s.trends.promptChars);
  add('drained', fried ? Math.max(drained, 0.9) : drained, [
    sinceMin >= 60 && `${Math.round(sinceMin)} min without a break`,
    sessionMin >= 120 && `session running for ${Math.round(sessionMin)} min`,
    fillerScore > 0 && 'more filler words than usual',
    politeDrop > 0 && 'fewer pleases and thanks than earlier',
    fried && "said they're fried",
  ]);

  const late = s.localHour >= BEDTIME_HOUR || s.localHour < WAKE_HOUR;
  add('late', late && (w60.prompts > 0 || s.agentWorking) ? 1 : 0, [`local time ${s.localHour}:00`]);

  add('waiting', s.agentWorking && s.openTurnMs >= 30_000 ? 0.5 + 0.5 * ramp(s.openTurnMs, 30_000, 180_000) : 0, [
    `agent working for ${Math.round(s.openTurnMs / 1000)} s`,
  ]);

  return out
    .filter((c) => c.confidence >= MIN_CONFIDENCE)
    .sort((x, y) => y.confidence - x.confidence)
    .slice(0, MAX_ITEMS);
}

function load(s) {
  const w60 = s.windows.last60m;
  const sinceMin = s.sinceBreakMs / MIN;
  const activity = Math.min(40,
    w60.prompts * 0.6 + w60.responseChars / 2000 + (w60.linesAdded + w60.linesRemoved) / 100
    + (w60.aborts + w60.errors + w60.toolFailures + w60.failedShellRuns) * 1.5 + (w60.frustration + w60.profanity) * 1.5);
  const late = s.localHour >= BEDTIME_HOUR || s.localHour < WAKE_HOUR ? 10 : 0;
  let value = 50 * ramp(sinceMin, 0, 90) + activity + late;
  const cal = s.feedback.lastCalibration;
  if (cal && s.at - cal.at <= CALIBRATION_TTL) value = cal.feeling === 'drained' ? Math.max(value, 70) : value - 15;
  return Math.round(clamp(value, 0, 100));
}

export function assessWithRules(s) {
  const value = load(s);
  if (s.onBreak) return { v: 1, at: s.at, source: 'rules', load: value, mood: 'resting', conditions: [], advice: [] };
  const found = conditions(s);
  return {
    v: 1,
    at: s.at,
    source: 'rules',
    load: value,
    mood: moodFor(value, false),
    conditions: found,
    advice: found.map((c) => adviceFor(c.id, s.at)),
  };
}

export const ruleAnalyzer = { analyze: async (snapshot) => assessWithRules(snapshot) };
