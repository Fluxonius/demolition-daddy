# hooks/ — Cursor hook script and installer

Owner: role **`hooks`** (Cursor hooks & events). This role also owns `../.cursor/hooks.json`, `../contract/events.ts` and `../contract/fixtures/*.jsonl`. Spec: [foundation §2, §4.3, §4.7](../docs/foundation-spec.md).

- `pet-hook.js`: reads hook JSON from stdin and appends one `PetEvent` line to `$CURSOR_PET_DIR/events.jsonl` (default `~/.cursor-pet/`). It also sets the local frustration flag and, if enabled, does the hook side of the soft lock. Always exits 0 and always prints valid JSON. Has zero dependencies.
- `install.mjs`: idempotently merges our entries into `~/.cursor/hooks.json` (using an absolute script path) and removes them on `--uninstall`. It also exports `install()`/`uninstall()` for the extension's Connect button (called by `pet`'s glue).
- Which hook means what for the pet goes in `../docs/specs/hooks-event-map.md`.
