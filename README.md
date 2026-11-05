# demolition-daddy

A Tamagotchi that floats next to Cursor and gets tired *with* you while you work with AI coding agents. It recovers only when you take a break. *Other coding pets eat your tokens. Ours eats your breaks.*

Status: hackathon. The overlay starter runs on a fake state; engine and hooks are in progress.

## Run the pet (overlay)
Cursor's Agents Window doesn't load VS Code extensions, so the pet is a transparent, always-on-top Electron window on your desktop. It watches `~/.cursor-pet/state.json` (override with `CURSOR_PET_DIR`).

```bash
cd overlay && npm install
npm start            # floating pet, bottom-right; right-click or tray icon to quit
npm run fake         # optional: fake state.json that cycles through all moods
npm run serve        # fallback: open http://127.0.0.1:4517/ in Cursor's Browser tab (File > New Browser)
```

More in [overlay/README.md](overlay/README.md).

## Docs
- [Foundation spec](docs/foundation-spec.md): vision, integration decision, scenarios, architecture, event contract, pet state model, team plan.
- [Feature specs](docs/specs/): one file per feature, built on the foundation spec. Start from [TEMPLATE.md](docs/specs/TEMPLATE.md).
- [AGENTS.md](AGENTS.md): repo conventions (English only in the repo), how to claim a role, and path ownership.

## Roles and layout
| Role ID | Name | Main folders |
|---|---|---|
| `ui` | Design & UI | [`overlay/`](overlay/) (optional: [`extension/`](extension/)`src/ui/`, `webview/`, `media/`) |
| `hooks` | Cursor hooks & events | [`hooks/`](hooks/), `.cursor/hooks.json`, `contract/events.ts` |
| `pet` | Pet behavior & glue (integrator) | [`engine/`](engine/) incl. the runner that writes `state.json`, [`contract/`](contract/) steward (optional: `extension/src/glue/`, extension manifest) |

Data flow: Cursor hooks → `~/.cursor-pet/events.jsonl` → engine runner → `~/.cursor-pet/state.json` → overlay. The `state.json` contract is in [foundation spec §4.4.1](docs/foundation-spec.md#441-statejson-file-contract-pet-writes-ui-and-hooks-read).
