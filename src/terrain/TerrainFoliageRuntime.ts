import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { TerrainChunk } from "./TerrainChunk";
import { TerrainConfig } from "./TerrainConfig";
import {
  TerrainFoliageCandidate,
  TerrainFoliagePlanner
} from "./TerrainFoliagePlanner";
import { TerrainFoliageStats, TerrainFoliageSystem } from "./TerrainFoliageSystem";

export class TerrainFoliageRuntime {
  private readonly planner: TerrainFoliagePlanner;
  private readonly system: TerrainFoliageSystem;
  private readonly config: TerrainConfig;
  private foliageRadius: number;
  private foliageVisible = false;
  private foliageInitPromise: Promise<void> | null = null;
  private foliageInitAbortController: AbortController | null = null;

  constructor(scene: Scene, config: TerrainConfig) {
    this.config = config;
    this.planner = new TerrainFoliagePlanner(this.config, this.config.seed);
    this.system = new TerrainFoliageSystem(scene, this.planner, this.config);
    this.foliageRadius = this.config.foliageRadius;
    this.foliageVisible = this.config.buildFoliage;
  }

  initialize(chunks: readonly TerrainChunk[]): void {
    if (!this.config.buildFoliage) {
      return;
    }

    this.foliageInitAbortController?.abort();
    this.foliageInitAbortController = new AbortController();
    this.foliageInitPromise = this.system
      .initializeAsync(chunks, this.foliageInitAbortController.signal)
      .catch((error) => {
        if (!this.foliageInitAbortController?.signal.aborted) {
          console.error("Foliage initialization failed.", error);
        }
      })
      .finally(() => {
        this.foliageInitPromise = null;
      });
  }

  update(cameraPosition: Vector3): void {
    this.system.update(
      cameraPosition,
      this.foliageVisible ? this.foliageRadius : 0
    );
  }

  dispose(): void {
    this.foliageInitAbortController?.abort();
    this.foliageInitAbortController = null;
    this.foliageInitPromise = null;
    this.system.dispose();
  }

  whenReady(): Promise<void> {
    return this.foliageInitPromise ?? Promise.resolve();
  }

  getCandidatesForChunk(chunk: TerrainChunk): readonly TerrainFoliageCandidate[] {
    return this.planner.generateCandidates(chunk.data);
  }

  setFoliageRadius(radius: number): void {
    this.foliageRadius = radius;
  }

  getFoliageRadius(): number {
    return this.foliageRadius;
  }

  setShowFoliage(enabled: boolean): void {
    this.foliageVisible = enabled && this.config.buildFoliage;
  }

  getShowFoliage(): boolean {
    return this.foliageVisible;
  }

  getStats(): TerrainFoliageStats {
    return this.system.getStats();
  }
}
