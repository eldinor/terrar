import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  mergeTerrainConfig,
  TerrainConfig,
  TerrainConfigOverrides
} from "./terrain/TerrainConfig";
import {
  TerrainBuildCoordinator
} from "./terrain/TerrainBuildCoordinator";
import {
  TerrainChunkBuildCoordinator
} from "./terrain/TerrainChunkBuildCoordinator";
import { TerrainPoi } from "./terrain/TerrainPoiPlanner";
import { TerrainRoad } from "./terrain/TerrainRoadPlanner";
import { TerrainSystem, TerrainSystemBuildOptions } from "./terrain/TerrainSystem";
import { TerrainFoliageStats } from "./terrain/TerrainFoliageSystem";
import {
  TerrainPoiDebugConfig,
  TerrainPoiMeshStats,
  TerrainPoiStats
} from "./terrain/TerrainPoiSystem";
import { TerrainRoadStats } from "./terrain/TerrainRoadSystem";
import { TerrainChunkBuildProfile } from "./terrain/TerrainSystem";
import {
  TerrainDebugViewMode,
  TerrainLayerThresholds,
  TerrainMaterialConfig,
  TerrainTextureOptions
} from "./terrain/materials";
import { TerrainWaterConfig } from "./terrain/TerrainWaterSystem";

export interface TerrainDemo {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  readonly getTerrainSystem: () => TerrainSystem;
  readonly setWireframe: (enabled: boolean) => void;
  readonly toggleDebugOverlay: () => Promise<boolean>;
  readonly setWaterLevel: (level: number) => void;
  readonly getWaterLevel: () => number;
  readonly setWaterConfig: (config: TerrainWaterConfig) => void;
  readonly getWaterConfig: () => TerrainWaterConfig;
  readonly setCollisionRadius: (radius: number) => void;
  readonly getCollisionRadius: () => number;
  readonly setFoliageRadius: (radius: number) => void;
  readonly getFoliageRadius: () => number;
  readonly setShowFoliage: (enabled: boolean) => void;
  readonly getShowFoliage: () => boolean;
  readonly setShowPoi: (enabled: boolean) => void;
  readonly getShowPoi: () => boolean;
  readonly setPoiMarkerMeshesVisible: (enabled: boolean) => void;
  readonly getPoiMarkerMeshesVisible: () => boolean;
  readonly setPoiLabelsVisible: (enabled: boolean) => void;
  readonly getPoiLabelsVisible: () => boolean;
  readonly setShowPoiFootprints: (enabled: boolean) => void;
  readonly getShowPoiFootprints: () => boolean;
  readonly setShowRoads: (enabled: boolean) => void;
  readonly getShowRoads: () => boolean;
  readonly setLodDistances: (distances: readonly [number, number, number]) => void;
  readonly getLodDistances: () => readonly [number, number, number];
  readonly setDebugViewMode: (mode: TerrainDebugViewMode) => void;
  readonly getDebugViewMode: () => TerrainDebugViewMode;
  readonly setTerrainMaterialConfig: (config: TerrainMaterialConfig) => void;
  readonly getTerrainMaterialConfig: () => TerrainMaterialConfig;
  readonly setTerrainMaterialThresholds: (thresholds: TerrainLayerThresholds) => void;
  readonly getTerrainMaterialThresholds: () => TerrainLayerThresholds;
  readonly setUseGeneratedTextures: (enabled: boolean) => Promise<void>;
  readonly getUseGeneratedTextures: () => boolean;
  readonly rebuildTerrain: (overrides: TerrainConfigOverrides) => Promise<void>;
  readonly getTerrainConfig: () => TerrainConfig;
  readonly getFoliageStats: () => TerrainFoliageStats;
  readonly getPoiSites: () => readonly TerrainPoi[];
  readonly getPoiStats: () => TerrainPoiStats;
  readonly getPoiMeshStats: () => TerrainPoiMeshStats;
  readonly setPoiDebugConfig: (config: TerrainPoiDebugConfig) => void;
  readonly getPoiDebugConfig: () => TerrainPoiDebugConfig;
  readonly getRoads: () => readonly TerrainRoad[];
  readonly getRoadStats: () => TerrainRoadStats;
  readonly getBuildStatus: () => TerrainBuildStatus;
  readonly subscribeBuildStatus: (
    listener: (status: TerrainBuildStatus) => void
  ) => () => void;
  readonly getWorkerStatus: () => TerrainWorkerStatus;
  readonly getBuildProfile: () => TerrainBuildProfile;
}

export interface TerrainBuildStatus {
  readonly phase: "idle" | "world" | "chunks" | "error";
  readonly message: string;
  readonly completed: number;
  readonly total: number;
}

export interface TerrainWorkerStatus {
  readonly workersEnabled: boolean;
  readonly sharedSnapshotsEnabled: boolean;
  readonly crossOriginIsolated: boolean;
  readonly sharedArrayBufferDefined: boolean;
  readonly snapshotMode: "shared" | "copied" | "main-thread";
  readonly liveTerrainSystems: number;
  readonly chunkCount: number;
  readonly loadedChunkMeshes: number;
  readonly pendingChunkMeshes: number;
  readonly applyingChunkMeshes: boolean;
}

export interface TerrainBuildProfile {
  readonly lastWorldBuildMs: number;
  readonly lastTerrainSwapMs: number;
  readonly lastChunkWorkerBuildMs: number;
  readonly lastMeshApplyMs: number;
  readonly lastTotalRebuildMs: number;
}

export function createTerrainDemo(
  canvas: HTMLCanvasElement,
  overrides: TerrainConfigOverrides = {},
  textureOptions: TerrainTextureOptions = {}
): TerrainDemo {
  const engine = new Engine(canvas, true);
  const scene = new Scene(engine);

  const camera = new ArcRotateCamera(
    "terrain-camera",
    -Math.PI / 4,
    Math.PI / 3.2,
    1180,
    new Vector3(0, 32, 0),
    scene
  );
  camera.lowerRadiusLimit = 140;
  camera.upperRadiusLimit = 2000;
  camera.wheelDeltaPercentage = 0.01;
  camera.attachControl(canvas, true);

  const light = new HemisphericLight("terrain-light", new Vector3(0.4, 1, 0.2), scene);
  light.intensity = 0.95;
  const workersEnabled = typeof Worker !== "undefined";
  const crossOriginIsolated = globalThis.crossOriginIsolated === true;
  const sharedArrayBufferDefined = typeof SharedArrayBuffer !== "undefined";
  const sharedSnapshotsEnabled =
    sharedArrayBufferDefined && crossOriginIsolated;
  const buildCoordinator = new TerrainBuildCoordinator(sharedSnapshotsEnabled);
  const chunkBuildCoordinator = new TerrainChunkBuildCoordinator();
  let buildVersion = 0;
  let buildStatus: TerrainBuildStatus = {
    phase: "idle",
    message: "",
    completed: 0,
    total: 0
  };
  let buildProfile: TerrainBuildProfile = {
    lastWorldBuildMs: 0,
    lastTerrainSwapMs: 0,
    lastChunkWorkerBuildMs: 0,
    lastMeshApplyMs: 0,
    lastTotalRebuildMs: 0
  };
  const buildStatusListeners = new Set<(status: TerrainBuildStatus) => void>();

  const setBuildStatus = (status: TerrainBuildStatus): void => {
    buildStatus = status;
    buildStatusListeners.forEach((listener) => listener(status));
  };

  const createBuildOptions = (
    version: number,
    initialCameraPosition: Vector3 = camera.position.clone()
  ): TerrainSystemBuildOptions => ({
    chunkBuildCoordinator,
    chunkBuildVersion: version,
    initialCameraPosition,
    onChunkBuildProgress: (progress) => {
      if (version !== buildVersion) {
        return;
      }

      setBuildStatus({
        phase: "chunks",
        message: `Building chunks ${progress.completedChunks}/${progress.totalChunks}`,
        completed: progress.completedChunks,
        total: progress.totalChunks
      });
    }
  });

  let terrainSystem = new TerrainSystem(
    scene,
    overrides,
    textureOptions,
    null,
    createBuildOptions(buildVersion, camera.position.clone())
  );
  frameCameraToWorld(camera, terrainSystem.getConfig());
  terrainSystem.initialize();
  void terrainSystem
    .whenChunkMeshesReady()
    .then(() => {
      if (buildVersion === 0) {
        setBuildStatus({
          phase: "idle",
          message: "",
          completed: 0,
          total: 0
        });
      }
    })
    .catch((error) => {
      console.error(error);
      if (buildVersion === 0) {
        setBuildStatus({
          phase: "error",
          message: error instanceof Error ? error.message : String(error),
          completed: 0,
          total: 0
        });
      }
    });
  terrainSystem.update(camera.position);

  scene.onBeforeRenderObservable.add(() => {
    terrainSystem.update(camera.position);
    terrainSystem.updateDebugOverlay();
  });

  engine.runRenderLoop(() => {
    scene.render();
  });

  window.addEventListener("resize", () => {
    engine.resize();
  });
  window.addEventListener("beforeunload", () => {
    buildCoordinator.dispose();
    chunkBuildCoordinator.dispose();
  });

  const replaceTerrainSystem = async (
    nextConfigOverrides: TerrainConfigOverrides,
    nextTextureOptions: TerrainTextureOptions
  ): Promise<void> => {
    const rebuildStartedAt = performance.now();
    const wireframe = terrainSystem.getWireframe();
    const debugViewMode = terrainSystem.getDebugViewMode();
    const terrainMaterialConfig = terrainSystem.getTerrainMaterialConfig();
    const waterLevel = terrainSystem.getWaterLevel();
    const waterConfig = terrainSystem.getWaterConfig();
    const collisionRadius = terrainSystem.getCollisionRadius();
    const foliageRadius = terrainSystem.getFoliageRadius();
    const showFoliage = terrainSystem.getShowFoliage();
    const showPoi = terrainSystem.getShowPoi();
    const poiMarkerMeshesVisible = terrainSystem.getPoiMarkerMeshesVisible();
    const poiLabelsVisible = terrainSystem.getPoiLabelsVisible();
    const showPoiFootprints = terrainSystem.getShowPoiFootprints();
    const poiDebugConfig = terrainSystem.getPoiDebugConfig();
    const showRoads = terrainSystem.getShowRoads();
    const lodDistances = terrainSystem.getLodDistances();
    const currentConfig = terrainSystem.getConfig();
    const mergedOverrides: TerrainConfigOverrides = {
      ...currentConfig,
      ...nextConfigOverrides,
      erosion: {
        ...currentConfig.erosion,
        ...nextConfigOverrides.erosion
      },
      features: {
        ...currentConfig.features,
        ...nextConfigOverrides.features
      },
      poi: {
        ...currentConfig.poi,
        ...nextConfigOverrides.poi
      },
      rivers: {
        ...currentConfig.rivers,
        ...nextConfigOverrides.rivers
      },
      shape: {
        ...currentConfig.shape,
        ...nextConfigOverrides.shape
      }
    };
    const nextConfig = mergeTerrainConfig(mergedOverrides);
    const nextBuildVersion = ++buildVersion;
    setBuildStatus({
      phase: "world",
      message: nextConfig.features.poi
        ? "Building world features"
        : "Preparing terrain rebuild",
      completed: 0,
      total: 1
    });
    const worldBuildStartedAt = performance.now();
    const prebuiltWorld = await buildCoordinator.buildWorld(
      nextConfig,
      nextBuildVersion
    );
    const worldBuildDurationMs = performance.now() - worldBuildStartedAt;
    if (nextBuildVersion !== buildVersion) {
      return;
    }

    const terrainSwapStartedAt = performance.now();
    terrainSystem.dispose();
    frameCameraToWorld(camera, nextConfig);
    terrainSystem = new TerrainSystem(
      scene,
      nextConfig,
      nextTextureOptions,
      prebuiltWorld,
      createBuildOptions(nextBuildVersion, camera.position.clone())
    );
    terrainSystem.initialize();
    terrainSystem.setWireframe(wireframe);
    terrainSystem.setCollisionRadius(
      nextConfigOverrides.collisionRadius ?? collisionRadius
    );
    terrainSystem.setFoliageRadius(
      nextConfigOverrides.foliageRadius ?? foliageRadius
    );
    terrainSystem.setShowFoliage(showFoliage);
    terrainSystem.setShowPoi(showPoi);
    terrainSystem.setPoiMarkerMeshesVisible(poiMarkerMeshesVisible);
    terrainSystem.setPoiLabelsVisible(poiLabelsVisible);
    terrainSystem.setShowPoiFootprints(showPoiFootprints);
    terrainSystem.setPoiDebugConfig(poiDebugConfig);
    terrainSystem.setShowRoads(showRoads);
    terrainSystem.setLodDistances(nextConfigOverrides.lodDistances ?? lodDistances);
    terrainSystem.setWaterLevel(nextConfigOverrides.waterLevel ?? waterLevel);
    terrainSystem.setTerrainMaterialConfig(terrainMaterialConfig);
    terrainSystem.setWaterConfig(waterConfig);
    terrainSystem.setDebugViewMode(debugViewMode);
    terrainSystem.update(camera.position);
    await terrainSystem.whenChunkMeshesReady();
    const terrainSwapDurationMs = performance.now() - terrainSwapStartedAt;
    if (nextBuildVersion !== buildVersion) {
      return;
    }
    const chunkProfile: TerrainChunkBuildProfile = terrainSystem.getChunkBuildProfile();
    buildProfile = {
      lastWorldBuildMs: worldBuildDurationMs,
      lastTerrainSwapMs: terrainSwapDurationMs,
      lastChunkWorkerBuildMs: chunkProfile.workerBuildMs,
      lastMeshApplyMs: chunkProfile.meshApplyMs,
      lastTotalRebuildMs: performance.now() - rebuildStartedAt
    };
    setBuildStatus({
      phase: "idle",
      message: "",
      completed: 0,
      total: 0
    });
  };

  return {
    engine,
    scene,
    camera,
    getTerrainSystem: () => terrainSystem,
    setWireframe: (enabled: boolean) => terrainSystem.setWireframe(enabled),
    toggleDebugOverlay: () => terrainSystem.toggleDebugOverlay(),
    setWaterLevel: (level: number) => terrainSystem.setWaterLevel(level),
    getWaterLevel: () => terrainSystem.getWaterLevel(),
    setWaterConfig: (config: TerrainWaterConfig) => terrainSystem.setWaterConfig(config),
    getWaterConfig: () => terrainSystem.getWaterConfig(),
    setCollisionRadius: (radius: number) => terrainSystem.setCollisionRadius(radius),
    getCollisionRadius: () => terrainSystem.getCollisionRadius(),
    setFoliageRadius: (radius: number) => terrainSystem.setFoliageRadius(radius),
    getFoliageRadius: () => terrainSystem.getFoliageRadius(),
    setShowFoliage: (enabled: boolean) => terrainSystem.setShowFoliage(enabled),
    getShowFoliage: () => terrainSystem.getShowFoliage(),
    setShowPoi: (enabled: boolean) => terrainSystem.setShowPoi(enabled),
    getShowPoi: () => terrainSystem.getShowPoi(),
    setPoiMarkerMeshesVisible: (enabled: boolean) =>
      terrainSystem.setPoiMarkerMeshesVisible(enabled),
    getPoiMarkerMeshesVisible: () => terrainSystem.getPoiMarkerMeshesVisible(),
    setPoiLabelsVisible: (enabled: boolean) =>
      terrainSystem.setPoiLabelsVisible(enabled),
    getPoiLabelsVisible: () => terrainSystem.getPoiLabelsVisible(),
    setShowPoiFootprints: (enabled: boolean) =>
      terrainSystem.setShowPoiFootprints(enabled),
    getShowPoiFootprints: () => terrainSystem.getShowPoiFootprints(),
    setShowRoads: (enabled: boolean) => terrainSystem.setShowRoads(enabled),
    getShowRoads: () => terrainSystem.getShowRoads(),
    setLodDistances: (distances: readonly [number, number, number]) =>
      terrainSystem.setLodDistances(distances),
    getLodDistances: () => terrainSystem.getLodDistances(),
    setDebugViewMode: (mode: TerrainDebugViewMode) =>
      terrainSystem.setDebugViewMode(mode),
    getDebugViewMode: () => terrainSystem.getDebugViewMode(),
    setTerrainMaterialConfig: (config: TerrainMaterialConfig) =>
      terrainSystem.setTerrainMaterialConfig(config),
    getTerrainMaterialConfig: () => terrainSystem.getTerrainMaterialConfig(),
    setTerrainMaterialThresholds: (thresholds: TerrainLayerThresholds) =>
      terrainSystem.setTerrainMaterialThresholds(thresholds),
    getTerrainMaterialThresholds: () => terrainSystem.getTerrainMaterialThresholds(),
    setUseGeneratedTextures: async (enabled: boolean) => {
      const nextTextureOptions = {
        ...terrainSystem.getTextureOptions(),
        useGeneratedTextures: enabled
      };
      await replaceTerrainSystem(terrainSystem.getConfig(), nextTextureOptions);
    },
    getUseGeneratedTextures: () => terrainSystem.getTextureOptions().useGeneratedTextures,
    rebuildTerrain: (nextOverrides: TerrainConfigOverrides) =>
      replaceTerrainSystem(nextOverrides, terrainSystem.getTextureOptions()),
    getTerrainConfig: () => terrainSystem.getConfig(),
    getFoliageStats: () => terrainSystem.getFoliageStats(),
    getPoiSites: () => terrainSystem.getPoiSites(),
    getPoiStats: () => terrainSystem.getPoiStats(),
    getPoiMeshStats: () => terrainSystem.getPoiMeshStats(),
    setPoiDebugConfig: (config: TerrainPoiDebugConfig) =>
      terrainSystem.setPoiDebugConfig(config),
    getPoiDebugConfig: () => terrainSystem.getPoiDebugConfig(),
    getRoads: () => terrainSystem.getRoads(),
    getRoadStats: () => terrainSystem.getRoadStats(),
    getBuildStatus: () => buildStatus,
    subscribeBuildStatus: (listener) => {
      buildStatusListeners.add(listener);
      listener(buildStatus);
      return () => {
        buildStatusListeners.delete(listener);
      };
    },
    getWorkerStatus: () => ({
      workersEnabled,
      sharedSnapshotsEnabled,
      crossOriginIsolated,
      sharedArrayBufferDefined,
      snapshotMode: !workersEnabled
        ? "main-thread"
        : sharedSnapshotsEnabled
          ? "shared"
          : "copied",
      liveTerrainSystems: TerrainSystem.getLiveSystemCount(),
      chunkCount: terrainSystem.getChunkCount(),
      loadedChunkMeshes: terrainSystem.getLoadedChunkMeshCount(),
      pendingChunkMeshes: terrainSystem.getPendingChunkMeshCount(),
      applyingChunkMeshes: terrainSystem.isApplyingChunkMeshes()
    }),
    getBuildProfile: () => ({ ...buildProfile })
  };
}

function frameCameraToWorld(
  camera: ArcRotateCamera,
  config: TerrainConfig
): void {
  const baseRadius = Math.max(config.worldSize * 1.15, 240);
  camera.lowerRadiusLimit = Math.max(config.chunkSize * 0.75, 120);
  camera.upperRadiusLimit = Math.max(config.worldSize * 2.4, baseRadius + 200);
  camera.target = new Vector3(0, Math.max(config.baseHeight + 50, 24), 0);
  camera.radius = Math.max(camera.radius, baseRadius);
}

export * from "./terrain";
