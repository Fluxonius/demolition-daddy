# contract/ — shared types and fixtures

Steward: role **`pet`** (the integrator). Changes are additive only (new optional fields or types), go in a separate `contract: …` PR, and need approval from `pet` plus the consuming role.

| File | Author | Approves | Spec |
|---|---|---|---|
| `events.ts` (`PetEvent`) | `hooks` | `pet` | [§4.3](../docs/foundation-spec.md#43-event-contract-contracteventsts) |
| `state.ts` (`PetState`, `Nudge`, `PetEngine`, webview messages) | `pet` | `ui` | [§4.4](../docs/foundation-spec.md#44-engine-api-and-state-contractstatets) |
| `actions.ts` (`NudgeChannel`, `UiBridge`) | `pet` | `ui` | [§4.8](../docs/foundation-spec.md#48-attention-actions--extension-point) |
| `fixtures/*.jsonl` (event logs: `session-calm`, `session-overload`, recorded) | `hooks` | — | [§4.9](../docs/foundation-spec.md#49-time-warp-and-replay-demo) |
| `fixtures/states.json` (one state per mood and per exercise) | `pet` | `ui` | [§4.9](../docs/foundation-spec.md#49-time-warp-and-replay-demo) |
