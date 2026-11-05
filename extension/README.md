# extension/ — VS Code/Cursor extension and the pet

Owner: **C**. Spec: [foundation §2.2, §3, §4.1, §4.8](../docs/foundation-spec.md).

- `src/`: activation, sidebar `WebviewViewProvider` (sidebar only; Cursor's bottom panel doesn't render webviews), status bar item, notifications, window focus and typing `ext.*` events, commands (connect hooks, demo mode).
- `webview/`, `media/`: pet UI, animations and art.
- Bundles `../engine/src` and `../contract` with esbuild. Start from `../contract/fixtures/states.json` before the engine is ready.
