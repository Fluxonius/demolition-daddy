// events.jsonl -> TelemetrySnapshot (contract/telemetry.ts). Pure: numbers and ids in, numbers out.
// Spec: docs/specs/hooks-fatigue-signals.md.
import fs from 'node:fs';
import { hamming, DUPLICATE_BITS } from './lib/features.js';
import { petDir, eventsPath } from './lib/pet-dir.js';

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const SESSION_GAP = 3 * 60 * MIN;     // pet-use-cases.md: new session after 3 h without events
const BREAK_GAP = 3 * MIN;            // foundation Q11: 3 min without events and no agent working
const ABANDONED_TURN = 15 * MIN;      // pet-use-cases.md UC3
const QUICK_REVIEW = 15_000;
const HEAVY_TURN_CHARS = 2000;
const HEAVY_TURN_LINES = 50;
const DUPLICATE_WINDOW = 30 * MIN;
const TREND_WINDOW = 30 * MIN;
const HISTORY = 7 * DAY;
const BASELINE_BUCKET = 10 * MIN;
const TIMELINE_BUCKET = 5 * MIN;
const TIMELINE_BUCKETS = 24;
const LATE_FROM = 22;
const LATE_UNTIL = 6;
const NOT_ACTIVITY = new Set(['ext.windowBlur', 'ext.breakStart', 'ext.breakEnd', 'ext.diagnostics']);

const isActivity = (e) => !NOT_ACTIVITY.has(e.type);
const isOsIdle = (e) => e.data.window === 'os-idle';
const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const mean = (xs) => (xs.length ? sum(xs) / xs.length : null);
const round = (x, digits = 2) => (x === null ? null : Math.round(x * 10 ** digits) / 10 ** digits);

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function localDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const isLate = (ts) => {
  const h = new Date(ts).getHours();
  return h >= LATE_FROM || h < LATE_UNTIL;
};

export function readEvents(file) {
  if (!fs.existsSync(file)) return [];
  const events = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line);
      if (!e || !Number.isFinite(e.ts) || typeof e.type !== 'string') continue;
      e.data = e.data && typeof e.data === 'object' ? e.data : {};
      events.push(e);
    } catch {
      // skip malformed lines
    }
  }
  return events.sort((a, b) => a.ts - b.ts);
}

// One chronological pass: pairs prompts with stops, finds breaks, and tags prompts with
// context that a single event can't carry (quick review, conversation switch, duplicate).
function annotate(events, now) {
  const items = [];
  const openTurns = new Map();        // gen -> { ts, conv }
  const turnLoad = new Map();         // gen -> { chars, lines }
  const lastEventByConv = new Map();
  const lastStopByConv = new Map();   // conv -> { ts, heavy }
  const recentSims = [];              // { ts, sim }
  const breaks = [];                  // { start, end, kind }
  const explicit = [];
  let lastActivity = null;
  let lastPromptConv = null;
  let idleSince = null;
  let lastCalibration = null;

  const turnAlive = (turn, t) => (lastEventByConv.get(turn.conv) ?? turn.ts) >= t - ABANDONED_TURN;
  const agentWorkingAt = (t) => [...openTurns.values()].some((turn) => turnAlive(turn, t));

  for (const e of events) {
    if (e.ts > now) break;
    const item = { e };
    const conv = e.conv ?? null;

    if (isActivity(e)) {
      if (lastActivity !== null && e.ts - lastActivity >= BREAK_GAP && !agentWorkingAt(lastActivity)) {
        breaks.push({ start: lastActivity, end: e.ts, kind: 'gap' });
      }
      lastActivity = e.ts;
    }

    switch (e.type) {
      case 'beforeSubmitPrompt': {
        if (e.gen) openTurns.set(e.gen, { ts: e.ts, conv });
        item.convSwitch = lastPromptConv !== null && conv !== null && conv !== lastPromptConv;
        if (conv !== null) lastPromptConv = conv;
        const prev = lastStopByConv.get(conv);
        item.quickReview = !!prev && prev.heavy && e.ts - prev.ts < QUICK_REVIEW;
        const sim = e.data.sim;
        if (typeof sim === 'string') {
          while (recentSims.length && recentSims[0].ts < e.ts - DUPLICATE_WINDOW) recentSims.shift();
          item.duplicate = recentSims.some((r) => hamming(r.sim, sim) <= DUPLICATE_BITS);
          recentSims.push({ ts: e.ts, sim });
        }
        break;
      }
      case 'afterAgentResponse':
      case 'afterFileEdit':
      case 'afterTabFileEdit': {
        if (!e.gen) break;
        const load = turnLoad.get(e.gen) ?? { chars: 0, lines: 0 };
        load.chars += e.data.chars ?? 0;
        load.lines += (e.data.linesAdded ?? 0) + (e.data.linesRemoved ?? 0);
        turnLoad.set(e.gen, load);
        break;
      }
      case 'stop': {
        let gen = e.gen && openTurns.has(e.gen) ? e.gen : null;
        if (!gen) {
          const sameConv = [...openTurns.entries()].filter(([, t]) => t.conv === conv).sort((a, b) => a[1].ts - b[1].ts);
          gen = sameConv.length ? sameConv[0][0] : null;
        }
        if (gen) {
          item.waitMs = e.ts - openTurns.get(gen).ts;
          openTurns.delete(gen);
        }
        const load = turnLoad.get(e.gen ?? gen) ?? { chars: 0, lines: 0 };
        lastStopByConv.set(conv, { ts: e.ts, heavy: load.chars >= HEAVY_TURN_CHARS || load.lines >= HEAVY_TURN_LINES });
        break;
      }
      case 'ext.breakStart':
        explicit.push({ start: e.ts, end: e.ts + (e.data.minutes ?? 5) * MIN, kind: 'explicit' });
        break;
      case 'ext.breakEnd':
        if (explicit.length) explicit[explicit.length - 1].end = Math.min(explicit[explicit.length - 1].end, e.ts);
        break;
      case 'ext.windowBlur':
        if (isOsIdle(e)) idleSince = e.ts;
        break;
      case 'ext.windowFocus':
        if (isOsIdle(e) && idleSince !== null) {
          if (e.ts - idleSince >= BREAK_GAP) breaks.push({ start: idleSince, end: e.ts, kind: 'idle' });
          idleSince = null;
        }
        break;
      case 'ext.calibrate':
        if (e.data.feeling) lastCalibration = { at: e.ts, feeling: e.data.feeling };
        break;
      default:
        break;
    }
    if (conv !== null) lastEventByConv.set(conv, e.ts);
    items.push(item);
  }

  const alive = [...openTurns.values()].filter((turn) => turnAlive(turn, now));
  return {
    items,
    breaks: [...breaks, ...explicit].filter((b) => b.start <= now),
    lastActivity,
    idleSince,
    lastCalibration,
    agentWorking: alive.length > 0,
    openTurnMs: alive.length ? now - Math.min(...alive.map((t) => t.ts)) : 0,
  };
}

function emptyStats() {
  return {
    prompts: 0, promptChars: 0, words: 0, fillers: 0, frustration: 0, profanity: 0, rejections: 0, polite: 0,
    exclaims: 0, questions: 0, pastedLines: 0, voicePrompts: 0, capsPrompts: 0, duplicatePrompts: 0,
    responses: 0, responseChars: 0, thoughtMs: 0,
    turns: 0, aborts: 0, errors: 0, interrupts: 0, toolFailures: 0, shellRuns: 0, failedShellRuns: 0,
    filesEdited: 0, linesAdded: 0, linesRemoved: 0, subagents: 0, compactions: 0,
    waitMs: 0, quickReviews: 0, convSwitches: 0,
    userChars: 0, undos: 0, failedRuns: 0,
  };
}

function statsFor(items, from, to) {
  const w = emptyStats();
  const files = new Set();
  for (const { e, ...tag } of items) {
    if (e.ts < from || e.ts > to) continue;
    const d = e.data;
    switch (e.type) {
      case 'beforeSubmitPrompt':
        w.prompts++;
        w.promptChars += d.chars ?? 0;
        w.words += d.words ?? 0;
        w.fillers += d.fillers ?? 0;
        w.frustration += d.frustration ?? 0;
        w.profanity += d.profanity ?? 0;
        w.rejections += d.rejection ? 1 : 0;
        w.polite += d.polite ?? 0;
        w.exclaims += d.exclaims ?? 0;
        w.questions += d.questions ?? 0;
        w.pastedLines += d.pastedLines ?? 0;
        w.voicePrompts += d.voiceLike ? 1 : 0;
        w.capsPrompts += Array.isArray(d.flags) && d.flags.includes('caps') ? 1 : 0;
        w.duplicatePrompts += tag.duplicate ? 1 : 0;
        w.quickReviews += tag.quickReview ? 1 : 0;
        w.convSwitches += tag.convSwitch ? 1 : 0;
        break;
      case 'afterAgentResponse':
        w.responses++;
        w.responseChars += d.chars ?? 0;
        break;
      case 'afterAgentThought':
        w.thoughtMs += d.durationMs ?? 0;
        break;
      case 'stop':
        w.turns++;
        if (d.status === 'aborted') { w.aborts++; w.interrupts++; }
        if (d.status === 'error') w.errors++;
        w.waitMs += tag.waitMs ?? 0;
        break;
      case 'postToolUseFailure':
        if (d.interrupt) w.interrupts++;
        else w.toolFailures++;
        break;
      case 'afterShellExecution':
        w.shellRuns++;
        w.failedShellRuns += d.failed ? 1 : 0;
        break;
      case 'afterFileEdit':
      case 'afterTabFileEdit':
        if (d.file) files.add(d.file);
        w.linesAdded += d.linesAdded ?? 0;
        w.linesRemoved += d.linesRemoved ?? 0;
        break;
      case 'subagentStart':
        w.subagents++;
        break;
      case 'preCompact':
        w.compactions++;
        break;
      case 'ext.textEdit':
        w.userChars += (d.insertedChars ?? 0) + (d.deletedChars ?? 0);
        break;
      case 'ext.undoRedo':
        w.undos += (d.undos ?? 0) + (d.redos ?? 0);
        break;
      case 'ext.runEnd':
        w.failedRuns += Number.isFinite(d.exitCode) && d.exitCode !== 0 ? 1 : 0;
        break;
      default:
        break;
    }
  }
  w.filesEdited = files.size;
  return w;
}

function trends(items, sessionStart, now) {
  const prompts = items.filter(({ e }) => e.type === 'beforeSubmitPrompt' && e.ts >= sessionStart).map(({ e }) => e);
  const recent = prompts.filter((e) => e.ts >= now - TREND_WINDOW);
  const earlier = prompts.filter((e) => e.ts < now - TREND_WINDOW);
  if (recent.length < 3 || earlier.length < 3) {
    return { promptChars: null, promptGap: null, fillersPerPrompt: null, politePerPrompt: null };
  }
  const gaps = (xs) => xs.slice(1).map((e, i) => e.ts - xs[i].ts);
  const ratio = (a, b) => (a === null || b === null || b === 0 ? null : round(a / b));
  // per-prompt rates are often 0, so they are smoothed to keep the ratio finite
  const smoothed = (key) => ratio(mean(recent.map((e) => e.data[key] ?? 0)) + 0.25, mean(earlier.map((e) => e.data[key] ?? 0)) + 0.25);
  return {
    promptChars: ratio(mean(recent.map((e) => e.data.chars ?? 0)), mean(earlier.map((e) => e.data.chars ?? 0))),
    promptGap: ratio(median(gaps(recent)), median(gaps(earlier))),
    fillersPerPrompt: smoothed('fillers'),
    politePerPrompt: smoothed('polite'),
  };
}

function sessionStarts(events) {
  const starts = [];
  let last = null;
  for (const e of events) {
    if (!isActivity(e)) continue;
    if (last === null || e.ts - last >= SESSION_GAP) starts.push(e.ts);
    last = e.ts;
  }
  return starts;
}

function baseline(events, sessionStart) {
  const history = events.filter((e) => e.ts < sessionStart && e.ts >= sessionStart - HISTORY && isActivity(e));
  const buckets = new Map();
  for (const e of history) {
    const key = Math.floor(e.ts / BASELINE_BUCKET);
    const b = buckets.get(key) ?? { prompts: 0, responseChars: 0, linesChanged: 0 };
    if (e.type === 'beforeSubmitPrompt') b.prompts++;
    if (e.type === 'afterAgentResponse') b.responseChars += e.data.chars ?? 0;
    if (e.type === 'afterFileEdit' || e.type === 'afterTabFileEdit') b.linesChanged += (e.data.linesAdded ?? 0) + (e.data.linesRemoved ?? 0);
    buckets.set(key, b);
  }
  const prompts = history.filter((e) => e.type === 'beforeSubmitPrompt');
  const all = [...buckets.values()];
  const sessions = sessionStarts(history).length;
  return {
    ready: sessions >= 3 && all.length >= 6,
    sessions,
    promptsPer10m: median(all.map((b) => b.prompts)),
    responseCharsPer10m: median(all.map((b) => b.responseChars)),
    linesChangedPer10m: median(all.map((b) => b.linesChanged)),
    promptChars: median(prompts.map((e) => e.data.chars ?? 0)),
    fillersPerPrompt: round(mean(prompts.map((e) => e.data.fillers ?? 0))),
  };
}

function timeline(items, now) {
  const first = Math.floor(now / TIMELINE_BUCKET) * TIMELINE_BUCKET - (TIMELINE_BUCKETS - 1) * TIMELINE_BUCKET;
  const out = Array.from({ length: TIMELINE_BUCKETS }, (_, i) => ({
    start: first + i * TIMELINE_BUCKET, prompts: 0, responseChars: 0, linesChanged: 0, failures: 0, frustration: 0,
  }));
  for (const { e } of items) {
    if (e.ts < first) continue;
    const b = out[Math.floor((e.ts - first) / TIMELINE_BUCKET)];
    if (!b) continue;
    const d = e.data;
    if (e.type === 'beforeSubmitPrompt') {
      b.prompts++;
      b.frustration += (d.frustration ?? 0) + (d.profanity ?? 0);
    }
    if (e.type === 'afterAgentResponse') b.responseChars += d.chars ?? 0;
    if (e.type === 'afterFileEdit' || e.type === 'afterTabFileEdit') b.linesChanged += (d.linesAdded ?? 0) + (d.linesRemoved ?? 0);
    if ((e.type === 'stop' && (d.status === 'aborted' || d.status === 'error'))
      || (e.type === 'postToolUseFailure' && !d.interrupt)
      || (e.type === 'afterShellExecution' && d.failed)) b.failures++;
  }
  return out;
}

function days(events, now) {
  const out = [];
  for (let i = 6; i >= 0; i--) out.push({ date: localDate(now - i * DAY), activeMin: new Set(), prompts: 0, lateMin: new Set() });
  const byDate = new Map(out.map((d) => [d.date, d]));
  for (const e of events) {
    const d = byDate.get(localDate(e.ts));
    if (!d || !isActivity(e) || e.ts > now) continue;
    const minute = Math.floor(e.ts / MIN);
    d.activeMin.add(minute);
    if (isLate(e.ts)) d.lateMin.add(minute);
    if (e.type === 'beforeSubmitPrompt') d.prompts++;
  }
  return out.map((d) => ({ date: d.date, activeMin: d.activeMin.size, prompts: d.prompts, lateMin: d.lateMin.size }));
}

export function buildSnapshot(events, { now = Date.now() } = {}) {
  const past = events.filter((e) => e.ts <= now).sort((x, y) => x.ts - y.ts);
  const a = annotate(past, now);
  const starts = sessionStarts(past);
  const sessionStart = a.lastActivity !== null && now - a.lastActivity < SESSION_GAP && starts.length ? starts[starts.length - 1] : now;

  const today = localDate(now);
  const breaks = a.breaks.filter((b) => b.end <= now);
  const lastBreakEnd = Math.max(sessionStart, ...breaks.map((b) => b.end));
  const awayNow = a.lastActivity !== null && now - a.lastActivity >= BREAK_GAP && !a.agentWorking;
  const explicitNow = a.breaks.some((b) => b.kind === 'explicit' && b.start <= now && now < b.end);
  const idleNow = a.idleSince !== null && now - a.idleSince >= BREAK_GAP;
  const onBreak = awayNow || explicitNow || idleNow;

  const recentConvs = new Set(past.filter((e) => e.src === 'hook' && e.conv && e.ts >= now - 10 * MIN).map((e) => e.conv));

  return {
    v: 1,
    at: now,
    localHour: new Date(now).getHours(),
    session: { startedAt: sessionStart, durationMs: now - sessionStart },
    sinceBreakMs: onBreak ? 0 : now - lastBreakEnd,
    onBreak,
    agentWorking: a.agentWorking,
    openTurnMs: a.openTurnMs,
    parallelConvs: recentConvs.size,
    windows: {
      last10m: statsFor(a.items, now - 10 * MIN, now),
      last60m: statsFor(a.items, now - 60 * MIN, now),
      session: statsFor(a.items, sessionStart, now),
    },
    trends: trends(a.items, sessionStart, now),
    baseline: baseline(past, sessionStart),
    timeline: timeline(a.items, now),
    days: days(past, now),
    feedback: {
      lastCalibration: a.lastCalibration,
      snoozes60m: past.filter((e) => e.type === 'ext.snooze' && e.ts >= now - 60 * MIN).length,
      breaksToday: breaks.filter((b) => localDate(b.end) === today).length,
    },
  };
}

export function loadSnapshot({ dir = petDir(), now = Date.now() } = {}) {
  const events = readEvents(eventsPath(dir)).filter((e) => e.ts >= now - HISTORY - DAY);
  return buildSnapshot(events, { now });
}
