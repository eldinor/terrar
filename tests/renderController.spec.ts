import { describe, expect, it, vi } from "vitest";
import {
  createRenderController,
  type RenderController,
} from "../src/adapters/babylon/RenderController";
import {
  DEFAULT_DEMO_RENDER_POLICY,
  resolveTerrainDemoRenderPolicy,
} from "../src/demo/createTerrainDemo";

interface EngineStub {
  runRenderLoop: ReturnType<typeof vi.fn>;
  stopRenderLoop: ReturnType<typeof vi.fn>;
}

function createEngineStub(): EngineStub {
  return {
    runRenderLoop: vi.fn(),
    stopRenderLoop: vi.fn(),
  };
}

function getRegisteredLoop(engine: EngineStub): (() => void) | undefined {
  const [[loop]] = engine.runRenderLoop.mock.calls as [[() => void]?];
  return loop;
}

describe("createRenderController", () => {
  it("does not register duplicate render loops", () => {
    const engine = createEngineStub();
    const controller = createRenderController(engine as never, {
      renderFrame: vi.fn(),
    });

    controller.beginRendering();
    controller.beginRendering();

    expect(engine.runRenderLoop).toHaveBeenCalledTimes(1);
  });

  it("stops immediately on suspend and resumes only after the last token is released", () => {
    const engine = createEngineStub();
    const renderFrame = vi.fn();
    const controller = createRenderController(engine as never, {
      renderFrame,
    });

    controller.markSceneMutated();
    expect(engine.runRenderLoop).toHaveBeenCalledTimes(1);

    const outer = controller.suspendRendering();
    const inner = controller.suspendRendering();

    expect(engine.stopRenderLoop).toHaveBeenCalledTimes(1);

    outer.dispose();
    expect(engine.runRenderLoop).toHaveBeenCalledTimes(1);

    inner.dispose();
    expect(engine.runRenderLoop).toHaveBeenCalledTimes(2);

    inner.dispose();
    expect(engine.runRenderLoop).toHaveBeenCalledTimes(2);
  });

  it("keeps rendering alive while the app reports activity and idles out afterward", () => {
    const engine = createEngineStub();
    const renderFrame = vi.fn();
    let now = 0;
    let activeFramesRemaining = 2;
    const controller = createRenderController(engine as never, {
      idleTimeoutMs: 10,
      now: () => now,
      renderFrame,
      shouldRender: () => activeFramesRemaining-- > 0,
    });

    controller.markSceneMutated();
    const loop = getRegisteredLoop(engine);
    expect(loop).toBeTypeOf("function");

    loop?.();
    now = 5;
    loop?.();
    now = 9;
    loop?.();
    expect(engine.stopRenderLoop).not.toHaveBeenCalled();

    now = 16;
    loop?.();
    expect(engine.stopRenderLoop).toHaveBeenCalledTimes(1);
    expect(renderFrame).toHaveBeenCalledTimes(3);
  });

  it("restarts from a suspended dirty scene when a token is released", () => {
    const engine = createEngineStub();
    const controller: RenderController = createRenderController(engine as never, {
      renderFrame: vi.fn(),
    });

    const token = controller.suspendRendering();
    controller.markSceneMutated();

    expect(engine.runRenderLoop).not.toHaveBeenCalled();

    token.dispose();

    expect(engine.runRenderLoop).toHaveBeenCalledTimes(1);
  });

  it("can disable the forced ready frame policy", () => {
    const engine = createEngineStub();
    const renderFrame = vi.fn();
    let now = 0;
    const controller = createRenderController(engine as never, {
      forceReadyFrame: false,
      idleTimeoutMs: 10,
      now: () => now,
      renderFrame,
    });

    controller.beginRendering();
    const loop = getRegisteredLoop(engine);

    loop?.();

    expect(renderFrame).toHaveBeenCalledTimes(1);
    expect(engine.stopRenderLoop).not.toHaveBeenCalled();

    now = 11;
    loop?.();

    expect(renderFrame).toHaveBeenCalledTimes(1);
    expect(engine.stopRenderLoop).toHaveBeenCalledTimes(1);
  });
});

describe("resolveTerrainDemoRenderPolicy", () => {
  it("falls back to the shared default demo render policy", () => {
    expect(resolveTerrainDemoRenderPolicy()).toBe(DEFAULT_DEMO_RENDER_POLICY);
    expect(resolveTerrainDemoRenderPolicy(undefined)).toBe(DEFAULT_DEMO_RENDER_POLICY);
  });

  it("preserves an explicitly provided render policy", () => {
    const customPolicy = {
      idleTimeoutMs: 100,
      forceReadyFrame: false,
    };

    expect(resolveTerrainDemoRenderPolicy(customPolicy)).toBe(customPolicy);
  });
});
