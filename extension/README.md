# extension/ — VS Code/Cursor extension

Two roles share this folder, split by path. Spec: [foundation §4.1, §4.2, §4.8, §5.1](../docs/foundation-spec.md).

| Path | Owner | What |
|---|---|---|
| `package.json`, `esbuild.mjs`, `tsconfig.json` | `pet` | Manifest (views, commands, settings), build, `.vsix`. `ui` asks `pet` for contribution changes |
| `src/extension.ts` | `pet` | `activate()`: starts the engine, the glue and `activateUi()` |
| `src/glue/` | `pet` | State store, `ext.*` signals (focus/blur, typing), commands (Connect, demo mode), nudge dispatcher |
| `src/ui/` | `ui` | `activateUi()`, sidebar `WebviewViewProvider` (sidebar only; Cursor's bottom panel doesn't render webviews), status bar and toast renderers as `NudgeChannel`s |
| `webview/` | `ui` | Pet HTML/CSS/JS and animations. Works standalone in a browser on `../contract/fixtures/states.json` |
| `media/` | `ui` | Sprites and icons |

The seam between the two halves is `UiBridge`, `NudgeChannel` and the webview messages in `../contract/`. The build bundles `../engine/src`, `../contract` and `../hooks/install.mjs` with esbuild.
