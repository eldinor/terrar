import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { ProceduralGenerator } from "./ProceduralGenerator";
import { TerrainChunkData } from "./TerrainChunkData";
import {
  DEFAULT_TERRAIN_CONFIG,
  mergeTerrainConfig,
  TerrainConfig,
  TerrainConfigOverrides,
  TerrainLODLevel
} from "./TerrainConfig";
import { TerrainChunk } from "./TerrainChunk";
import { TerrainFoliageCandidate, TerrainFoliagePlanner } from "./TerrainFoliagePlanner";
import { TerrainFoliageStats, TerrainFoliageSystem } from "./TerrainFoliageSystem";
import { TerrainLODController } from "./TerrainLODController";
import { TerrainMeshBuilder } from "./TerrainMeshBuilder";
import { TerrainWaterSystem } from "./TerrainWaterSystem";
import type { TerrainDebugOverlay } from "./TerrainDebugOverlay";
import {
  cloneTerrainMaterialConfig,
  TerrainDebugViewMode,
  TerrainLayerThresholds,
  TerrainMaterialConfig,
  TerrainMaterialFactory
} from "./materials";

export class TerrainSystem {
  readonly config: TerrainConfig;
  private generator: ProceduralGenerator;
  private foliagePlanner: TerrainFoliagePlanner;
  private foliageSystem: TerrainFoliageSystem;
  private waterSystem: TerrainWaterSystem;
  private lodController: TerrainLODController;
  private readonly chunks: TerrainChunk[] = [];
  private readonly chunkGrid: TerrainChunk[][] = [];
  private debugOverlay: TerrainDebugOverlay | null = null;
  private debugOverlayPromise: Promise<TerrainDebugOverlay> | null = null;
  private material: ShaderMaterial | null = null;
  private lodDistances: [number, number, number];
  private collisionRadius: number;
  private foliageRadius: number;
  private debugViewMode = TerrainDebugViewMode.Final;
  private materialConfig: TerrainMaterialConfig | null = null;
  private elapsedTimeSeconds = 0;
  private initialized = false;

  constructor(
    private readonly scene: Scene,
    overrides: TerrainConfigOverrides = {}
  ) {
    this.config = mergeTerrainConfig({
      ...DEFAULT_TERRAIN_CONFIG,
      ...overrides
    });
    this.generator = new ProceduralGenerator(this.config);
    this.foliagePlanner = new TerrainFoliagePlanner(this.config, this.config.seed);
    this.foliageSystem = new TerrainFoliageSystem(
      this.scene,
      this.foliagePlanner,
      this.config
    );
    this.waterSystem = new TerrainWaterSystem(this.scene, this.config);
    this.lodController = new TerrainLODController(this.config);
    this.lodDistances = [...this.config.lodDistances];
    this.collisionRadius = this.config.collisionRadius;
    this.foliageRadius = this.config.foliageRadius;
  }

  initialize(): void {
    if (this.initialized) {
      return;
    }

    this.material = TerrainMeshBuilder.createSharedMaterial(this.scene, this.config);
    this.materialConfig = TerrainMaterialFactory.getConfig(this.material);

    for (let chunkZ = 0; chunkZ < this.config.chunksPerAxis; chunkZ += 1) {
      const row: TerrainChunk[] = [];

      for (let chunkX = 0; chunkX < this.config.chunksPerAxis; chunkX += 1) {
        const chunkData = new TerrainChunkData(
          chunkX,
          chunkZ,
          this.config,
          this.generator
        );
        const chunk = new TerrainChunk(
          this.scene,
          chunkData,
          this.material,
          this.config
        );
        chunk.initializeMeshes();
        row.push(chunk);
        this.chunks.push(chunk);
      }

      this.chunkGrid.push(row);
    }

    this.initialized = true;
    this.foliageSystem.initialize(this.chunks);
    this.waterSystem.initialize();
  }

  update(cameraPosition: Vector3): void {
    if (!this.initialized) {
      throw new Error("TerrainSystem.initialize() must be called before update().");
    }

    this.elapsedTimeSeconds += this.scene.getEngine().getDeltaTime() * 0.001;

    const desiredLods: TerrainLODLevel[][] = [];

    for (let chunkZ = 0; chunkZ < this.config.chunksPerAxis; chunkZ += 1) {
      const row: TerrainLODLevel[] = [];

      for (let chunkX = 0; chunkX < this.config.chunksPerAxis; chunkX += 1) {
        const chunk = this.chunkGrid[chunkZ][chunkX];
        const distance = chunk.distanceTo(cameraPosition);
        row.push(this.getDesiredLod(distance));
      }

      desiredLods.push(row);
    }

    const stabilized = this.lodController.stabilizeLodGrid(desiredLods);

    for (let chunkZ = 0; chunkZ < this.config.chunksPerAxis; chunkZ += 1) {
      for (let chunkX = 0; chunkX < this.config.chunksPerAxis; chunkX += 1) {
        const chunk = this.chunkGrid[chunkZ][chunkX];
        const distance = chunk.distanceTo(cameraPosition);
        chunk.setLOD(stabilized[chunkZ][chunkX]);
        chunk.setCollision(distance < this.collisionRadius);
      }
    }

    this.foliageSystem.update(cameraPosition, this.foliageRadius);
    this.waterSystem.update(this.elapsedTimeSeconds, cameraPosition);
  }

  dispose(): void {
    this.debugOverlay?.dispose();
    this.debugOverlay = null;
    this.debugOverlayPromise = null;
    this.foliageSystem.dispose();
    this.waterSystem.dispose();
    this.chunks.forEach((chunk) => chunk.dispose());
    this.chunks.length = 0;
    this.chunkGrid.length = 0;
    this.material?.dispose(false, true);
    this.material = null;
    this.materialConfig = null;
    this.debugViewMode = TerrainDebugViewMode.Final;
    this.elapsedTimeSeconds = 0;
    this.initialized = false;
  }

  async createDebugOverlay(): Promise<void> {
    if (!this.initialized) {
      throw new Error("TerrainSystem.initialize() must be called before createDebugOverlay().");
    }

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

  updateDebugOverlay(): void {
    this.debugOverlay?.update();
  }

  async toggleDebugOverlay(): Promise<boolean> {
    if (!this.debugOverlay) {
      await this.createDebugOverlay();
    }

    const nextVisible = !this.debugOverlay!.isVisible();
    this.debugOverlay!.setVisible(nextVisible);
    return nextVisible;
  }

  setWireframe(enabled: boolean): void {
    if (!this.material) {
      throw new Error("TerrainSystem.initialize() must be called before setWireframe().");
    }

    this.material.unfreeze();
    this.material.wireframe = enabled;
    this.material.freeze();
  }

  getWireframe(): boolean {
    return this.material?.wireframe ?? false;
  }

  getFoliageCandidatesForChunk(
    chunkX: number,
    chunkZ: number
  ): readonly TerrainFoliageCandidate[] {
    const chunk = this.chunkGrid[chunkZ]?.[chunkX];
    if (!chunk) {
      throw new Error(`Chunk (${chunkX}, ${chunkZ}) is outside the terrain grid.`);
    }

    return this.foliagePlanner.generateCandidates(chunk.data);
  }

  setWaterLevel(level: number): void {
    this.waterSystem.setWaterLevel(level);
  }

  getWaterLevel(): number {
    return this.waterSystem.getWaterLevel();
  }

  setCollisionRadius(radius: number): void {
    this.collisionRadius = radius;
  }

  getCollisionRadius(): number {
    return this.collisionRadius;
  }

  setFoliageRadius(radius: number): void {
    this.foliageRadius = radius;
  }

  getFoliageRadius(): number {
    return this.foliageRadius;
  }

  setLodDistances(distances: readonly [number, number, number]): void {
    this.lodDistances = [...distances];
  }

  getLodDistances(): readonly [number, number, number] {
    return this.lodDistances;
  }

  getConfig(): TerrainConfig {
    return this.config;
  }

  getFoliageStats(): TerrainFoliageStats {
    return this.foliageSystem.getStats();
  }

  setDebugViewMode(mode: TerrainDebugViewMode): void {
    if (!this.material) {
      throw new Error("TerrainSystem.initialize() must be called before setDebugViewMode().");
    }

    TerrainMaterialFactory.setDebugMode(this.material, mode);
    if (this.materialConfig) {
      this.materialConfig.debugMode = mode;
    }
    this.debugViewMode = mode;
  }

  getDebugViewMode(): TerrainDebugViewMode {
    return this.debugViewMode;
  }

  setTerrainMaterialConfig(config: TerrainMaterialConfig): void {
    if (!this.material) {
      throw new Error("TerrainSystem.initialize() must be called before setTerrainMaterialConfig().");
    }

    TerrainMaterialFactory.applyConfig(this.material, config);
    this.materialConfig = cloneTerrainMaterialConfig(config);
    this.debugViewMode = config.debugMode as TerrainDebugViewMode;
  }

  getTerrainMaterialConfig(): TerrainMaterialConfig {
    return cloneTerrainMaterialConfig(
      this.materialConfig ??
        TerrainMaterialFactory.getConfig(this.material!)!
    );
  }

  setTerrainMaterialThresholds(thresholds: TerrainLayerThresholds): void {
    const nextConfig = this.getTerrainMaterialConfig();
    nextConfig.thresholds = { ...thresholds };
    this.setTerrainMaterialConfig(nextConfig);
  }

  getTerrainMaterialThresholds(): TerrainLayerThresholds {
    return { ...this.getTerrainMaterialConfig().thresholds };
  }

  private getDesiredLod(distance: number): TerrainLODLevel {
    const [lod0Distance, lod1Distance, lod2Distance] = this.lodDistances;

    if (distance < lod0Distance) {
      return 0;
    }

    if (distance < lod1Distance) {
      return 1;
    }

    if (distance < lod2Distance) {
      return 2;
    }

    return 3;
  }
}
