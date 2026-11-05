# hooks/ — Cursor hooks, telemetry and fatigue analyzer

Owner: role **`hooks`** (Cursor hooks & events). This role also owns `../.cursor/hooks.json`, `../contract/events.ts` and `../contract/fixtures/*.jsonl`. Specs: [foundation §2, §4.3, §4.7](../docs/foundation-spec.md), [hooks-fatigue-signals](../docs/specs/hooks-fatigue-signals.md), [hooks-event-map](../docs/specs/hooks-event-map.md).

Plain Node ≥ 18, zero dependencies, no `package.json`.

```bash
node --test hooks/test/                      # all tests
node hooks/install.mjs                       # add pet hooks to ~/.cursor/hooks.json (--uninstall, --file <path>)
node hooks/insights.mjs                      # snapshot + assessment for ~/.cursor-pet (--dir, --llm, --model, --json)
node hooks/scripts/make-fixtures.mjs         # regenerate contract/fixtures/session-*.jsonl
```

| Path | What |
|---|---|
| `pet-hook.js` | Hook entry: `node hooks/pet-hook.js <hook_event_name>`, payload on stdin. Appends one `PetEvent` to `$CURSOR_PET_DIR/events.jsonl`. Always exits 0 and prints valid JSON (`{"continue":true}` for `beforeSubmitPrompt`, `{"permission":"allow"}` for `subagentStart`, a `user_message` for `preCompact`, `{}` otherwise). Skips our own analyzer runs |
| `lib/normalize.js` | Payload → `PetEvent`; `HOOK_EVENTS`; per-hook responses |
| `lib/features.js` | Prompt language features (EN + RU fillers, frustration, profanity, rejection, politeness, pasted errors, voice-like, SimHash), edit line counts, shell failure flag. Text never leaves this module |
| `lib/pet-dir.js` | `CURSOR_PET_DIR` resolution |
| `install.mjs` | Idempotent merge into `~/.cursor/hooks.json` with an absolute script path; exports `install()`/`uninstall()` |
| `telemetry.mjs` | `readEvents()`, `buildSnapshot()`, `loadSnapshot()` → `TelemetrySnapshot` (`contract/telemetry.ts`) |
| `analyzer/catalog.mjs` | Condition ids, advice ids with the pet's lines and exercises |
| `analyzer/rules.mjs` | Offline `FatigueAnalyzer` (`ruleAnalyzer`, `assessWithRules`) |
| `analyzer/llm.mjs` | `createLlmAnalyzer({ complete })`: prompt, validation against the catalog, fallback to rules |
| `analyzer/cursor-cli.mjs` | `cursorCliComplete()`: LLM provider via the Cursor CLI (`agent`; override with `PET_LLM_CMD`, `PET_LLM_MODEL`) |
| `insights.mjs` | CLI over the above |

Use from the engine (or anywhere in Node):

```js
import { loadSnapshot } from '../hooks/telemetry.mjs';
import { ruleAnalyzer } from '../hooks/analyzer/rules.mjs';
import { createLlmAnalyzer } from '../hooks/analyzer/llm.mjs';
import { cursorCliComplete } from '../hooks/analyzer/cursor-cli.mjs';

const snapshot = loadSnapshot();                       // honors CURSOR_PET_DIR
const rules = await ruleAnalyzer.analyze(snapshot);    // { load, mood, conditions, advice }
const llm = await createLlmAnalyzer({ complete: cursorCliComplete() }).analyze(snapshot);  // falls back to rules
```
