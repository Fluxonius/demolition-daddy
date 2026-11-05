# hooks/ — Cursor hook script and installer

Owner: **A**. Spec: [foundation §2.2, §4.2, §4.7](../docs/foundation-spec.md).

- `pet-hook.js`: reads hook JSON from stdin and appends one `PetEvent` line to `$CURSOR_PET_DIR/events.jsonl` (default `~/.cursor-pet/`). Always exits 0 and always prints valid JSON. Has zero dependencies.
- `install.mjs`: idempotently merges our entries into `~/.cursor/hooks.json` (using an absolute script path) and removes them on `--uninstall`.
- Dogfood config for this repo: `../.cursor/hooks.json`.
