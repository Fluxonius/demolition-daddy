#!/usr/bin/env node
'use strict';
// Cursor hook entry: `node hooks/pet-hook.js <hook_event_name>`, payload JSON on stdin.
// Appends one PetEvent line to $CURSOR_PET_DIR/events.jsonl. Always exits 0 and always prints
// valid JSON for the hook, even if anything here fails (foundation §2.3, AGENTS.md hard rules).
const fs = require('node:fs');
const path = require('node:path');

const STDIN_TIMEOUT_MS = 3000;
const argName = process.argv[2];
let done = false;

function sameDir(a, b) {
  const norm = (p) => path.resolve(String(p)).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  return norm(a) === norm(b);
}

function finish(raw) {
  if (done) return;
  done = true;
  let out = {};
  try {
    const { normalize, responseFor } = require('./lib/normalize');
    out = responseFor(argName);
    const payload = JSON.parse(raw);
    const name = payload.hook_event_name || argName;
    out = responseFor(name);
    const { eventsPath, llmWorkspace } = require('./lib/pet-dir');
    const roots = Array.isArray(payload.workspace_roots) ? payload.workspace_roots : [];
    const self = process.env.CURSOR_PET_SELF === '1' || roots.some((r) => sameDir(r, llmWorkspace()));
    const event = self ? null : normalize({ ...payload, hook_event_name: name });
    if (event) {
      const file = eventsPath();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.appendFileSync(file, `${JSON.stringify(event)}\n`);
    }
  } catch {
    // fail open
  }
  process.stdout.write(JSON.stringify(out), () => process.exit(0));
}

try {
  const chunks = [];
  process.stdin.on('data', (c) => chunks.push(c));
  process.stdin.on('end', () => finish(Buffer.concat(chunks).toString('utf8')));
  process.stdin.on('error', () => finish(''));
  setTimeout(() => finish(Buffer.concat(chunks).toString('utf8')), STDIN_TIMEOUT_MS).unref();
} catch {
  finish('');
}
