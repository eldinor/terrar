import { Scene } from "@babylonjs/core/scene";
import { TerrainChunk } from "../../terrain/TerrainChunk";
import { TerrainConfig } from "../../terrain/TerrainConfig";
import type { TerrainDebugOverlayController } from "../../terrain/TerrainPresentation";
import type { TerrainDebugOverlay } from "./TerrainDebugOverlay";

export class TerrainDebugOverlayRuntime implements TerrainDebugOverlayController {
  private debugOverlay: TerrainDebugOverlay | null = null;
  private debugOverlayPromise: Promise<TerrainDebugOverlay> | null = null;

  constructor(
    private readonly scene: Scene,
    private readonly chunks: readonly TerrainChunk[],
    private readonly config: TerrainConfig
  ) {}

  async create(): Promise<void> {
    if (this.debugOverlay) {
      return;
    }

    if (!this.debugOverlayPromise) {
      this.debugOverlayPromise = import("./TerrainDebugOverlay").then(
        ({ TerrainDebugOverlay: Overlay }) =>
          new Overlay(this.scene, this.chunks, this.config)
      );
    }

    this.debugOverlay = await this.debugOverlayPromise;
    this.debugOverlay.update();
  }

  update(): void {
    this.debugOverlay?.update();
  }

  async toggle(): Promise<boolean> {
    if (!this.debugOverlay) {
      await this.create();
    }

    const nextVisible = !this.debugOverlay!.isVisible();
    this.debugOverlay!.setVisible(nextVisible);
    return nextVisible;
  }

  dispose(): void {
    this.debugOverlay?.dispose();
    this.debugOverlay = null;
    this.debugOverlayPromise = null;
  }
}
