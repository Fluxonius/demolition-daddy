# engine/ — pet behavior, nudge policy, replay and time-warp

Owner: role **`pet`** (Pet behavior & glue). Spec: [foundation §4.4–§4.6, §4.9](../docs/foundation-spec.md).

- `src/`: pure TypeScript with **no `vscode` import**. Exports `createPetEngine`, which:
  - tails the log;
  - reduces events into `PetState` (load, mood, reasons);
  - decides interventions (when and what: level, exercise, line, escalation, override, lock);
  - writes `state.json`.
- `test/`: `node --test` tests that run on `../contract/fixtures`.
- `scripts/replay.mjs`: replays a fixture into a temp `PET_DIR` with `--speed N`.
- Runner (e.g. `scripts/run.mjs`): standalone Node process that tails `events.jsonl` and writes `state.json` for the overlay, following [foundation §4.4.1](../docs/foundation-spec.md#441-statejson-file-contract-pet-writes-ui-and-hooks-read): atomic write, heartbeat at least every 30 s. Since v1.1 the engine no longer runs inside the extension.
