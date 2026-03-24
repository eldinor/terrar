import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Scene } from "@babylonjs/core/scene";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import {
  buildTerrain,
  BuiltTerrain,
  BuiltTerrainConfig,
  BuiltTerrainConfigOverrides,
  resolveBuiltTerrainConfig
} from "../builder";
import {
  BabylonTerrainAdapter,
  BabylonTerrainBuildOptions,
  BabylonTerrainDebugViewMode,
  BabylonTerrainLayerThresholds,
  BabylonTerrainMaterialConfig,
  BabylonTerrainPoiDebugConfig,
  BabylonTerrainPoiMeshStats,
  BabylonTerrainPoiStats,
  BabylonTerrainRoadStats,
  createRenderController,
  RenderSuspendToken,
  BabylonTerrainTextureOptions,
  BabylonTerrainWaterConfig,
  renderBuiltTerrain
} from "../adapters/babylon";
import { BuiltTerrainPoi, BuiltTerrainRoad } from "../builder";
import { TerrainBuildCoordinator } from "../terrain/TerrainBuildCoordinator";
import { TerrainChunkBuildCoordinator } from "../terrain/TerrainChunkBuildCoordinator";
import { TerrainSystem } from "../terrain/TerrainSystem";
import { TerrainChunkBuildProfile } from "../terrain/TerrainChunkMeshRuntime";
import { TerrainFoliageStats } from "../terrain/TerrainFoliageSystem";

export interface TerrainDemo {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  readonly beginRendering: () => void;
  readonly stopRendering: () => void;
  readonly suspendRendering: () => RenderSuspendToken;
  readonly markSceneMutated: () => void;
  readonly setWireframe: (enabled: boolean) => void;
  readonly toggleDebugOverlay: () => Promise<boolean>;
  readonly setWaterLevel: (level: number) => void;
  readonly getWaterLevel: () => number;
  readonly setWaterConfig: (config: BabylonTerrainWaterConfig) => void;
  readonly getWaterConfig: () => BabylonTerrainWaterConfig;
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
  readonly setDebugViewMode: (mode: BabylonTerrainDebugViewMode) => void;
  readonly getDebugViewMode: () => BabylonTerrainDebugViewMode;
  readonly setTerrainMaterialConfig: (config: BabylonTerrainMaterialConfig) => void;
  readonly getTerrainMaterialConfig: () => BabylonTerrainMaterialConfig;
  readonly setTerrainMaterialThresholds: (thresholds: BabylonTerrainLayerThresholds) => void;
  readonly getTerrainMaterialThresholds: () => BabylonTerrainLayerThresholds;
  readonly setUseGeneratedTextures: (enabled: boolean) => Promise<void>;
  readonly getUseGeneratedTextures: () => boolean;
  readonly rebuildTerrain: (overrides: BuiltTerrainConfigOverrides) => Promise<void>;
  readonly getTerrainConfig: () => BuiltTerrainConfig;
  readonly getFoliageStats: () => TerrainFoliageStats;
  readonly getPoiSites: () => readonly BuiltTerrainPoi[];
  readonly getPoiStats: () => BabylonTerrainPoiStats;
  readonly getPoiMeshStats: () => BabylonTerrainPoiMeshStats;
  readonly setPoiDebugConfig: (config: BabylonTerrainPoiDebugConfig) => void;
  readonly getPoiDebugConfig: () => BabylonTerrainPoiDebugConfig;
  readonly getRoads: () => readonly BuiltTerrainRoad[];
  readonly getRoadStats: () => BabylonTerrainRoadStats;
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

export interface TerrainDemoRenderPolicyContext {
  readonly buildStatus: TerrainBuildStatus;
  readonly camera: ArcRotateCamera;
  readonly scene: Scene;
}

export interface TerrainDemoRenderPolicy {
  readonly forceReadyFrame?: boolean;
  readonly idleTimeoutMs?: number;
  readonly shouldRender?: (context: TerrainDemoRenderPolicyContext) => boolean;
}

export interface TerrainDemoOptions {
  readonly renderPolicy?: TerrainDemoRenderPolicy;
}

export const DEFAULT_DEMO_RENDER_POLICY: TerrainDemoRenderPolicy = {
  idleTimeoutMs: 250,
  forceReadyFrame: true
};

export function resolveTerrainDemoRenderPolicy(
  renderPolicy?: TerrainDemoRenderPolicy
): TerrainDemoRenderPolicy {
  return renderPolicy ?? DEFAULT_DEMO_RENDER_POLICY;
}

export function createTerrainDemo(
  canvas: HTMLCanvasElement,
  overrides: BuiltTerrainConfigOverrides = {},
  textureOptions: BabylonTerrainTextureOptions = {},
  options: TerrainDemoOptions = {}
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
  let lastCameraState = captureCameraState(camera);
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
  const renderPolicy = resolveTerrainDemoRenderPolicy(options.renderPolicy);
  const renderActivityState = {
    awaitingChunkMeshes: false,
    awaitingFoliage: false,
    togglingDebugOverlay: false
  };
  let renderController!: ReturnType<typeof createRenderController>;
  const buildStatusListeners = new Set<(status: TerrainBuildStatus) => void>();

  const setBuildStatus = (status: TerrainBuildStatus): void => {
    buildStatus = status;
    buildStatusListeners.forEach((listener) => listener(status));
  };

  const createBuildOptions = (
    version: number,
    initialCameraPosition: Vector3 = camera.position.clone()
  ): BabylonTerrainBuildOptions => ({
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

  const createTerrainAdapter = (
    terrain: BuiltTerrain,
    nextTextureOptions: BabylonTerrainTextureOptions,
    version: number
  ): BabylonTerrainAdapter =>
    renderBuiltTerrain(scene, terrain, {
      textureOptions: nextTextureOptions,
      buildOptions: createBuildOptions(version, camera.position.clone())
    });

  const trackAdapterActivity = (
    adapter: BabylonTerrainAdapter,
    version: number
  ): void => {
    renderActivityState.awaitingChunkMeshes = true;
    renderActivityState.awaitingFoliage = true;

    void adapter.whenChunkMeshesReady()
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        if (version !== buildVersion) {
          return;
        }
        renderActivityState.awaitingChunkMeshes = false;
        renderController.markSceneMutated();
      });

    void adapter.whenFoliageReady()
      .catch((error) => {
        console.error(error);
      })
      .finally(() => {
        if (version !== buildVersion) {
          return;
        }
        renderActivityState.awaitingFoliage = false;
        renderController.markSceneMutated();
      });
  };

  const shouldRenderForAsyncSceneWork = (): boolean => {
    return (
      buildStatus.phase !== "idle" ||
      renderActivityState.awaitingChunkMeshes ||
      renderActivityState.awaitingFoliage ||
      renderActivityState.togglingDebugOverlay ||
      terrainAdapter.isApplyingChunkMeshes() ||
      terrainAdapter.getPendingChunkMeshCount() > 0
    );
  };

  let terrain = buildTerrain(overrides, sharedSnapshotsEnabled);
  let terrainAdapter = createTerrainAdapter(
    terrain,
    textureOptions,
    buildVersion
  );
  frameCameraToWorld(camera, terrainAdapter.getConfig());
  terrainAdapter.initialize();
  void terrainAdapter
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
  terrainAdapter.update(camera.position);
  renderController = createRenderController(engine, {
    forceReadyFrame: renderPolicy.forceReadyFrame,
    idleTimeoutMs: renderPolicy.idleTimeoutMs,
    renderFrame: () => {
      terrainAdapter.update(camera.position);
      terrainAdapter.updateDebugOverlay();
      scene.render();

      const nextCameraState = captureCameraState(camera);
      if (hasCameraStateChanged(lastCameraState, nextCameraState)) {
        renderController.markSceneMutated();
      }
      lastCameraState = nextCameraState;
    },
    shouldRender: () =>
      shouldRenderForAsyncSceneWork() ||
      (renderPolicy.shouldRender?.({
        buildStatus,
        camera,
        scene
      }) ?? false)
  });
  trackAdapterActivity(terrainAdapter, buildVersion);
  renderController.markSceneMutated();

  const beginInteractiveRendering = (): void => {
    renderController.markSceneMutated();
  };

  window.addEventListener("resize", () => {
    engine.resize();
    beginInteractiveRendering();
  });
  window.addEventListener("beforeunload", () => {
    buildCoordinator.dispose();
    chunkBuildCoordinator.dispose();
  });
  canvas.addEventListener("pointerdown", beginInteractiveRendering);
  canvas.addEventListener("pointermove", beginInteractiveRendering);
  canvas.addEventListener("pointerup", beginInteractiveRendering);
  canvas.addEventListener("wheel", beginInteractiveRendering, { passive: true });
  canvas.addEventListener("touchstart", beginInteractiveRendering, { passive: true });
  canvas.addEventListener("touchmove", beginInteractiveRendering, { passive: true });
  window.addEventListener("keydown", beginInteractiveRendering);

  const replaceTerrainSystem = async (
    nextConfigOverrides: BuiltTerrainConfigOverrides,
    nextTextureOptions: BabylonTerrainTextureOptions
  ): Promise<void> => {
    const renderSuspendToken = renderController.suspendRendering();
    const rebuildStartedAt = performance.now();
    try {
      const wireframe = terrainAdapter.getWireframe();
      const debugViewMode = terrainAdapter.getDebugViewMode();
      const terrainMaterialConfig = terrainAdapter.getTerrainMaterialConfig();
      const waterLevel = terrainAdapter.getWaterLevel();
      const waterConfig = terrainAdapter.getWaterConfig();
      const collisionRadius = terrainAdapter.getCollisionRadius();
      const foliageRadius = terrainAdapter.getFoliageRadius();
      const showFoliage = terrainAdapter.getShowFoliage();
      const showPoi = terrainAdapter.getShowPoi();
      const poiMarkerMeshesVisible = terrainAdapter.getPoiMarkerMeshesVisible();
      const poiLabelsVisible = terrainAdapter.getPoiLabelsVisible();
      const showPoiFootprints = terrainAdapter.getShowPoiFootprints();
      const poiDebugConfig = terrainAdapter.getPoiDebugConfig();
      const showRoads = terrainAdapter.getShowRoads();
      const lodDistances = terrainAdapter.getLodDistances();
      const currentConfig = terrainAdapter.getConfig();
      const nextConfig = resolveBuiltTerrainConfig({
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
      });
      const nextShowFoliage =
        nextConfig.buildFoliage &&
        (nextConfigOverrides.buildFoliage === true || showFoliage);
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
      const nextTerrain = await buildCoordinator.buildTerrain(
        nextConfig,
        nextBuildVersion
      );
      const worldBuildDurationMs = performance.now() - worldBuildStartedAt;
      if (nextBuildVersion !== buildVersion) {
        return;
      }

      const terrainSwapStartedAt = performance.now();
      terrainAdapter.dispose();
      frameCameraToWorld(camera, nextConfig);
      terrain = nextTerrain;
      terrainAdapter = createTerrainAdapter(
        terrain,
        nextTextureOptions,
        nextBuildVersion
      );
      terrainAdapter.initialize();
      trackAdapterActivity(terrainAdapter, nextBuildVersion);
      terrainAdapter.setWireframe(wireframe);
      terrainAdapter.setCollisionRadius(
        nextConfigOverrides.collisionRadius ?? collisionRadius
      );
      terrainAdapter.setFoliageRadius(
        nextConfigOverrides.foliageRadius ?? foliageRadius
      );
      terrainAdapter.setShowFoliage(nextShowFoliage);
      terrainAdapter.setShowPoi(showPoi);
      terrainAdapter.setPoiMarkerMeshesVisible(poiMarkerMeshesVisible);
      terrainAdapter.setPoiLabelsVisible(poiLabelsVisible);
      terrainAdapter.setShowPoiFootprints(showPoiFootprints);
      terrainAdapter.setPoiDebugConfig(poiDebugConfig);
      terrainAdapter.setShowRoads(showRoads);
      terrainAdapter.setLodDistances(nextConfigOverrides.lodDistances ?? lodDistances);
      terrainAdapter.setWaterLevel(nextConfigOverrides.waterLevel ?? waterLevel);
      terrainAdapter.setTerrainMaterialConfig(terrainMaterialConfig);
      terrainAdapter.setWaterConfig(waterConfig);
      terrainAdapter.setDebugViewMode(debugViewMode);
      terrainAdapter.update(camera.position);
      await Promise.all([
        terrainAdapter.whenChunkMeshesReady(),
        terrainAdapter.whenFoliageReady()
      ]);
      const terrainSwapDurationMs = performance.now() - terrainSwapStartedAt;
      if (nextBuildVersion !== buildVersion) {
        return;
      }
      const chunkProfile: TerrainChunkBuildProfile = terrainAdapter.getChunkBuildProfile();
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
      lastCameraState = captureCameraState(camera);
      renderController.markSceneMutated();
    } finally {
      renderSuspendToken.dispose();
    }
  };

  const mutateScene = <Args extends readonly unknown[]>(
    mutate: (...args: Args) => void
  ): ((...args: Args) => void) => {
    return (...args: Args): void => {
      mutate(...args);
      renderController.markSceneMutated();
    };
  };

  return {
    engine,
    scene,
    camera,
    beginRendering: () => renderController.beginRendering(),
    stopRendering: () => renderController.stopRendering(),
    suspendRendering: () => renderController.suspendRendering(),
    markSceneMutated: () => renderController.markSceneMutated(),
    setWireframe: mutateScene((enabled: boolean) => terrainAdapter.setWireframe(enabled)),
    toggleDebugOverlay: async () => {
      renderActivityState.togglingDebugOverlay = true;
      renderController.markSceneMutated();
      try {
        const visible = await terrainAdapter.toggleDebugOverlay();
        renderController.markSceneMutated();
        return visible;
      } finally {
        renderActivityState.togglingDebugOverlay = false;
        renderController.markSceneMutated();
      }
    },
    setWaterLevel: mutateScene((level: number) => terrainAdapter.setWaterLevel(level)),
    getWaterLevel: () => terrainAdapter.getWaterLevel(),
    setWaterConfig: mutateScene((config: BabylonTerrainWaterConfig) => terrainAdapter.setWaterConfig(config)),
    getWaterConfig: () => terrainAdapter.getWaterConfig(),
    setCollisionRadius: mutateScene((radius: number) => terrainAdapter.setCollisionRadius(radius)),
    getCollisionRadius: () => terrainAdapter.getCollisionRadius(),
    setFoliageRadius: mutateScene((radius: number) => terrainAdapter.setFoliageRadius(radius)),
    getFoliageRadius: () => terrainAdapter.getFoliageRadius(),
    setShowFoliage: mutateScene((enabled: boolean) => terrainAdapter.setShowFoliage(enabled)),
    getShowFoliage: () => terrainAdapter.getShowFoliage(),
    setShowPoi: mutateScene((enabled: boolean) => terrainAdapter.setShowPoi(enabled)),
    getShowPoi: () => terrainAdapter.getShowPoi(),
    setPoiMarkerMeshesVisible: mutateScene((enabled: boolean) =>
      terrainAdapter.setPoiMarkerMeshesVisible(enabled),
    ),
    getPoiMarkerMeshesVisible: () => terrainAdapter.getPoiMarkerMeshesVisible(),
    setPoiLabelsVisible: mutateScene((enabled: boolean) =>
      terrainAdapter.setPoiLabelsVisible(enabled),
    ),
    getPoiLabelsVisible: () => terrainAdapter.getPoiLabelsVisible(),
    setShowPoiFootprints: mutateScene((enabled: boolean) =>
      terrainAdapter.setShowPoiFootprints(enabled),
    ),
    getShowPoiFootprints: () => terrainAdapter.getShowPoiFootprints(),
    setShowRoads: mutateScene((enabled: boolean) => terrainAdapter.setShowRoads(enabled)),
    getShowRoads: () => terrainAdapter.getShowRoads(),
    setLodDistances: mutateScene((distances: readonly [number, number, number]) =>
      terrainAdapter.setLodDistances(distances),
    ),
    getLodDistances: () => terrainAdapter.getLodDistances(),
    setDebugViewMode: mutateScene((mode: BabylonTerrainDebugViewMode) =>
      terrainAdapter.setDebugViewMode(mode),
    ),
    getDebugViewMode: () => terrainAdapter.getDebugViewMode(),
    setTerrainMaterialConfig: mutateScene((config: BabylonTerrainMaterialConfig) =>
      terrainAdapter.setTerrainMaterialConfig(config),
    ),
    getTerrainMaterialConfig: () => terrainAdapter.getTerrainMaterialConfig(),
    setTerrainMaterialThresholds: mutateScene((thresholds: BabylonTerrainLayerThresholds) =>
      terrainAdapter.setTerrainMaterialThresholds(thresholds),
    ),
    getTerrainMaterialThresholds: () => terrainAdapter.getTerrainMaterialThresholds(),
    setUseGeneratedTextures: async (enabled: boolean) => {
      const nextTextureOptions = {
        ...terrainAdapter.getTextureOptions(),
        useGeneratedTextures: enabled
      };
      await replaceTerrainSystem(terrainAdapter.getConfig(), nextTextureOptions);
    },
    getUseGeneratedTextures: () => terrainAdapter.getTextureOptions().useGeneratedTextures,
    rebuildTerrain: (nextOverrides: BuiltTerrainConfigOverrides) =>
      replaceTerrainSystem(nextOverrides, terrainAdapter.getTextureOptions()),
    getTerrainConfig: () => terrainAdapter.getConfig(),
    getFoliageStats: () => terrainAdapter.getFoliageStats(),
    getPoiSites: () => terrainAdapter.getPoiSites(),
    getPoiStats: () => terrainAdapter.getPoiStats(),
    getPoiMeshStats: () => terrainAdapter.getPoiMeshStats(),
    setPoiDebugConfig: mutateScene((config: BabylonTerrainPoiDebugConfig) =>
      terrainAdapter.setPoiDebugConfig(config),
    ),
    getPoiDebugConfig: () => terrainAdapter.getPoiDebugConfig(),
    getRoads: () => terrainAdapter.getRoads(),
    getRoadStats: () => terrainAdapter.getRoadStats(),
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
      chunkCount: terrainAdapter.getChunkCount(),
      loadedChunkMeshes: terrainAdapter.getLoadedChunkMeshCount(),
      pendingChunkMeshes: terrainAdapter.getPendingChunkMeshCount(),
      applyingChunkMeshes: terrainAdapter.isApplyingChunkMeshes()
    }),
    getBuildProfile: () => ({ ...buildProfile })
  };
}

function frameCameraToWorld(
  camera: ArcRotateCamera,
  config: BuiltTerrainConfig
): void {
  const baseRadius = Math.max(config.worldSize * 1.15, 240);
  camera.lowerRadiusLimit = Math.max(config.chunkSize * 0.75, 120);
  camera.upperRadiusLimit = Math.max(config.worldSize * 2.4, baseRadius + 200);
  camera.target = new Vector3(0, Math.max(config.baseHeight + 50, 24), 0);
  camera.radius = Math.max(camera.radius, baseRadius);
}

interface CameraStateSnapshot {
  readonly alpha: number;
  readonly beta: number;
  readonly radius: number;
  readonly position: Vector3;
  readonly target: Vector3;
}

function captureCameraState(camera: ArcRotateCamera): CameraStateSnapshot {
  return {
    alpha: camera.alpha,
    beta: camera.beta,
    radius: camera.radius,
    position: camera.position.clone(),
    target: camera.target.clone()
  };
}

function hasCameraStateChanged(
  previous: CameraStateSnapshot,
  next: CameraStateSnapshot
): boolean {
  return (
    previous.alpha !== next.alpha ||
    previous.beta !== next.beta ||
    previous.radius !== next.radius ||
    !previous.position.equals(next.position) ||
    !previous.target.equals(next.target)
  );
}
