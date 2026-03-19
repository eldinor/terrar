import type { Scene } from "@babylonjs/core/scene";
import type { Vector3 } from "@babylonjs/core/Maths/math.vector";
import type { TerrainPoi } from "../../terrain/TerrainPoiPlanner";
import type { TerrainRoad } from "../../terrain/TerrainRoadPlanner";
import type {
  TerrainDebugViewMode,
  TerrainLayerThresholds,
  TerrainMaterialConfig,
  TerrainTextureOptions
} from "../../terrain/materials";
import type { TerrainWaterConfig } from "../../terrain/TerrainWaterSystem";
import type { TerrainChunkBuildProfile } from "../../terrain/TerrainChunkMeshRuntime";
import type {
  TerrainSystem,
  TerrainSystemBuildOptions
} from "../../terrain/TerrainSystem";
import type { TerrainConfig } from "../../terrain/TerrainConfig";
import type { TerrainFoliageStats } from "../../terrain/TerrainFoliageSystem";
import type {
  TerrainPoiDebugConfig,
  TerrainPoiMeshStats,
  TerrainPoiStats
} from "../../terrain/TerrainPoiSystem";
import type { TerrainRoadStats } from "../../terrain/TerrainRoadSystem";
import type { BuiltTerrain } from "../../builder";

export interface BabylonTerrainAdapterOptions {
  readonly textureOptions?: TerrainTextureOptions;
  readonly buildOptions?: TerrainSystemBuildOptions;
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
  setWaterConfig(config: TerrainWaterConfig): void;
  getWaterConfig(): TerrainWaterConfig;
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
  getConfig(): TerrainConfig;
  getTextureOptions(): Required<TerrainTextureOptions>;
  getFoliageStats(): TerrainFoliageStats;
  getPoiSites(): readonly TerrainPoi[];
  getPoiStats(): TerrainPoiStats;
  getPoiMeshStats(): TerrainPoiMeshStats;
  setPoiDebugConfig(config: TerrainPoiDebugConfig): void;
  getPoiDebugConfig(): TerrainPoiDebugConfig;
  getRoads(): readonly TerrainRoad[];
  getRoadStats(): TerrainRoadStats;
  setDebugViewMode(mode: TerrainDebugViewMode): void;
  getDebugViewMode(): TerrainDebugViewMode;
  setTerrainMaterialConfig(config: TerrainMaterialConfig): void;
  getTerrainMaterialConfig(): TerrainMaterialConfig;
  setTerrainMaterialThresholds(thresholds: TerrainLayerThresholds): void;
  getTerrainMaterialThresholds(): TerrainLayerThresholds;
  getChunkBuildProfile(): TerrainChunkBuildProfile;
  getChunkCount(): number;
  getLoadedChunkMeshCount(): number;
  getPendingChunkMeshCount(): number;
  isApplyingChunkMeshes(): boolean;
  getTerrainSystem(): TerrainSystem;
}
