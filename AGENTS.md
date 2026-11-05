# AGENTS.md

Read this before editing anything. The design lives in [docs/foundation-spec.md](docs/foundation-spec.md).

## Language
- **Everything in this repository is in English:** docs, specs, code, comments, identifiers, user-facing strings, commit messages, PR titles and descriptions.
- Team chat is in Russian. If a task or discussion arrives in Russian, still write repository content in English.

## Folder ownership
Edit only the folder of the role you are working as. Read anything.

| Folder | Owner | Contents |
|---|---|---|
| `contract/` | A maintains; all approve | Shared TS types and fixtures. **Additive changes only**, in a separate `contract: …` PR |
| `hooks/`, `.cursor/` | A | Hook script, installer, dogfood `hooks.json`, rules |
| `engine/` | B | Load engine, nudge policy, replay and time-warp. Pure TS, **no `vscode` import** |
| `extension/` | C | VS Code/Cursor extension, sidebar webview, pet art |
| `docs/` | everyone | Foundation spec (change via PR) and `docs/specs/<area>-<feature>.md` |
| `AGENTS.md`, `README.md` | A | |

## Hard rules
- Hooks always exit 0 and always print valid JSON. Use `{"continue":true}` for `beforeSubmitPrompt` and `{}` otherwise. Never block by accident.
- Never store prompt or response text. Store lengths, counts, durations and flags only.
- No root `package.json` and no shared lockfile. Don't add dependencies to another role's folder.
- Commit messages: `<area>: <imperative summary>` (areas: `contract`, `hooks`, `engine`, `extension`, `docs`).
- Before a PR, run `git pull --rebase origin main`. Keep PRs small and frequent.
