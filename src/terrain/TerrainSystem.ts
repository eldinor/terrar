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
import {
  TerrainChunkBuildCoordinator,
  TerrainChunkBuildProgress
} from "./TerrainChunkBuildCoordinator";
import { packTerrainSnapshot, unpackTerrainSnapshot } from "./TerrainSnapshotLayout";
import { TerrainFoliageCandidate } from "./TerrainFoliagePlanner";
import { TerrainFoliageRuntime } from "./TerrainFoliageRuntime";
import { TerrainFoliageStats } from "./TerrainFoliageSystem";
import { TerrainFeatureRuntime } from "./TerrainFeatureRuntime";
import { TerrainChunkVisibilityRuntime } from "./TerrainChunkVisibilityRuntime";
import { TerrainLODController } from "./TerrainLODController";
import { TerrainPoi } from "./TerrainPoiPlanner";
import {
  TerrainDebugOverlayController,
  TerrainPoiDebugConfig,
  TerrainPoiMeshStats,
  TerrainPoiStats
} from "./TerrainPresentation";
import { TerrainRoad } from "./TerrainRoadPlanner";
import { TerrainRoadStats } from "./TerrainRoadSystem";
import { TerrainSurfaceRuntime } from "./TerrainSurfaceRuntime";
import { TerrainWaterConfig } from "./TerrainWaterSystem";
import type { BuiltTerrain } from "../builder";
import {
  TerrainChunkBuildProfile,
  TerrainChunkMeshRuntime
} from "./TerrainChunkMeshRuntime";
import {
  TerrainDebugViewMode,
  TerrainLayerThresholds,
  TerrainMaterialConfig,
  TerrainTextureOptions
} from "./materials";

export class TerrainSystem {
  private static liveSystemCount = 0;
  readonly config: TerrainConfig;
  private generator: ProceduralGenerator;
  private foliageRuntime: TerrainFoliageRuntime;
  private featureRuntime: TerrainFeatureRuntime;
  private surfaceRuntime: TerrainSurfaceRuntime;
  private visibilityRuntime: TerrainChunkVisibilityRuntime | null = null;
  private debugOverlayRuntime: TerrainDebugOverlayController | null = null;
  private lodController: TerrainLODController;
  private readonly chunks: TerrainChunk[] = [];
  private readonly chunkGrid: TerrainChunk[][] = [];
  private readonly textureOptions: Required<TerrainTextureOptions>;
  private elapsedTimeSeconds = 0;
  private initialized = false;
  private disposed = false;
  private chunkBuildPromise: Promise<void> | null = null;
  private chunkMeshRuntime: TerrainChunkMeshRuntime | null = null;

  constructor(
    private readonly scene: Scene,
    overrides: TerrainConfigOverrides = {},
    textureOptions: TerrainTextureOptions = {},
    private readonly prebuiltWorld: BuiltTerrain | null = null,
    private readonly buildOptions: TerrainSystemBuildOptions = {}
  ) {
    TerrainSystem.liveSystemCount += 1;
    this.config = mergeTerrainConfig({
      ...DEFAULT_TERRAIN_CONFIG,
      ...overrides
    });
    this.generator = new ProceduralGenerator(
      this.config,
      this.prebuiltWorld ? unpackTerrainSnapshot(this.prebuiltWorld.packedSnapshot) : null
    );
    this.textureOptions = {
      useGeneratedTextures: true,
      maxTextureSize: 512,
      ...textureOptions
    };
    this.foliageRuntime = new TerrainFoliageRuntime(this.scene, this.config);
    this.featureRuntime = new TerrainFeatureRuntime(
      this.scene,
      this.config,
      this.generator,
      this.prebuiltWorld,
      this.buildOptions.presentation
    );
    this.surfaceRuntime = new TerrainSurfaceRuntime(
      this.scene,
      this.config,
      this.generator,
      this.textureOptions
    );
    this.lodController = new TerrainLODController(this.config);
  }

  initialize(): void {
    if (this.initialized) {
      return;
    }

    this.featureRuntime.initialize();
    const roads = this.featureRuntime.getRoads();
    const poiSites = this.featureRuntime.getPoiSites();
    const roadMaskTexture = this.featureRuntime.getRoadMaskTexture();
    const material = this.surfaceRuntime.initialize(roadMaskTexture);

    for (let chunkZ = 0; chunkZ < this.config.chunksPerAxis; chunkZ += 1) {
      const row: TerrainChunk[] = [];

      for (let chunkX = 0; chunkX < this.config.chunksPerAxis; chunkX += 1) {
        const chunkData = new TerrainChunkData(
          chunkX,
          chunkZ,
          this.config,
          this.generator,
          roads,
          poiSites
        );
        const chunk = new TerrainChunk(
          this.scene,
          chunkData,
          material,
          this.config
        );
        row.push(chunk);
        this.chunks.push(chunk);
      }

      this.chunkGrid.push(row);
    }

    this.initialized = true;
    this.visibilityRuntime = new TerrainChunkVisibilityRuntime(
      this.scene,
      this.config,
      this.chunkGrid,
      this.lodController
    );
    this.debugOverlayRuntime =
      this.buildOptions.presentation?.createDebugOverlayController?.(
        this.scene,
        this.chunks,
        this.config
      ) ?? null;
    this.foliageRuntime.initialize(this.chunks);
    this.chunkMeshRuntime = new TerrainChunkMeshRuntime(
      this.scene,
      this.config,
      this.chunks,
      this.chunkGrid,
      material,
      {
        coordinator: this.buildOptions.chunkBuildCoordinator ?? null,
        buildVersion: this.buildOptions.chunkBuildVersion,
        initialCameraPosition: this.buildOptions.initialCameraPosition ?? null,
        onProgress: this.buildOptions.onChunkBuildProgress
      }
    );
    this.chunkBuildPromise = this.chunkMeshRuntime.initialize(
      this.featureRuntime.getPoiSites(),
      roads,
      this.prebuiltWorld?.packedSnapshot ?? packTerrainSnapshot(this.generator.createSnapshot())
    );
  }

  update(cameraPosition: Vector3): void {
    if (!this.initialized) {
      throw new Error("TerrainSystem.initialize() must be called before update().");
    }

    this.elapsedTimeSeconds += this.scene.getEngine().getDeltaTime() * 0.001;
    this.visibilityRuntime?.update(cameraPosition);
    this.foliageRuntime.update(cameraPosition);
    this.featureRuntime.update();
    this.surfaceRuntime.update(this.elapsedTimeSeconds, cameraPosition);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    TerrainSystem.liveSystemCount = Math.max(0, TerrainSystem.liveSystemCount - 1);
    this.chunkMeshRuntime?.dispose();
    this.chunkMeshRuntime = null;
    this.debugOverlayRuntime?.dispose();
    this.debugOverlayRuntime = null;
    this.visibilityRuntime = null;
    this.foliageRuntime.dispose();
    this.featureRuntime.dispose();
    this.surfaceRuntime.dispose();
    this.chunks.forEach((chunk) => chunk.dispose());
    this.chunks.length = 0;
    this.chunkGrid.length = 0;
    this.elapsedTimeSeconds = 0;
    this.chunkBuildPromise = null;
    this.initialized = false;
  }

  whenChunkMeshesReady(): Promise<void> {
    return this.chunkBuildPromise ?? Promise.resolve();
  }

  whenFoliageReady(): Promise<void> {
    return this.foliageRuntime.whenReady();
  }

  getPendingChunkMeshCount(): number {
    return this.chunkMeshRuntime?.getPendingChunkMeshCount() ?? 0;
  }

  isApplyingChunkMeshes(): boolean {
    return this.chunkMeshRuntime?.isApplyingChunkMeshes() ?? false;
  }

  getChunkBuildProfile(): TerrainChunkBuildProfile {
    return this.chunkMeshRuntime?.getChunkBuildProfile() ?? {
      workerBuildMs: 0,
      meshApplyMs: 0
    };
  }

  getChunkCount(): number {
    return this.chunks.length;
  }

  getLoadedChunkMeshCount(): number {
    return this.chunks.reduce((total, chunk) => total + chunk.getMeshCount(), 0);
  }

  static getLiveSystemCount(): number {
    return TerrainSystem.liveSystemCount;
  }

  async createDebugOverlay(): Promise<void> {
    if (!this.initialized) {
      throw new Error("TerrainSystem.initialize() must be called before createDebugOverlay().");
    }

    await this.debugOverlayRuntime?.create();
  }

  updateDebugOverlay(): void {
    this.debugOverlayRuntime?.update();
  }

  async toggleDebugOverlay(): Promise<boolean> {
    if (!this.debugOverlayRuntime) {
      throw new Error("TerrainSystem.initialize() must be called before toggleDebugOverlay().");
    }
    return this.debugOverlayRuntime.toggle();
  }

  setWireframe(enabled: boolean): void {
    this.surfaceRuntime.setWireframe(enabled);
  }

  getWireframe(): boolean {
    return this.surfaceRuntime.getWireframe();
  }

  getFoliageCandidatesForChunk(
    chunkX: number,
    chunkZ: number
  ): readonly TerrainFoliageCandidate[] {
    const chunk = this.chunkGrid[chunkZ]?.[chunkX];
    if (!chunk) {
      throw new Error(`Chunk (${chunkX}, ${chunkZ}) is outside the terrain grid.`);
    }

    return this.foliageRuntime.getCandidatesForChunk(chunk);
  }

  setWaterLevel(level: number): void {
    this.surfaceRuntime.setWaterLevel(level);
  }

  getWaterLevel(): number {
    return this.surfaceRuntime.getWaterLevel();
  }

  setWaterConfig(config: TerrainWaterConfig): void {
    this.surfaceRuntime.setWaterConfig(config);
  }

  getWaterConfig(): TerrainWaterConfig {
    return this.surfaceRuntime.getWaterConfig();
  }

  setCollisionRadius(radius: number): void {
    this.visibilityRuntime?.setCollisionRadius(radius);
  }

  getCollisionRadius(): number {
    return this.visibilityRuntime?.getCollisionRadius() ?? this.config.collisionRadius;
  }

  setFoliageRadius(radius: number): void {
    this.foliageRuntime.setFoliageRadius(radius);
  }

  getFoliageRadius(): number {
    return this.foliageRuntime.getFoliageRadius();
  }

  setShowFoliage(enabled: boolean): void {
    this.foliageRuntime.setShowFoliage(enabled);
  }

  getShowFoliage(): boolean {
    return this.foliageRuntime.getShowFoliage();
  }

  setLodDistances(distances: readonly [number, number, number]): void {
    this.visibilityRuntime?.setLodDistances(distances);
  }

  getLodDistances(): readonly [number, number, number] {
    return this.visibilityRuntime?.getLodDistances() ?? this.config.lodDistances;
  }

  getConfig(): TerrainConfig {
    return this.config;
  }

  getTextureOptions(): Required<TerrainTextureOptions> {
    return { ...this.textureOptions };
  }

  getFoliageStats(): TerrainFoliageStats {
    return this.foliageRuntime.getStats();
  }

  getPoiSites(): readonly TerrainPoi[] {
    return this.featureRuntime.getPoiSites();
  }

  getPoiStats(): TerrainPoiStats {
    return this.featureRuntime.getPoiStats();
  }

  getPoiMeshStats(): TerrainPoiMeshStats {
    return this.featureRuntime.getPoiMeshStats();
  }

  setPoiDebugConfig(config: TerrainPoiDebugConfig): void {
    this.featureRuntime.setPoiDebugConfig(config);
  }

  getPoiDebugConfig(): TerrainPoiDebugConfig {
    return this.featureRuntime.getPoiDebugConfig();
  }

  getRoads(): readonly TerrainRoad[] {
    return this.featureRuntime.getRoads();
  }

  getRoadStats(): TerrainRoadStats {
    return this.featureRuntime.getRoadStats();
  }

  setShowPoi(enabled: boolean): void {
    this.featureRuntime.setShowPoi(enabled);
  }

  getShowPoi(): boolean {
    return this.featureRuntime.getShowPoi();
  }

  setPoiMarkerMeshesVisible(enabled: boolean): void {
    this.featureRuntime.setPoiMarkerMeshesVisible(enabled);
  }

  getPoiMarkerMeshesVisible(): boolean {
    return this.featureRuntime.getPoiMarkerMeshesVisible();
  }

  setPoiLabelsVisible(enabled: boolean): void {
    this.featureRuntime.setPoiLabelsVisible(enabled);
  }

  getPoiLabelsVisible(): boolean {
    return this.featureRuntime.getPoiLabelsVisible();
  }

  setShowPoiFootprints(enabled: boolean): void {
    this.featureRuntime.setShowPoiFootprints(enabled);
  }

  getShowPoiFootprints(): boolean {
    return this.featureRuntime.getShowPoiFootprints();
  }

  setShowRoads(enabled: boolean): void {
    this.featureRuntime.setShowRoads(enabled);
  }

  getShowRoads(): boolean {
    return this.featureRuntime.getShowRoads();
  }

  setDebugViewMode(mode: TerrainDebugViewMode): void {
    this.surfaceRuntime.setDebugViewMode(mode);
  }

  getDebugViewMode(): TerrainDebugViewMode {
    return this.surfaceRuntime.getDebugViewMode();
  }

  setTerrainMaterialConfig(config: TerrainMaterialConfig): void {
    this.surfaceRuntime.setTerrainMaterialConfig(config);
  }

  getTerrainMaterialConfig(): TerrainMaterialConfig {
    return this.surfaceRuntime.getTerrainMaterialConfig();
  }

  setTerrainMaterialThresholds(thresholds: TerrainLayerThresholds): void {
    this.surfaceRuntime.setTerrainMaterialThresholds(thresholds);
  }

  getTerrainMaterialThresholds(): TerrainLayerThresholds {
    return this.surfaceRuntime.getTerrainMaterialThresholds();
  }
}

export interface TerrainSystemBuildOptions {
  readonly chunkBuildCoordinator?: TerrainChunkBuildCoordinator | null;
  readonly chunkBuildVersion?: number;
  readonly initialCameraPosition?: Vector3 | null;
  readonly onChunkBuildProgress?: (progress: TerrainChunkBuildProgress) => void;
  readonly presentation?: import("./TerrainPresentation").TerrainPresentationFactories;
}
