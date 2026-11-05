# AGENTS.md

Read this before editing anything. The design lives in [docs/foundation-spec.md](docs/foundation-spec.md). Roles are described in §5.2 of the spec.

## Language
- **Everything in this repository is in English:** docs, specs, code, comments, identifiers, user-facing strings, commit messages, PR titles and descriptions.
- Team chat is in Russian. If a task or discussion arrives in Russian, still write repository content in English.

## Claim a role
1. **At the start of every session, ask the human which role you are working as** (`ui`, `hooks` or `pet`), unless the prompt already states it. Don't edit files until you know.
2. **Edit only the paths owned by that role** (table below). You may read everything.
3. **If the task needs a change outside your paths, don't make it.** Instead, write a change note: tell the human in chat, or add a `## Change requests` section to your PR description. Say which file, what change and why. The owner makes the change.
4. **For `contract/` changes,** the note must say "contract change". These changes are additive only (new optional fields or types), go in a separate `contract: …` PR, and need approval from `pet` plus the consuming role.

| Role ID | Name | Owns | First tasks | Interfaces with |
|---|---|---|---|---|
| `ui` | Design & UI | `extension/src/ui/`, `extension/webview/`, `extension/media/` | Pet name and art style. Standalone webview page rendering every mood from `contract/fixtures/states.json`. Exercise animations. Bubble, status bar and toast look | `pet`, through `ToWebview`/`FromWebview`, `UiBridge` and `NudgeChannel` |
| `hooks` | Cursor hooks & events | `hooks/`, `.cursor/hooks.json`, `contract/events.ts`, `contract/fixtures/*.jsonl` | `contract/events.ts`. `pet-hook.js` and `.cursor/hooks.json`. Verify real payloads. Record a real fixture. Installer | `pet`, through `events.jsonl`, `state.json` (lock) and `install()`/`uninstall()` |
| `pet` | Pet behavior & glue (integrator, merges) | `engine/`, `extension/package.json`, `extension/src/extension.ts`, `extension/src/glue/`, `contract/state.ts`, `contract/actions.ts`, `contract/fixtures/states.json`, `AGENTS.md`, `README.md`, `.cursor/rules/` | `contract/state.ts`, `actions.ts` and `states.json`. Extension skeleton. Engine reducer and load score with tests. Nudge policy | `hooks` (events in) and `ui` (state out, clicks in) |

`docs/specs/<role>-<feature>.md` belongs to its author. `docs/foundation-spec.md` changes go through a PR stewarded by `pet`.

**Who decides what about fatigue:**
- `pet` decides **when and what**: the nudge, the exercise, the pet's lines, escalation and overrides.
- `ui` decides **how it looks**.
- `hooks` decides **what we can observe**.

## Hard rules
- Hooks always exit 0 and always print valid JSON. Use `{"continue":true}` for `beforeSubmitPrompt` and `{}` otherwise. Never block by accident.
- Never store prompt or response text. Store lengths, counts, durations and flags only.
- `engine/` is pure TS with no `vscode` import.
- No root `package.json` and no shared lockfile. Don't add dependencies to another role's folder.
- Branches: `<role>/<topic>`. Commit messages: `<area>: <imperative summary>`, where area is `ui`, `hooks`, `pet`, `contract` or `docs`.
- Before a PR, run `git pull --rebase origin main`. Keep PRs small and frequent. Self-merge only if the PR touches only your role's paths.
