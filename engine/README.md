# engine/ — load engine, nudge policy, replay and time-warp

Owner: **B**. Spec: [foundation §4.4–§4.6, §4.9](../docs/foundation-spec.md).

- `src/`: pure TypeScript with **no `vscode` import**. Exports `createPetEngine` (tails the log, reduces events into `PetState`, applies the nudge policy, writes `state.json`).
- `test/`: `node --test` tests that run on `../contract/fixtures`.
- `scripts/replay.mjs`: replays a fixture into a temp `PET_DIR` with `--speed N`.
