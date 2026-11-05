import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { install, uninstall } from '../install.mjs';
import { HOOK_EVENTS } from '../lib/normalize.js';

const tmpFile = (content) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pet-install-')), 'hooks.json');
  if (content !== undefined) fs.writeFileSync(file, JSON.stringify(content));
  return file;
};
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const ours = (entries) => (entries || []).filter((h) => h.command.includes('pet-hook.js'));

test('install creates the file with every hook, using an absolute script path', () => {
  const file = tmpFile();
  install({ hooksFile: file });
  const cfg = read(file);
  assert.equal(cfg.version, 1);
  for (const name of HOOK_EVENTS) {
    const [entry] = ours(cfg.hooks[name]);
    assert.ok(entry, name);
    assert.match(entry.command, new RegExp(`^node ".+pet-hook\\.js" ${name}$`));
    assert.ok(path.isAbsolute(entry.command.match(/"(.+)"/)[1]));
  }
});

test('install keeps foreign hooks and is idempotent', () => {
  const file = tmpFile({ version: 1, hooks: { stop: [{ command: './audit.sh' }], beforeShellExecution: [{ command: './guard.sh' }] } });
  install({ hooksFile: file });
  install({ hooksFile: file });
  const cfg = read(file);
  assert.deepEqual(cfg.hooks.beforeShellExecution, [{ command: './guard.sh' }]);
  assert.equal(cfg.hooks.stop.length, 2);
  assert.equal(cfg.hooks.stop[0].command, './audit.sh');
  for (const name of HOOK_EVENTS) assert.equal(ours(cfg.hooks[name]).length, 1, name);
});

test('uninstall removes only our entries', () => {
  const file = tmpFile({ version: 1, hooks: { stop: [{ command: './audit.sh' }] } });
  install({ hooksFile: file });
  uninstall({ hooksFile: file });
  const cfg = read(file);
  assert.deepEqual(cfg.hooks, { stop: [{ command: './audit.sh' }] });
});

test('install refuses to overwrite an unparsable hooks.json', () => {
  const file = tmpFile();
  fs.writeFileSync(file, '{ broken');
  assert.throws(() => install({ hooksFile: file }));
  assert.equal(fs.readFileSync(file, 'utf8'), '{ broken');
});

test('project .cursor/hooks.json wires every hook to the script', () => {
  const file = fileURLToPath(new URL('../../.cursor/hooks.json', import.meta.url));
  const cfg = read(file);
  assert.equal(cfg.version, 1);
  for (const name of HOOK_EVENTS) {
    assert.deepEqual(cfg.hooks[name], [{ command: `node hooks/pet-hook.js ${name}` }], name);
  }
});
