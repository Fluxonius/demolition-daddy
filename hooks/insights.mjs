#!/usr/bin/env node
// Print the telemetry snapshot and the fatigue assessment for a pet dir.
// Usage: node hooks/insights.mjs [--dir <PET_DIR>] [--llm] [--model <id>] [--json]
//   --llm    ask the Cursor CLI (`agent`, or PET_LLM_CMD) and fall back to rules on any failure
import { loadSnapshot } from './telemetry.mjs';
import { ruleAnalyzer } from './analyzer/rules.mjs';
import { createLlmAnalyzer } from './analyzer/llm.mjs';
import { cursorCliComplete } from './analyzer/cursor-cli.mjs';
import { petDir } from './lib/pet-dir.js';

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const dir = opt('--dir') ?? petDir();

const snapshot = loadSnapshot({ dir });
const analyzer = args.includes('--llm')
  ? createLlmAnalyzer({ complete: cursorCliComplete({ model: opt('--model') }) })
  : ruleAnalyzer;
const assessment = await analyzer.analyze(snapshot);

if (args.includes('--json')) {
  console.log(JSON.stringify({ snapshot, assessment }, null, 2));
} else {
  const w = snapshot.windows.last60m;
  const min = (ms) => Math.round(ms / 60_000);
  console.log(`Pet dir: ${dir}`);
  console.log(`Session ${min(snapshot.session.durationMs)} min, ${min(snapshot.sinceBreakMs)} min since a break${snapshot.onBreak ? ' (on a break now)' : ''}, agent ${snapshot.agentWorking ? 'working' : 'idle'}`);
  console.log(`Last 60 min: ${w.prompts} prompts, ${Math.round(w.responseChars / 1000)}k chars read, ${w.linesAdded + w.linesRemoved} lines changed, ${w.aborts + w.errors + w.toolFailures + w.failedShellRuns} failures`);
  console.log(`\nLoad ${assessment.load} (${assessment.mood}), source: ${assessment.source}`);
  for (const c of assessment.conditions) console.log(`- ${c.id} ${Math.round(c.confidence * 100)}%: ${c.evidence.join('; ')}`);
  if (!assessment.conditions.length) console.log('- no conditions; the pet is fine');
  for (const a of assessment.advice) console.log(`> [${a.id}${a.exercise ? `, ${a.exercise}` : ''}, ${a.minutes} min] ${a.text}`);
}
