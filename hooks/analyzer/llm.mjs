// Pluggable LLM FatigueAnalyzer. `complete(messages) -> Promise<string>` is injected (see cursor-cli.mjs).
// The model gets numbers only (TelemetrySnapshot) plus the catalog and the rules opinion. Its answer is
// validated against the catalog; any failure falls back to the rules result.
import { ADVICE, CONDITIONS, CONDITION_INFO, MAX_ITEMS, MAX_TEXT, MIN_CONFIDENCE, MOODS, adviceFor, moodFor } from './catalog.mjs';
import { ruleAnalyzer } from './rules.mjs';

const MAX_EVIDENCE = 4;
const MAX_EVIDENCE_CHARS = 120;

const SYSTEM = `You are the brain of Demolition Daddy, a desktop pet that mirrors a developer's fatigue while they supervise AI coding agents in Cursor.
You get a telemetry snapshot (counts and timings only, never text) and a rule-based first opinion. Decide which conditions apply and how the user should rest so the pet feels better.

Rules:
- Signals are behavioral proxies, not diagnoses. No medical claims. Be playful, kind and short. No guilt.
- When baseline.ready is true, compare with the user's own baseline. A user who dictates by voice always has many filler words; only a rise counts.
- Combine signals. One count alone is not enough. Trends are "last 30 min vs earlier in the session"; below 1 means less than before.
- Agree with the rules opinion unless the numbers clearly say otherwise.

Condition ids:
${CONDITIONS.map((id) => `- ${id}: ${CONDITION_INFO[id]}`).join('\n')}

Advice ids:
${Object.entries(ADVICE).map(([id, a]) => `- ${id}: ${a.text}`).join('\n')}

Reply with one JSON object and nothing else:
{"load": 0-100, "mood": "${MOODS.join('" | "')}", "conditions": [{"id": "<condition id>", "confidence": 0-1, "evidence": ["short fact with numbers"]}], "advice": [{"id": "<advice id>", "condition": "<condition id>", "text": "the pet's line in English, at most ${MAX_TEXT} chars"}]}
At most ${MAX_ITEMS} conditions and ${MAX_ITEMS} advice, strongest first. Report a condition only with confidence >= ${MIN_CONFIDENCE}. Empty arrays are fine when the user is doing well.`;

export function buildMessages(snapshot, rulesOpinion) {
  const { load, mood, conditions } = rulesOpinion;
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: JSON.stringify({ snapshot, rulesOpinion: { load, mood, conditions } }) },
  ];
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no JSON object in LLM output');
  return JSON.parse(text.slice(start, end + 1));
}

export function parseAssessment(text, snapshot, rulesOpinion) {
  const raw = extractJson(String(text));
  if (!Number.isFinite(raw.load) && !Array.isArray(raw.conditions)) throw new Error('LLM output has no load or conditions');

  const load = Number.isFinite(raw.load) ? Math.round(Math.min(100, Math.max(0, raw.load))) : rulesOpinion.load;
  const mood = snapshot.onBreak ? 'resting' : MOODS.includes(raw.mood) ? raw.mood : moodFor(load, false);

  const seen = new Set();
  const conditions = (Array.isArray(raw.conditions) ? raw.conditions : [])
    .filter((c) => c && CONDITIONS.includes(c.id) && Number.isFinite(c.confidence) && !seen.has(c.id) && seen.add(c.id))
    .map((c) => ({
      id: c.id,
      confidence: Math.round(Math.min(1, Math.max(0, c.confidence)) * 100) / 100,
      evidence: (Array.isArray(c.evidence) ? c.evidence : [])
        .filter((e) => typeof e === 'string' && e.length <= MAX_EVIDENCE_CHARS)
        .slice(0, MAX_EVIDENCE),
    }))
    .filter((c) => c.confidence >= MIN_CONFIDENCE)
    .sort((x, y) => y.confidence - x.confidence)
    .slice(0, MAX_ITEMS);

  const used = new Set();
  let advice = (Array.isArray(raw.advice) ? raw.advice : [])
    .filter((a) => a && ADVICE[a.id] && !used.has(a.id) && used.add(a.id))
    .slice(0, MAX_ITEMS)
    .map((a) => {
      const base = ADVICE[a.id];
      const condition = CONDITIONS.includes(a.condition) ? a.condition : conditions[0]?.id ?? 'drained';
      const text = typeof a.text === 'string' && a.text.trim() && a.text.length <= MAX_TEXT ? a.text.trim() : base.text;
      return base.exercise ? { id: a.id, condition, minutes: base.minutes, exercise: base.exercise, text } : { id: a.id, condition, minutes: base.minutes, text };
    });
  if (!advice.length) advice = conditions.map((c) => adviceFor(c.id, snapshot.at));
  if (snapshot.onBreak) advice = [];

  return { v: 1, at: snapshot.at, source: 'llm', load, mood, conditions: snapshot.onBreak ? [] : conditions, advice };
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`LLM timed out after ${ms} ms`)), ms); }),
  ]).finally(() => clearTimeout(timer));
}

export function createLlmAnalyzer({ complete, fallback = ruleAnalyzer, timeoutMs = 90_000 }) {
  return {
    async analyze(snapshot) {
      const rulesOpinion = await fallback.analyze(snapshot);
      try {
        const text = await withTimeout(Promise.resolve().then(() => complete(buildMessages(snapshot, rulesOpinion))), timeoutMs);
        return parseAssessment(text, snapshot, rulesOpinion);
      } catch {
        return rulesOpinion;
      }
    },
  };
}
