import type {
  BuiltTerrainErosionConfig as TerrainErosionConfig,
  BuiltTerrainFeatureConfig as TerrainFeatureConfig,
  BuiltTerrainPoiConfig as TerrainPoiConfig,
  BuiltTerrainRiverConfig as TerrainRiverConfig,
  BuiltTerrainShapeConfig as TerrainShapeConfig,
} from "../builder";
import type {
  BabylonTerrainDebugViewMode as TerrainDebugViewMode,
  BabylonTerrainLayerThresholds as TerrainLayerThresholds,
  BabylonTerrainPoiDebugConfig as TerrainPoiDebugConfig,
  BabylonTerrainPoiMeshStats as TerrainPoiMeshStats,
  BabylonTerrainPoiStats as TerrainPoiStats,
  BabylonTerrainRoadStats as TerrainRoadStats,
  BabylonTerrainWaterConfig as TerrainWaterConfig,
} from "../adapters/babylon";
import type { TerrainBuildProfile, TerrainBuildStatus, TerrainWorkerStatus } from "./createTerrainDemo";
import type { DraftConfig } from "./demoState";
import type { TerrainFoliageStats } from "../terrain/TerrainFoliageSystem";

export interface FeaturePanelState {
  readonly features: TerrainFeatureConfig;
  readonly hidePoiMarkerMeshes: boolean;
  readonly hidePoiLabels: boolean;
  readonly showPoiFootprints: boolean;
  readonly poiDebug: TerrainPoiDebugConfig;
  readonly poiStats: TerrainPoiStats;
  readonly poiMeshStats: TerrainPoiMeshStats;
}

export interface RuntimeTabState {
  readonly waterLevel: number;
  readonly water: TerrainWaterConfig;
  readonly buildFoliage: boolean;
  readonly showFoliage: boolean;
  readonly collisionRadius: number;
  readonly foliageRadius: number;
  readonly lodDistances: readonly [number, number, number];
  readonly debugViewMode: TerrainDebugViewMode;
}

export interface MaterialTabState {
  readonly useGeneratedTextures: boolean;
  readonly materialThresholds: TerrainLayerThresholds;
  readonly materialScales: DraftConfig["materialScales"];
  readonly blendSharpness: number;
  readonly shorelineStartOffset: number;
  readonly shorelineEndOffset: number;
  readonly sedimentStrength: number;
  readonly sedimentSandBias: number;
  readonly smallRiverTintStrength: number;
  readonly smallRiverTintBrightness: number;
  readonly smallRiverTintSaturation: number;
  readonly baseHeight: number;
  readonly maxHeight: number;
}

export interface WorldTabState {
  readonly seed: string;
  readonly worldSize: number;
  readonly chunksPerAxis: number;
  readonly chunkSize: number;
  readonly baseHeight: number;
  readonly maxHeight: number;
  readonly erosion: TerrainErosionConfig;
  readonly poi: TerrainPoiConfig;
  readonly rivers: TerrainRiverConfig;
  readonly shape: TerrainShapeConfig;
}

export type PanelTab = "runtime" | "material" | "world" | "presets";

export function buildHudText(args: {
  readonly buildStatus: TerrainBuildStatus;
  readonly debugVisible: boolean;
  readonly foliage: TerrainFoliageStats;
  readonly loadingDebug: boolean;
  readonly poi: TerrainPoiStats;
  readonly roads: TerrainRoadStats;
  readonly statusMessage?: string;
  readonly wireframe: boolean;
  readonly workerStatus: TerrainWorkerStatus;
}): string {
  const debugState = args.loadingDebug ? "loading" : args.debugVisible ? "on" : "off";
  const workerText = args.workerStatus.sharedSnapshotsEnabled
    ? "sab:on"
    : args.workerStatus.workersEnabled
      ? "sab:off"
      : "workers:off";
  const buildText = args.buildStatus.phase === "idle" ? "" : ` | build: ${args.buildStatus.message}`;
  const statusText = args.statusMessage ? ` | ${args.statusMessage}` : "";
  return (
    `G debug: ${debugState} | V wireframe: ${args.wireframe ? "on" : "off"} | ` +
    `foliage: ${args.foliage.visibleInstances}/${args.foliage.totalInstances} ` +
    `(T ${args.foliage.visibleTrees}/${args.foliage.totalTrees}, ` +
    `B ${args.foliage.visibleBushes}/${args.foliage.totalBushes}, ` +
    `R ${args.foliage.visibleRocks}/${args.foliage.totalRocks}) | ` +
    `poi: ${args.poi.total} | roads: ${args.roads.totalRoads} | ${workerText}${buildText}${statusText}`
  );
}

export function buildFeatureBuildStatusText(args: {
  readonly buildProfile: TerrainBuildProfile;
  readonly buildStatus: TerrainBuildStatus;
  readonly draftConfig: DraftConfig;
  readonly workerStatus: TerrainWorkerStatus;
}): string {
  const summary = args.draftConfig.features.poi
    ? args.draftConfig.features.roads
      ? "POI and roads will rebuild into the world."
      : "POI will load on rebuild. Roads remain disabled."
    : "POI and roads are excluded by default.";
  const workerLine = args.workerStatus.workersEnabled
    ? args.workerStatus.sharedSnapshotsEnabled
      ? "Workers active. Shared snapshots enabled."
      : "Workers active. Shared snapshots unavailable."
    : "Workers unavailable. Main-thread fallback only.";
  const workerDetail =
    `crossOriginIsolated: ${args.workerStatus.crossOriginIsolated}\n` +
    `SharedArrayBuffer: ${args.workerStatus.sharedArrayBufferDefined}\n` +
    `Snapshot Mode: ${args.workerStatus.snapshotMode}\n` +
    `Live Terrain Systems: ${args.workerStatus.liveTerrainSystems}\n` +
    `Chunks: ${args.workerStatus.chunkCount}\n` +
    `Loaded Chunk Meshes: ${args.workerStatus.loadedChunkMeshes}\n` +
    `Mesh Apply: ${args.workerStatus.applyingChunkMeshes ? "active" : "idle"}\n` +
    `Pending Chunk Meshes: ${args.workerStatus.pendingChunkMeshes}`;
  const profileDetail =
    `\nWorld Build: ${formatDuration(args.buildProfile.lastWorldBuildMs)}\n` +
    `Terrain Swap: ${formatDuration(args.buildProfile.lastTerrainSwapMs)}\n` +
    `Chunk Workers: ${formatDuration(args.buildProfile.lastChunkWorkerBuildMs)}\n` +
    `Mesh Apply: ${formatDuration(args.buildProfile.lastMeshApplyMs)}\n` +
    `Total Rebuild: ${formatDuration(args.buildProfile.lastTotalRebuildMs)}`;
  const progress = args.buildStatus.phase === "idle" ? "" : `\n${args.buildStatus.message}`;
  return `${summary}\n${workerLine}\n${workerDetail}${profileDetail}${progress}`;
}

export function buildFeaturePanelState(
  draftConfig: DraftConfig,
  poiStats: TerrainPoiStats,
  poiMeshStats: TerrainPoiMeshStats,
): FeaturePanelState {
  return {
    features: { ...draftConfig.features },
    hidePoiMarkerMeshes: draftConfig.hidePoiMarkerMeshes,
    hidePoiLabels: draftConfig.hidePoiLabels,
    showPoiFootprints: draftConfig.showPoiFootprints,
    poiDebug: {
      ...draftConfig.poiDebug,
      kinds: { ...draftConfig.poiDebug.kinds },
      mineResources: { ...draftConfig.poiDebug.mineResources },
    },
    poiStats,
    poiMeshStats,
  };
}

export function buildRuntimeTabState(
  draftConfig: DraftConfig,
  debugViewMode: TerrainDebugViewMode,
): RuntimeTabState {
  return {
    waterLevel: draftConfig.waterLevel,
    water: { ...draftConfig.water },
    buildFoliage: draftConfig.buildFoliage,
    showFoliage: draftConfig.showFoliage,
    collisionRadius: draftConfig.collisionRadius,
    foliageRadius: draftConfig.foliageRadius,
    lodDistances: [...draftConfig.lodDistances] as [number, number, number],
    debugViewMode,
  };
}

export function buildMaterialTabState(draftConfig: DraftConfig): MaterialTabState {
  return {
    useGeneratedTextures: draftConfig.useGeneratedTextures,
    materialThresholds: { ...draftConfig.materialThresholds },
    materialScales: { ...draftConfig.materialScales },
    blendSharpness: draftConfig.blendSharpness,
    shorelineStartOffset: draftConfig.shorelineStartOffset,
    shorelineEndOffset: draftConfig.shorelineEndOffset,
    sedimentStrength: draftConfig.sedimentStrength,
    sedimentSandBias: draftConfig.sedimentSandBias,
    smallRiverTintStrength: draftConfig.smallRiverTintStrength,
    smallRiverTintBrightness: draftConfig.smallRiverTintBrightness,
    smallRiverTintSaturation: draftConfig.smallRiverTintSaturation,
    baseHeight: draftConfig.baseHeight,
    maxHeight: draftConfig.maxHeight,
  };
}

export function buildWorldTabState(draftConfig: DraftConfig): WorldTabState {
  return {
    seed: draftConfig.seed,
    worldSize: draftConfig.worldSize,
    chunksPerAxis: draftConfig.chunksPerAxis,
    chunkSize: draftConfig.chunkSize,
    baseHeight: draftConfig.baseHeight,
    maxHeight: draftConfig.maxHeight,
    erosion: { ...draftConfig.erosion },
    poi: { ...draftConfig.poi },
    rivers: { ...draftConfig.rivers },
    shape: { ...draftConfig.shape },
  };
}

function formatDuration(valueMs: number): string {
  if (valueMs <= 0) {
    return "-";
  }
  if (valueMs < 1000) {
    return `${Math.round(valueMs)} ms`;
  }
  return `${(valueMs / 1000).toFixed(2)} s`;
}
