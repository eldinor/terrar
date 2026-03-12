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
import { TerrainPoi, TerrainPoiPlanner } from "./TerrainPoiPlanner";
import { TerrainPoiStats, TerrainPoiSystem } from "./TerrainPoiSystem";
import { TerrainRoad, TerrainRoadPlanner } from "./TerrainRoadPlanner";
import { TerrainRoadStats, TerrainRoadSystem } from "./TerrainRoadSystem";
import { TerrainWaterConfig, TerrainWaterSystem } from "./TerrainWaterSystem";
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
  readonly config: TerrainConfig;
  private generator: ProceduralGenerator;
  private foliagePlanner: TerrainFoliagePlanner;
  private foliageSystem: TerrainFoliageSystem;
  private poiPlanner: TerrainPoiPlanner;
  private poiSystem: TerrainPoiSystem;
  private roadPlanner: TerrainRoadPlanner;
  private roadSystem: TerrainRoadSystem;
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
  private poiVisible = true;
  private roadVisible = true;
  private debugViewMode = TerrainDebugViewMode.Final;
  private materialConfig: TerrainMaterialConfig | null = null;
  private readonly textureOptions: Required<TerrainTextureOptions>;
  private elapsedTimeSeconds = 0;
  private initialized = false;

  constructor(
    private readonly scene: Scene,
    overrides: TerrainConfigOverrides = {},
    textureOptions: TerrainTextureOptions = {}
  ) {
    this.config = mergeTerrainConfig({
      ...DEFAULT_TERRAIN_CONFIG,
      ...overrides
    });
    this.generator = new ProceduralGenerator(this.config);
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
    this.poiPlanner = new TerrainPoiPlanner(this.config, this.generator);
    this.poiSystem = new TerrainPoiSystem(this.scene, this.poiPlanner);
    this.roadPlanner = new TerrainRoadPlanner(this.config, this.generator);
    this.roadSystem = new TerrainRoadSystem(
      this.scene,
      this.roadPlanner,
      this.config
    );
    this.waterSystem = new TerrainWaterSystem(
      this.scene,
      this.config,
      this.generator
    );
    this.lodController = new TerrainLODController(this.config);
    this.lodDistances = [...this.config.lodDistances];
    this.collisionRadius = this.config.collisionRadius;
    this.foliageRadius = this.config.foliageRadius;
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
    this.poiSystem.initialize();
    this.roadSystem.initialize(this.poiSystem.getSites());
    TerrainMaterialFactory.setRoadMask(
      this.material,
      this.roadSystem.getRoadMaskTexture()
    );
    TerrainMaterialFactory.setRoadMaskBounds(
      this.material,
      { x: this.config.worldMin, z: this.config.worldMin },
      { x: this.config.worldSize, z: this.config.worldSize }
    );
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

    this.foliageSystem.update(
      cameraPosition,
      this.foliageVisible ? this.foliageRadius : 0
    );
    this.poiSystem.setVisible(this.poiVisible);
    this.roadSystem.setVisible(this.roadVisible);
    this.poiSystem.update();
    this.waterSystem.update(this.elapsedTimeSeconds, cameraPosition);
  }

  dispose(): void {
    this.debugOverlay?.dispose();
    this.debugOverlay = null;
    this.debugOverlayPromise = null;
    this.foliageSystem.dispose();
    this.poiSystem.dispose();
    this.roadSystem.dispose();
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
    this.foliageVisible = enabled;
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
    return this.poiSystem.getSites();
  }

  getPoiStats(): TerrainPoiStats {
    return this.poiSystem.getStats();
  }

  getRoads(): readonly TerrainRoad[] {
    return this.roadSystem.getRoads();
  }

  getRoadStats(): TerrainRoadStats {
    return this.roadSystem.getStats();
  }

  setShowPoi(enabled: boolean): void {
    this.poiVisible = enabled;
    this.poiSystem.setVisible(enabled);
  }

  getShowPoi(): boolean {
    return this.poiVisible;
  }

  setShowRoads(enabled: boolean): void {
    this.roadVisible = enabled;
    this.roadSystem.setVisible(enabled);
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
}
