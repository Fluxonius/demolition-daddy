# demolition-daddy

A Tamagotchi that lives in Cursor and gets tired *with* you while you work with AI coding agents. It recovers only when you take a break. *Other coding pets eat your tokens. Ours eats your breaks.*

Status: hackathon, design stage. No code yet.

## Docs
- [Foundation spec](docs/foundation-spec.md): vision, integration decision, scenarios, architecture, event contract, pet state model, team plan.
- [Feature specs](docs/specs/): one file per feature, built on the foundation spec. Start from [TEMPLATE.md](docs/specs/TEMPLATE.md).
- [AGENTS.md](AGENTS.md): repo conventions (English only in the repo), how to claim a role, and path ownership.

## Roles and layout
| Role ID | Name | Main folders |
|---|---|---|
| `ui` | Design & UI | [`extension/`](extension/)`src/ui/`, `webview/`, `media/` |
| `hooks` | Cursor hooks & events | [`hooks/`](hooks/), `.cursor/hooks.json`, `contract/events.ts` |
| `pet` | Pet behavior & glue (integrator) | [`engine/`](engine/), `extension/src/glue/`, extension manifest, [`contract/`](contract/) steward |

Install and demo instructions will be added once the MVP works.
