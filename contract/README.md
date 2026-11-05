# contract/ — shared types and fixtures

Owner: **A** maintains; every role approves changes. Changes must be additive (new optional fields or types) and go in a separate `contract: …` PR.

To be created first from the foundation spec:
- `events.ts`: `PetEvent` ([§4.3](../docs/foundation-spec.md#43-event-contract-contracteventsts))
- `state.ts`: `PetState`, `PetEngine`, webview messages ([§4.4](../docs/foundation-spec.md#44-engine-api-and-state-contractstatets))
- `actions.ts`: `NudgeChannel` ([§4.8](../docs/foundation-spec.md#48-attention-actions--extension-point))
- `fixtures/`: `session-calm.jsonl`, `session-overload.jsonl`, `states.json` (one state per mood)
