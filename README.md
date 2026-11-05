# demolition-daddy

A Tamagotchi that lives in Cursor and gets tired *with* you while you work with AI coding agents. It recovers only when you take a break. *Other coding pets eat your tokens. Ours eats your breaks.*

Status: hackathon, design stage. No code yet.

## Docs
- [Foundation spec](docs/foundation-spec.md): vision, integration decision, scenarios, architecture, event contract, pet state model, team plan.
- [Feature specs](docs/specs/): one file per feature, built on the foundation spec. Start from [TEMPLATE.md](docs/specs/TEMPLATE.md).
- [AGENTS.md](AGENTS.md): repo conventions (English only in the repo) and folder ownership.

## Layout
| Folder | Owner | What |
|---|---|---|
| [`contract/`](contract/) | shared (A) | Event and state types, fixtures |
| [`hooks/`](hooks/) | A | Cursor hook script and installer |
| [`engine/`](engine/) | B | Load engine, replay, time-warp |
| [`extension/`](extension/) | C | Cursor extension, sidebar pet UI |

Install and demo instructions will be added once the MVP works.
