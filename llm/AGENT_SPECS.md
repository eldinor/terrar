# Agent Specs For Reusable `suspendRendering`

This file defines agent specs for implementing and maintaining a reusable `suspendRendering` pattern in a separate Babylon.js app.

## Goal

Provide a safe render-loop control mechanism that:

- starts rendering when needed
- stops rendering when idle
- allows temporary explicit suspension during heavy work
- supports nested suspension safely

This spec is intentionally app-agnostic. It does not assume any specific repo structure, React setup, or viewer component layout.

## Target API Shape

Recommended public API:

```ts
type RenderSuspendToken = {
    dispose(): void;
};

interface RenderController {
    beginRendering(): void;
    stopRendering(): void;
    suspendRendering(): RenderSuspendToken;
    markSceneMutated(): void;
}
```

Recommended usage:

```ts
const token = renderController.suspendRendering();

try {
    // expensive scene or asset work
} finally {
    token.dispose();
}
```

## Shared Rules

- `dispose()` must be idempotent.
- Nested suspension must be supported.
- Rendering must not resume until the final active suspension is released.
- The controller must never create duplicate Babylon render loops.
- Explicit suspension must override mutation-triggered rerendering.

## Agent 1: Render Loop Agent

### Responsibility

Own the Babylon engine render-loop lifecycle.

### Concerns

- call `engine.runRenderLoop(...)` only once per active loop
- stop the loop safely with `engine.stopRenderLoop(...)`
- guard against duplicate loop registration
- keep loop start/stop transitions predictable

### Deliverables

- `beginRendering()`
- `stopRendering()`
- loop-state tracking

### Watch Outs

- starting a new loop while one is already active
- resuming while suspended
- stopping a loop that was never started

## Agent 2: Suspension Agent

### Responsibility

Own explicit suspension and resume behavior.

### Concerns

- maintain a suspend counter
- stop rendering immediately when suspension starts
- resume only when suspend count returns to zero
- return a disposable token for each suspension request

### Deliverables

- `suspendRendering()`
- suspend counter implementation
- safe disposable token behavior

### Watch Outs

- double-dispose bugs
- negative suspend counts
- early resume when multiple callers suspended rendering

## Agent 3: Activity Agent

### Responsibility

Own scene-dirty and activity-driven rerender behavior.

### Concerns

- rerender when scene state changes
- record last render activity time
- allow idle auto-stop if desired
- separate “scene changed” from “render loop is allowed to run”

### Deliverables

- `markSceneMutated()`
- dirty-state tracking
- idle timeout hooks if used

### Watch Outs

- a mutation triggering render during active suspension
- activity timestamps not updating correctly
- confusing ready-state logic with dirty-state logic

## Agent 4: Reuse Integration Agent

### Responsibility

Adapt the reusable controller to a new Babylon.js app.

### Concerns

- connect app-specific scene readiness rules
- connect interaction handlers
- connect asset-load / optimize / reload flows
- keep the generic controller separated from app-specific policy

### Deliverables

- app integration layer
- policy callbacks such as:
  - `shouldRender()`
  - `onSceneMutated()`
  - `onIdleTimeout()`

### Watch Outs

- leaking app-specific assumptions into the generic controller
- coupling the controller too tightly to a specific framework
- mixing Babylon engine ownership with unrelated UI state

## Recommended Internal State

Typical internal state for a reusable implementation:

- `renderLoop: (() => void) | null`
- `isRendering: boolean`
- `suspendCount: number`
- `lastRenderActivityAt: number`
- `sceneDirty: boolean`
- `hasRenderedReadyFrame: boolean`

Not every app needs all of these, but this is a solid starting point.

## Recommended Extension Points

For reuse across apps, keep these behaviors configurable:

- how to get the current Babylon `Scene`
- how to decide whether the scene should render
- whether idle auto-suspend is enabled
- what counts as scene activity
- whether a “ready frame” should be forced once before idling

## Suggested Task Routing

- “Fix render loop starts twice”:
  - Render Loop Agent
- “Make suspendRendering safe for nested callers”:
  - Suspension Agent
- “Rendering should restart when the scene changes”:
  - Activity Agent
- “Port this controller into another Babylon app”:
  - Reuse Integration Agent

## Definition Of Done

A reusable `suspendRendering` implementation is complete when:

- rendering stops immediately on suspension
- nested suspension works correctly
- releasing one token does not resume too early
- releasing the last token resumes correctly
- mutation-driven rerendering still works after suspension ends
- no duplicate Babylon render loops are created
- app-specific policy is kept outside the generic controller
