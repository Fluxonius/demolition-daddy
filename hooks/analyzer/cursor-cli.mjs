// LLM provider backed by the Cursor CLI in headless print mode (https://cursor.com/docs/cli/overview).
// The request goes to a file in a dedicated workspace ($CURSOR_PET_DIR/llm) so no prompt text has to be
// quoted on a command line, and the run is marked CURSOR_PET_SELF=1 so our own hooks don't log it.
// Note: the CLI sends the request (numbers only) to Cursor's servers.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { llmWorkspace } from '../lib/pet-dir.js';

const INSTRUCTION = 'Follow the instructions in request.md in this workspace. Do not edit any files. Reply with the JSON object only.';
const isWindows = process.platform === 'win32';

// cmd.exe quoting; our arguments are fixed flags, paths and a model id.
const quote = (arg) => (/[\s"&|<>^()%!]/.test(arg) ? `"${arg.replace(/"/g, '""')}"` : arg);

function toRequest(messages) {
  return messages.map((m) => `## ${m.role}\n\n${m.content}`).join('\n\n');
}

export function cursorCliComplete({
  command = [process.env.PET_LLM_CMD || 'agent'],
  model = process.env.PET_LLM_MODEL,
  workspace = llmWorkspace(),
  timeoutMs = 120_000,
} = {}) {
  return (messages) => new Promise((resolve, reject) => {
    fs.mkdirSync(workspace, { recursive: true });
    fs.writeFileSync(path.join(workspace, 'request.md'), toRequest(messages));
    const args = [
      ...command.slice(1),
      '-p', '--output-format', 'json', '--mode', 'ask', '--trust', '--workspace', workspace,
      ...(model ? ['--model', model] : []),
      INSTRUCTION,
    ];
    const child = spawn(isWindows ? quote(command[0]) : command[0], isWindows ? args.map(quote) : args, {
      cwd: workspace,
      env: { ...process.env, CURSOR_PET_SELF: '1' },
      shell: isWindows,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), timeoutMs);
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) return reject(new Error(`Cursor CLI exited with ${code}: ${stderr.trim().slice(0, 500)}`));
      try {
        const out = JSON.parse(stdout);
        if (out.is_error || typeof out.result !== 'string') return reject(new Error('Cursor CLI returned an error result'));
        resolve(out.result);
      } catch (err) {
        reject(err);
      }
    });
  });
}
