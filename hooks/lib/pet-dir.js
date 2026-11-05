'use strict';
const os = require('node:os');
const path = require('node:path');

const petDir = () => process.env.CURSOR_PET_DIR || path.join(os.homedir(), '.cursor-pet');
const eventsPath = (dir = petDir()) => path.join(dir, 'events.jsonl');
// Workspace for our own Cursor CLI analyzer runs; hook events from it are not logged.
const llmWorkspace = (dir = petDir()) => path.join(dir, 'llm');

module.exports = { petDir, eventsPath, llmWorkspace };
