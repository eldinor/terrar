import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { createYieldingScheduler, runCoroutineAsync } from "@babylonjs/core/Misc/coroutine";
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
import { packTerrainSnapshot } from "./TerrainSnapshotLayout";
import { TerrainFoliageCandidate, TerrainFoliagePlanner } from "./TerrainFoliagePlanner";
import { TerrainFoliageStats, TerrainFoliageSystem } from "./TerrainFoliageSystem";
import { TerrainLODController } from "./TerrainLODController";
import { TerrainChunkMeshData, TerrainMeshBuilder } from "./TerrainMeshBuilder";
import { TerrainPoi, TerrainPoiPlanner } from "./TerrainPoiPlanner";
import {
  DEFAULT_TERRAIN_POI_DEBUG_CONFIG,
  TerrainPoiDebugConfig,
  TerrainPoiMeshStats,
  TerrainPoiStats,
  TerrainPoiSystem
} from "./TerrainPoiSystem";
import { TerrainPoiFootprintSystem } from "./TerrainPoiFootprintSystem";
import { TerrainRoad, TerrainRoadPlanner } from "./TerrainRoadPlanner";
import { TerrainRoadStats, TerrainRoadSystem } from "./TerrainRoadSystem";
import { TerrainWaterConfig, TerrainWaterSystem } from "./TerrainWaterSystem";
import { TerrainPrebuiltWorldData } from "./TerrainBuildCoordinator";
import type { TerrainDebugOverlay } from "./TerrainDebugOverlay";
import {
  cloneTerrainMaterialConfig,
  TerrainDebugViewMode,
  TerrainLayerThresholds,
  TerrainMaterialConfig,
  TerrainMaterialFactory,
  TerrainTextureOptions
} from "./materials";

export class TerrainSystem {
  private static liveSystemCount = 0;
  readonly config: TerrainConfig;
  private generator: ProceduralGenerator;
  private foliagePlanner: TerrainFoliagePlanner;
  private foliageSystem: TerrainFoliageSystem;
  private poiPlanner: TerrainPoiPlanner | null;
  private poiSystem: TerrainPoiSystem | null;
  private poiFootprintSystem: TerrainPoiFootprintSystem | null;
  private roadPlanner: TerrainRoadPlanner | null;
  private roadSystem: TerrainRoadSystem | null;
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
  private foliageVisible = false;
  private poiVisible = false;
  private poiMarkerMeshesVisible = true;
  private poiLabelsVisible = true;
  private poiFootprintsVisible = true;
  private roadVisible = false;
  private poiDebugConfig: TerrainPoiDebugConfig = {
    ...DEFAULT_TERRAIN_POI_DEBUG_CONFIG,
    kinds: { ...DEFAULT_TERRAIN_POI_DEBUG_CONFIG.kinds },
    mineResources: { ...DEFAULT_TERRAIN_POI_DEBUG_CONFIG.mineResources }
  };
  private debugViewMode = TerrainDebugViewMode.Final;
  private materialConfig: TerrainMaterialConfig | null = null;
  private readonly textureOptions: Required<TerrainTextureOptions>;
  private elapsedTimeSeconds = 0;
  private initialized = false;
  private disposed = false;
  private chunkBuildPromise: Promise<void> | null = null;
  private pendingChunkMeshQueue: PendingChunkMeshBuild[] = [];
  private chunkMeshApplyPromise: Promise<void> | null = null;
  private chunkMeshApplyAbortController: AbortController | null = null;
  private foliageInitPromise: Promise<void> | null = null;
  private foliageInitAbortController: AbortController | null = null;
  private lastChunkBuildDurationMs = 0;
  private lastChunkMeshApplyDurationMs = 0;

  constructor(
    private readonly scene: Scene,
    overrides: TerrainConfigOverrides = {},
    textureOptions: TerrainTextureOptions = {},
    private readonly prebuiltWorld: TerrainPrebuiltWorldData | null = null,
    private readonly buildOptions: TerrainSystemBuildOptions = {}
  ) {
    TerrainSystem.liveSystemCount += 1;
    this.config = mergeTerrainConfig({
      ...DEFAULT_TERRAIN_CONFIG,
      ...overrides
    });
    this.generator = new ProceduralGenerator(
      this.config,
      this.prebuiltWorld?.snapshot ?? null
    );
    this.textureOptions = {
      useGeneratedTextures: true,
      maxTextureSize: 512,
      ...textureOptions
    };
    this.foliagePlanner = new TerrainFoliagePlanner(this.config, this.config.seed);
    this.foliageSystem = new TerrainFoliageSystem(
      this.scene,
      this.foliagePlanner,
      this.config
    );
    this.poiPlanner = this.config.features.poi
      ? new TerrainPoiPlanner(this.config, this.generator)
      : null;
    this.poiSystem = this.poiPlanner
      ? new TerrainPoiSystem(
          this.scene,
          this.poiPlanner,
          this.prebuiltWorld?.poiSites ?? []
        )
      : null;
    this.poiFootprintSystem = this.poiPlanner
      ? new TerrainPoiFootprintSystem(
          this.scene,
          this.generator,
          this.prebuiltWorld?.poiSites ?? []
        )
      : null;
    this.roadPlanner =
      this.config.features.poi && this.config.features.roads
        ? new TerrainRoadPlanner(this.config, this.generator)
        : null;
    this.roadSystem = this.roadPlanner
      ? new TerrainRoadSystem(
          this.scene,
          this.roadPlanner,
          this.config,
          this.prebuiltWorld?.roads ?? []
        )
      : null;
    this.waterSystem = new TerrainWaterSystem(
      this.scene,
      this.config,
      this.generator
    );
    this.lodController = new TerrainLODController(this.config);
    this.lodDistances = [...this.config.lodDistances];
    this.collisionRadius = this.config.collisionRadius;
    this.foliageRadius = this.config.foliageRadius;
    this.foliageVisible = this.config.buildFoliage;
  }

  initialize(): void {
    if (this.initialized) {
      return;
    }

    this.material = TerrainMeshBuilder.createSharedMaterial(
      this.scene,
      this.config,
      this.textureOptions
    );
    this.materialConfig = TerrainMaterialFactory.getConfig(this.material);
    TerrainMaterialFactory.setWaterLevel(this.material, this.config.waterLevel);
    TerrainMaterialFactory.setRiverRenderingParams(this.material, {
      bankStrength: this.config.rivers.bankStrength,
      dischargeStrength: this.waterSystem.getConfig().riverDischargeStrength,
      meshThreshold: this.waterSystem.getConfig().riverMeshThreshold,
      meshMinWidth: this.waterSystem.getConfig().riverMeshMinWidth
    });

    let roads: readonly TerrainRoad[] = [];
    const poiSites = this.poiSystem?.getSites() ?? [];
    if (this.poiSystem) {
      this.poiSystem.initialize();
      this.poiSystem.setDebugConfig(this.poiDebugConfig);
      this.poiSystem.setMarkerMeshesVisible(this.poiMarkerMeshesVisible);
      this.poiSystem.setLabelsVisible(this.poiLabelsVisible);
      this.poiVisible = true;
    }
    if (this.poiFootprintSystem) {
      this.poiFootprintSystem.initialize();
      this.poiFootprintSystem.setVisible(this.poiFootprintsVisible);
    }
    if (this.poiSystem && this.roadSystem) {
      this.roadSystem.initialize(this.poiSystem.getSites());
      this.roadVisible = true;
      roads = this.roadSystem.getRoads();
      TerrainMaterialFactory.setRoadMask(
        this.material,
        this.roadSystem.getRoadMaskTexture()
      );
      TerrainMaterialFactory.setRoadMaskBounds(
        this.material,
        { x: this.config.worldMin, z: this.config.worldMin },
        { x: this.config.worldSize, z: this.config.worldSize }
      );
    }

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
          this.material,
          this.config
        );
        row.push(chunk);
        this.chunks.push(chunk);
      }

      this.chunkGrid.push(row);
    }

    this.initialized = true;
    if (this.config.buildFoliage) {
      this.foliageInitAbortController?.abort();
      this.foliageInitAbortController = new AbortController();
      this.foliageInitPromise = this.foliageSystem
        .initializeAsync(this.chunks, this.foliageInitAbortController.signal)
        .catch((error) => {
          if (!this.foliageInitAbortController?.signal.aborted) {
            console.error("Foliage initialization failed.", error);
          }
        })
        .finally(() => {
          this.foliageInitPromise = null;
        });
    }
    this.waterSystem.initialize();
    if (this.buildOptions.chunkBuildCoordinator) {
      this.chunkBuildPromise = this.buildChunkMeshesAsync(roads);
    } else {
      this.chunks.forEach((chunk) => chunk.initializeMeshes());
      this.chunkBuildPromise = Promise.resolve();
      this.buildOptions.onChunkBuildProgress?.({
        completedChunks: this.chunks.length,
        totalChunks: this.chunks.length
      });
    }
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

    this.foliageSystem.update(
      cameraPosition,
      this.foliageVisible ? this.foliageRadius : 0
    );
    this.poiSystem?.setVisible(this.poiVisible);
    this.roadSystem?.setVisible(this.roadVisible);
    this.poiSystem?.update();
    this.waterSystem.update(this.elapsedTimeSeconds, cameraPosition);
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }

    this.disposed = true;
    TerrainSystem.liveSystemCount = Math.max(0, TerrainSystem.liveSystemCount - 1);
    this.chunkMeshApplyAbortController?.abort();
    this.chunkMeshApplyAbortController = null;
    this.foliageInitAbortController?.abort();
    this.foliageInitAbortController = null;
    this.foliageInitPromise = null;
    this.pendingChunkMeshQueue = [];
    this.chunkMeshApplyPromise = null;
    this.debugOverlay?.dispose();
    this.debugOverlay = null;
    this.debugOverlayPromise = null;
    this.foliageSystem.dispose();
    this.poiSystem?.dispose();
    this.poiFootprintSystem?.dispose();
    this.roadSystem?.dispose();
    this.waterSystem.dispose();
    this.chunks.forEach((chunk) => chunk.dispose());
    this.chunks.length = 0;
    this.chunkGrid.length = 0;
    this.material?.dispose(false, true);
    this.material = null;
    this.materialConfig = null;
    this.debugViewMode = TerrainDebugViewMode.Final;
    this.elapsedTimeSeconds = 0;
    this.chunkBuildPromise = null;
    this.initialized = false;
  }

  whenChunkMeshesReady(): Promise<void> {
    return this.chunkBuildPromise ?? Promise.resolve();
  }

  getPendingChunkMeshCount(): number {
    return this.pendingChunkMeshQueue.length;
  }

  isApplyingChunkMeshes(): boolean {
    return this.chunkMeshApplyPromise !== null;
  }

  getChunkBuildProfile(): TerrainChunkBuildProfile {
    return {
      workerBuildMs: this.lastChunkBuildDurationMs,
      meshApplyMs: this.lastChunkMeshApplyDurationMs
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
    if (this.material) {
      TerrainMaterialFactory.setWaterLevel(this.material, level);
    }
  }

  getWaterLevel(): number {
    return this.waterSystem.getWaterLevel();
  }

  setWaterConfig(config: TerrainWaterConfig): void {
    this.waterSystem.setConfig(config);
    if (this.material) {
      TerrainMaterialFactory.setRiverRenderingParams(this.material, {
        bankStrength: this.config.rivers.bankStrength,
        dischargeStrength: config.riverDischargeStrength,
        meshThreshold: config.riverMeshThreshold,
        meshMinWidth: config.riverMeshMinWidth
      });
    }
  }

  getWaterConfig(): TerrainWaterConfig {
    return this.waterSystem.getConfig();
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

  setShowFoliage(enabled: boolean): void {
    this.foliageVisible = enabled && this.config.buildFoliage;
  }

  getShowFoliage(): boolean {
    return this.foliageVisible;
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

  getTextureOptions(): Required<TerrainTextureOptions> {
    return { ...this.textureOptions };
  }

  getFoliageStats(): TerrainFoliageStats {
    return this.foliageSystem.getStats();
  }

  getPoiSites(): readonly TerrainPoi[] {
    return this.poiSystem?.getSites() ?? [];
  }

  getPoiStats(): TerrainPoiStats {
    return (
      this.poiSystem?.getStats() ?? {
        total: 0,
        villages: 0,
        outposts: 0,
        mines: 0
      }
    );
  }

  getPoiMeshStats(): TerrainPoiMeshStats {
    return (
      this.poiSystem?.getMeshStats() ?? {
        total: 0,
        enabled: 0
      }
    );
  }

  setPoiDebugConfig(config: TerrainPoiDebugConfig): void {
    this.poiDebugConfig = {
      ...config,
      kinds: { ...config.kinds },
      mineResources: { ...config.mineResources }
    };
    this.poiSystem?.setDebugConfig(this.poiDebugConfig);
  }

  getPoiDebugConfig(): TerrainPoiDebugConfig {
    return {
      ...this.poiDebugConfig,
      kinds: { ...this.poiDebugConfig.kinds },
      mineResources: { ...this.poiDebugConfig.mineResources }
    };
  }

  getRoads(): readonly TerrainRoad[] {
    return this.roadSystem?.getRoads() ?? [];
  }

  getRoadStats(): TerrainRoadStats {
    return this.roadSystem?.getStats() ?? {
      totalRoads: 0,
      totalPoints: 0
    };
  }

  setShowPoi(enabled: boolean): void {
    this.poiVisible = enabled && this.config.features.poi;
    this.poiSystem?.setVisible(this.poiVisible);
  }

  getShowPoi(): boolean {
    return this.poiVisible;
  }

  setPoiMarkerMeshesVisible(enabled: boolean): void {
    this.poiMarkerMeshesVisible = enabled;
    this.poiSystem?.setMarkerMeshesVisible(enabled);
  }

  getPoiMarkerMeshesVisible(): boolean {
    return this.poiMarkerMeshesVisible;
  }

  setPoiLabelsVisible(enabled: boolean): void {
    this.poiLabelsVisible = enabled;
    this.poiSystem?.setLabelsVisible(enabled);
  }

  getPoiLabelsVisible(): boolean {
    return this.poiLabelsVisible;
  }

  setShowPoiFootprints(enabled: boolean): void {
    this.poiFootprintsVisible = enabled && this.config.features.poi;
    this.poiFootprintSystem?.setVisible(this.poiFootprintsVisible);
  }

  getShowPoiFootprints(): boolean {
    return this.poiFootprintsVisible;
  }

  setShowRoads(enabled: boolean): void {
    this.roadVisible = enabled && this.config.features.roads;
    this.roadSystem?.setVisible(this.roadVisible);
  }

  getShowRoads(): boolean {
    return this.roadVisible;
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

  private async buildChunkMeshesAsync(roads: readonly TerrainRoad[]): Promise<void> {
    const coordinator = this.buildOptions.chunkBuildCoordinator;
    if (!coordinator || !this.material) {
      return;
    }

    try {
      const chunkBuildStartedAt = performance.now();
      this.chunkMeshApplyAbortController?.abort();
      this.chunkMeshApplyAbortController = new AbortController();
      this.pendingChunkMeshQueue = [];
      this.chunkMeshApplyPromise = null;
      this.lastChunkBuildDurationMs = 0;
      this.lastChunkMeshApplyDurationMs = 0;
      await coordinator.buildChunks(
        this.config,
        this.poiSystem?.getSites() ?? [],
        roads,
        this.prebuiltWorld?.packedSnapshot ?? packTerrainSnapshot(this.generator.createSnapshot()),
        this.buildOptions.initialCameraPosition ?? null,
        this.buildOptions.chunkBuildVersion ?? 0,
        (chunkX, chunkZ, meshes) => {
          if (
            this.disposed ||
            !this.material ||
            this.chunkMeshApplyAbortController?.signal.aborted
          ) {
            return;
          }

          this.enqueueChunkMeshBuild(chunkX, chunkZ, meshes);
        },
        (progress) => {
          if (this.disposed) {
            return;
          }
          this.buildOptions.onChunkBuildProgress?.(progress);
        }
      );
      this.lastChunkBuildDurationMs = performance.now() - chunkBuildStartedAt;
      await this.chunkMeshApplyPromise;
    } catch (error) {
      console.error("Chunk worker build failed, falling back to main-thread mesh generation.", error);
      if (this.disposed) {
        return;
      }

      this.chunks.forEach((chunk, index) => {
        chunk.initializeMeshes();
        this.buildOptions.onChunkBuildProgress?.({
          completedChunks: index + 1,
          totalChunks: this.chunks.length
        });
      });
    }
  }

  private enqueueChunkMeshBuild(
    chunkX: number,
    chunkZ: number,
    meshes: readonly TerrainChunkMeshData[]
  ): void {
    const chunk = this.chunkGrid[chunkZ]?.[chunkX];
    if (!chunk) {
      return;
    }

    meshes.forEach((meshData, index) => {
      this.pendingChunkMeshQueue.push({
        chunk,
        lod: index as TerrainLODLevel,
        meshData
      });
    });

    if (!this.chunkMeshApplyPromise) {
      const abortSignal = this.chunkMeshApplyAbortController?.signal;
      const meshApplyStartedAt = performance.now();
      this.chunkMeshApplyPromise = runCoroutineAsync(
        this.applyPendingChunkMeshesCoroutine(),
        createYieldingScheduler(6),
        abortSignal
      ).finally(() => {
        this.lastChunkMeshApplyDurationMs = performance.now() - meshApplyStartedAt;
        this.chunkMeshApplyPromise = null;
      });
    }
  }

  private *applyPendingChunkMeshesCoroutine() {
    while (this.pendingChunkMeshQueue.length > 0) {
      if (this.disposed || !this.material) {
        return;
      }

      const pending = this.pendingChunkMeshQueue.shift();
      if (!pending) {
        return;
      }

      const mesh = TerrainMeshBuilder.buildChunkMeshFromData(
        this.scene,
        pending.chunk.data,
        pending.lod,
        this.material,
        pending.meshData
      );
      pending.chunk.setMesh(pending.lod, mesh);
      yield;
    }
  }
}

export interface TerrainSystemBuildOptions {
  readonly chunkBuildCoordinator?: TerrainChunkBuildCoordinator | null;
  readonly chunkBuildVersion?: number;
  readonly initialCameraPosition?: Vector3 | null;
  readonly onChunkBuildProgress?: (progress: TerrainChunkBuildProgress) => void;
}

interface PendingChunkMeshBuild {
  readonly chunk: TerrainChunk;
  readonly lod: TerrainLODLevel;
  readonly meshData: TerrainChunkMeshData;
}

export interface TerrainChunkBuildProfile {
  readonly workerBuildMs: number;
  readonly meshApplyMs: number;
}
