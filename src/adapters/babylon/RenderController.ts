import type { Engine } from "@babylonjs/core/Engines/engine";

export interface RenderSuspendToken {
  dispose(): void;
}

export interface RenderControllerState {
  readonly isRendering: boolean;
  readonly suspendCount: number;
  readonly lastRenderActivityAt: number;
  readonly sceneDirty: boolean;
  readonly hasRenderedReadyFrame: boolean;
}

export interface RenderController {
  beginRendering(): void;
  stopRendering(): void;
  suspendRendering(): RenderSuspendToken;
  markSceneMutated(): void;
}

export interface RenderControllerOptions {
  readonly forceReadyFrame?: boolean;
  readonly idleTimeoutMs?: number;
  readonly now?: () => number;
  readonly renderFrame: () => void;
  readonly shouldRender?: (state: RenderControllerState) => boolean;
}

export function createRenderController(
  engine: Engine,
  options: RenderControllerOptions
): RenderController {
  const forceReadyFrame = options.forceReadyFrame ?? true;
  const idleTimeoutMs = Math.max(options.idleTimeoutMs ?? 250, 0);
  const now = options.now ?? (() => performance.now());
  const renderLoop = (): void => {
    if (state.suspendCount > 0) {
      stopRendering();
      return;
    }

    const shouldForceFrame =
      state.sceneDirty || (forceReadyFrame && !state.hasRenderedReadyFrame);
    const isExternallyActive = options.shouldRender?.(snapshotState()) ?? false;
    if (!shouldForceFrame && !isExternallyActive) {
      const idleForMs = now() - state.lastRenderActivityAt;
      if (idleForMs >= idleTimeoutMs) {
        stopRendering();
        return;
      }
    }

    options.renderFrame();

    if (shouldForceFrame || isExternallyActive) {
      state.lastRenderActivityAt = now();
    }

    state.sceneDirty = false;
    state.hasRenderedReadyFrame = true;
  };

  const state = {
    isRendering: false,
    suspendCount: 0,
    lastRenderActivityAt: now(),
    sceneDirty: true,
    hasRenderedReadyFrame: false,
  };

  const snapshotState = (): RenderControllerState => ({
    isRendering: state.isRendering,
    suspendCount: state.suspendCount,
    lastRenderActivityAt: state.lastRenderActivityAt,
    sceneDirty: state.sceneDirty,
    hasRenderedReadyFrame: state.hasRenderedReadyFrame,
  });

  const stopRendering = (): void => {
    if (!state.isRendering) {
      return;
    }

    engine.stopRenderLoop(renderLoop);
    state.isRendering = false;
  };

  const beginRendering = (): void => {
    if (state.isRendering || state.suspendCount > 0) {
      return;
    }

    state.lastRenderActivityAt = now();
    engine.runRenderLoop(renderLoop);
    state.isRendering = true;
  };

  const markSceneMutated = (): void => {
    state.sceneDirty = true;
    state.lastRenderActivityAt = now();
    if (state.suspendCount === 0) {
      beginRendering();
    }
  };

  return {
    beginRendering,
    stopRendering,
    suspendRendering(): RenderSuspendToken {
      state.suspendCount += 1;
      stopRendering();

      let disposed = false;
      return {
        dispose(): void {
          if (disposed) {
            return;
          }

          disposed = true;
          state.suspendCount = Math.max(0, state.suspendCount - 1);
          if (state.suspendCount === 0 && state.sceneDirty) {
            beginRendering();
          }
        },
      };
    },
    markSceneMutated,
  };
}
