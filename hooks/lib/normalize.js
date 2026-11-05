'use strict';
// Cursor hook payload -> one PetEvent (contract/events.ts). Text fields are reduced to numbers here
// and never copied into the event. Payload fields: https://cursor.com/docs/hooks
const path = require('node:path');
const { promptFeatures, editLines, shellFailed } = require('./features');

const HOOK_EVENTS = [
  'beforeSubmitPrompt', 'afterAgentResponse', 'afterAgentThought', 'stop',
  'afterFileEdit', 'afterTabFileEdit', 'postToolUse', 'postToolUseFailure', 'afterShellExecution',
  'sessionStart', 'sessionEnd', 'subagentStart', 'subagentStop', 'preCompact',
];

const PRECOMPACT_MESSAGE = "Long thread! Good moment to stand up while the agent compacts.";

const len = (s) => (typeof s === 'string' ? s.length : 0);
const num = (n) => (Number.isFinite(n) ? n : undefined);

function compact(data) {
  for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];
  return data;
}

function dataFor(name, p) {
  switch (name) {
    case 'beforeSubmitPrompt': {
      const f = promptFeatures(p.prompt);
      return {
        chars: f.chars, words: f.words, flags: f.flags.length ? f.flags : undefined,
        fillers: f.fillers, frustration: f.frustration, profanity: f.profanity, rejection: f.rejection,
        polite: f.polite, exclaims: f.exclaims, questions: f.questions, pastedLines: f.pastedLines,
        voiceLike: f.voiceLike, sim: f.sim,
        attachments: Array.isArray(p.attachments) ? p.attachments.length : undefined,
      };
    }
    case 'afterAgentResponse':
      return { chars: len(p.text) };
    case 'afterAgentThought':
      return { chars: len(p.text), durationMs: num(p.duration_ms) };
    case 'stop':
      return { status: p.status };
    case 'afterFileEdit':
    case 'afterTabFileEdit': {
      const lines = editLines(p.edits);
      return {
        file: typeof p.file_path === 'string' ? path.win32.basename(path.posix.basename(p.file_path)) : undefined,
        edits: Array.isArray(p.edits) ? p.edits.length : undefined,
        linesAdded: lines.added,
        linesRemoved: lines.removed,
      };
    }
    case 'postToolUse':
      return { tool: p.tool_name, durationMs: num(p.duration) };
    case 'postToolUseFailure':
      return { tool: p.tool_name, durationMs: num(p.duration), failure: p.failure_type, interrupt: p.is_interrupt === true };
    case 'afterShellExecution':
      return { tool: 'Shell', durationMs: num(p.duration), chars: len(p.output), failed: shellFailed(p.output) };
    case 'sessionStart':
      return {};
    case 'sessionEnd':
      return { reason: p.reason, durationMs: num(p.duration_ms) };
    case 'subagentStart':
      return { subagentType: p.subagent_type };
    case 'subagentStop':
      return { subagentType: p.subagent_type, status: p.status, durationMs: num(p.duration_ms) };
    case 'preCompact':
      return { contextPct: num(p.context_usage_percent), contextTokens: num(p.context_tokens) };
    default:
      return {};
  }
}

function normalize(payload, now = Date.now()) {
  const name = payload && payload.hook_event_name;
  if (!HOOK_EVENTS.includes(name)) return null;
  const e = { v: 1, ts: now, src: 'hook', type: name };
  const conv = payload.conversation_id || payload.parent_conversation_id;
  if (conv) e.conv = conv;
  if (payload.generation_id) e.gen = payload.generation_id;
  e.data = compact(dataFor(name, payload));
  return e;
}

// beforeSubmitPrompt and subagentStart are permission hooks: anything but a valid answer blocks the action.
function responseFor(name) {
  if (name === 'beforeSubmitPrompt') return { continue: true };
  if (name === 'subagentStart') return { permission: 'allow' };
  if (name === 'preCompact') return { user_message: PRECOMPACT_MESSAGE };
  return {};
}

module.exports = { HOOK_EVENTS, normalize, responseFor };
