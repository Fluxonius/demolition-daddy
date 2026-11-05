#!/usr/bin/env node
// Merge our entries into ~/.cursor/hooks.json (or remove them) without touching anyone else's.
// User hooks run from ~/.cursor/, so the script path is absolute (foundation §2.2).
// CLI: node hooks/install.mjs [--uninstall] [--file <hooks.json>]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { HOOK_EVENTS } from './lib/normalize.js';

const SCRIPT = fileURLToPath(new URL('./pet-hook.js', import.meta.url));
const DEFAULT_FILE = path.join(os.homedir(), '.cursor', 'hooks.json');
const isOurs = (entry) => typeof entry?.command === 'string' && entry.command.includes('pet-hook.js');

function load(file) {
  if (!fs.existsSync(file)) return { version: 1, hooks: {} };
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  cfg.version ??= 1;
  cfg.hooks ??= {};
  return cfg;
}

function save(file, cfg) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(cfg, null, 2)}\n`);
}

function withoutOurs(cfg) {
  for (const name of Object.keys(cfg.hooks)) {
    const kept = (cfg.hooks[name] || []).filter((entry) => !isOurs(entry));
    if (kept.length) cfg.hooks[name] = kept;
    else delete cfg.hooks[name];
  }
  return cfg;
}

export function install({ hooksFile = DEFAULT_FILE, script = SCRIPT } = {}) {
  const cfg = withoutOurs(load(hooksFile));
  for (const name of HOOK_EVENTS) {
    cfg.hooks[name] = [...(cfg.hooks[name] || []), { command: `node "${script}" ${name}` }];
  }
  save(hooksFile, cfg);
  return { hooksFile, events: HOOK_EVENTS };
}

export function uninstall({ hooksFile = DEFAULT_FILE } = {}) {
  if (!fs.existsSync(hooksFile)) return { hooksFile, events: [] };
  save(hooksFile, withoutOurs(load(hooksFile)));
  return { hooksFile, events: [] };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf('--file');
  const hooksFile = fileIdx >= 0 ? path.resolve(args[fileIdx + 1]) : DEFAULT_FILE;
  if (args.includes('--uninstall')) {
    uninstall({ hooksFile });
    console.log(`Removed pet hooks from ${hooksFile}`);
  } else {
    install({ hooksFile });
    console.log(`Installed ${HOOK_EVENTS.length} pet hooks into ${hooksFile}. Reload Cursor and start a new chat.`);
  }
}
