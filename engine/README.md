# engine/ — pet behavior, nudge policy, replay and time-warp

Owner: role **`pet`** (Pet behavior & glue). Spec: [foundation §4.4–§4.6, §4.9](../docs/foundation-spec.md).

- `src/`: pure TypeScript with **no `vscode` import**. Exports `createPetEngine`, which:
  - tails the log;
  - reduces events into `PetState` (load, mood, reasons);
  - decides interventions (when and what: level, exercise, line, escalation, override, lock);
  - writes `state.json`.
- `test/`: `node --test` tests that run on `../contract/fixtures`.
- `scripts/replay.mjs`: replays a fixture into a temp `PET_DIR` with `--speed N`.
