import type { Scene } from "@babylonjs/core/scene";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TerrainChunkBuildCoordinator } from "../../terrain/TerrainChunkBuildCoordinator";
import type {
  TerrainMineResource,
  TerrainPoiKind
} from "../../terrain/TerrainPoiPlanner";
import type { TerrainChunkBuildProfile } from "../../terrain/TerrainChunkMeshRuntime";
import type { TerrainFoliageStats } from "../../terrain/TerrainFoliageSystem";
import type {
  BuiltTerrain,
  BuiltTerrainConfig,
  BuiltTerrainPoi,
  BuiltTerrainRoad
} from "../../builder";
import type {
  TerrainDebugViewMode as BabylonTerrainDebugViewMode,
  TerrainLayerThresholds as BabylonTerrainLayerThresholds,
  TerrainMaterialConfig as BabylonTerrainMaterialConfig,
  TerrainTextureOptions as BabylonTerrainTextureOptions
} from "../../terrain/materials";
import type { TerrainWaterConfig as BabylonTerrainWaterConfig } from "../../terrain/TerrainWaterSystem";

export type {
  BabylonTerrainDebugViewMode,
  BabylonTerrainLayerThresholds,
  BabylonTerrainMaterialConfig,
  BabylonTerrainTextureOptions,
  BabylonTerrainWaterConfig
};

export interface BabylonTerrainBuildProgress {
  readonly completedChunks: number;
  readonly totalChunks: number;
}

export interface BabylonTerrainBuildOptions {
  readonly chunkBuildCoordinator?: TerrainChunkBuildCoordinator | null;
  readonly chunkBuildVersion?: number;
  readonly initialCameraPosition?: Vector3 | null;
  readonly onChunkBuildProgress?: (progress: BabylonTerrainBuildProgress) => void;
}

export interface BabylonTerrainPoiStats {
  readonly total: number;
  readonly villages: number;
  readonly outposts: number;
  readonly mines: number;
}

export interface BabylonTerrainPoiMeshStats {
  readonly total: number;
  readonly enabled: number;
}

export interface BabylonTerrainPoiDebugConfig {
  readonly showScores: boolean;
  readonly showRadii: boolean;
  readonly showTags: boolean;
  readonly kinds: Readonly<Record<TerrainPoiKind, boolean>>;
  readonly mineResources: Readonly<Record<TerrainMineResource, boolean>>;
}

export interface BabylonTerrainRoadStats {
  readonly totalRoads: number;
  readonly totalPoints: number;
}

export interface BabylonTerrainAdapterOptions {
  readonly textureOptions?: BabylonTerrainTextureOptions;
  readonly buildOptions?: BabylonTerrainBuildOptions;
}

export interface BabylonTerrainAdapter {
  readonly scene: Scene;
  readonly terrain: BuiltTerrain;
  initialize(): void;
  update(cameraPosition: Vector3): void;
  updateDebugOverlay(): void;
  dispose(): void;
  whenChunkMeshesReady(): Promise<void>;
  whenFoliageReady(): Promise<void>;
  toggleDebugOverlay(): Promise<boolean>;
  setWireframe(enabled: boolean): void;
  getWireframe(): boolean;
  setWaterLevel(level: number): void;
  getWaterLevel(): number;
  setWaterConfig(config: BabylonTerrainWaterConfig): void;
  getWaterConfig(): BabylonTerrainWaterConfig;
  setCollisionRadius(radius: number): void;
  getCollisionRadius(): number;
  setFoliageRadius(radius: number): void;
  getFoliageRadius(): number;
  setShowFoliage(enabled: boolean): void;
  getShowFoliage(): boolean;
  setShowPoi(enabled: boolean): void;
  getShowPoi(): boolean;
  setPoiMarkerMeshesVisible(enabled: boolean): void;
  getPoiMarkerMeshesVisible(): boolean;
  setPoiLabelsVisible(enabled: boolean): void;
  getPoiLabelsVisible(): boolean;
  setShowPoiFootprints(enabled: boolean): void;
  getShowPoiFootprints(): boolean;
  setShowRoads(enabled: boolean): void;
  getShowRoads(): boolean;
  setLodDistances(distances: readonly [number, number, number]): void;
  getLodDistances(): readonly [number, number, number];
  getConfig(): BuiltTerrainConfig;
  getTextureOptions(): Required<BabylonTerrainTextureOptions>;
  getFoliageStats(): TerrainFoliageStats;
  getPoiSites(): readonly BuiltTerrainPoi[];
  getPoiStats(): BabylonTerrainPoiStats;
  getPoiMeshStats(): BabylonTerrainPoiMeshStats;
  setPoiDebugConfig(config: BabylonTerrainPoiDebugConfig): void;
  getPoiDebugConfig(): BabylonTerrainPoiDebugConfig;
  getRoads(): readonly BuiltTerrainRoad[];
  getRoadStats(): BabylonTerrainRoadStats;
  setDebugViewMode(mode: BabylonTerrainDebugViewMode): void;
  getDebugViewMode(): BabylonTerrainDebugViewMode;
  setTerrainMaterialConfig(config: BabylonTerrainMaterialConfig): void;
  getTerrainMaterialConfig(): BabylonTerrainMaterialConfig;
  setTerrainMaterialThresholds(thresholds: BabylonTerrainLayerThresholds): void;
  getTerrainMaterialThresholds(): BabylonTerrainLayerThresholds;
  getChunkBuildProfile(): TerrainChunkBuildProfile;
  getChunkCount(): number;
  getLoadedChunkMeshCount(): number;
  getPendingChunkMeshCount(): number;
  isApplyingChunkMeshes(): boolean;
}
