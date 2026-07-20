import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import { ArcRotateCameraPointersInput } from "@babylonjs/core/Cameras/Inputs/arcRotateCameraPointersInput";
import "@babylonjs/core/Culling/ray";
import { Engine } from "@babylonjs/core/Engines/engine";
import { SceneInstrumentation } from "@babylonjs/core/Instrumentation/sceneInstrumentation";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Scene } from "@babylonjs/core/scene";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { VertexBuffer } from "@babylonjs/core/Buffers/buffer";
import { VertexData } from "@babylonjs/core/Meshes/mesh.vertexData";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
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
import {
  TerrainEditSession,
  type TerrainBrushSettings,
  type TerrainEditTool,
  type TerrainSelectionMode
} from "../terrain/TerrainEditSession";

export type TerrainEditorWorkflow = "sculpt" | "select";
export type TerrainSelectionShape = "brush" | "rectangle";

export interface TerrainEditorSettings {
  readonly workflow: TerrainEditorWorkflow;
  readonly tool: TerrainEditTool;
  readonly selectionShape: TerrainSelectionShape;
  readonly selectionMode: TerrainSelectionMode;
  readonly brush: TerrainBrushSettings;
}

interface TerrainEditorBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
}

/**
 * Runtime API exposed by the interactive terrain demo.
 */
export interface TerrainDemo {
  readonly engine: Engine;
  readonly scene: Scene;
  readonly camera: ArcRotateCamera;
  readonly getTerrainAsset: () => BuiltTerrain;
  readonly getTerrainEditSession: () => TerrainEditSession;
  readonly setEditorEnabled: (enabled: boolean) => void;
  readonly getEditorEnabled: () => boolean;
  readonly setEditorSettings: (settings: TerrainEditorSettings) => void;
  readonly getEditorSettings: () => TerrainEditorSettings;
  readonly flushTerrainEdits: () => Promise<void>;
  readonly applyTerrainEditChanges: () => void;
  readonly getEditorDerivedDirty: () => boolean;
  readonly importTerrainAsset: (terrain: BuiltTerrain) => Promise<void>;
  readonly beginRendering: () => void;
  readonly stopRendering: () => void;
  readonly suspendRendering: () => RenderSuspendToken;
  readonly markSceneMutated: () => void;
  readonly setWireframe: (enabled: boolean) => void;
  readonly setTexturesEnabled: (enabled: boolean) => void;
  readonly getTexturesEnabled: () => boolean;
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
  readonly setForceLod0: (enabled: boolean) => void;
  readonly getForceLod0: () => boolean;
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
  readonly getPerformanceStats: () => TerrainPerformanceStats;
  readonly getWorkerStatus: () => TerrainWorkerStatus;
  readonly getBuildProfile: () => TerrainBuildProfile;
}

/**
 * Coarse-grained rebuild state for world generation and chunk application.
 */
export interface TerrainBuildStatus {
  readonly phase: "idle" | "world" | "chunks" | "error";
  readonly message: string;
  readonly completed: number;
  readonly total: number;
}

/**
 * Worker and chunk-pipeline health surfaced to the UI.
 */
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

/**
 * Timing measurements captured for the most recent terrain rebuild.
 */
export interface TerrainBuildProfile {
  readonly lastWorldBuildMs: number;
  readonly lastTerrainSwapMs: number;
  readonly lastChunkWorkerBuildMs: number;
  readonly lastMeshApplyMs: number;
  readonly lastTotalRebuildMs: number;
}

/**
 * Lazily sampled render statistics shown in the debug footer.
 */
export interface TerrainPerformanceStats {
  readonly fps: number;
  readonly drawCalls: number;
  readonly meshes: number;
  readonly activeMeshes: number;
  readonly activeVertices: number;
  readonly totalVertices: number;
}

/**
 * Context passed to custom render policies when deciding whether to keep
 * the Babylon render loop alive.
 */
export interface TerrainDemoRenderPolicyContext {
  readonly buildStatus: TerrainBuildStatus;
  readonly camera: ArcRotateCamera;
  readonly scene: Scene;
}

/**
 * Optional tuning hooks for on-demand rendering in the demo.
 */
export interface TerrainDemoRenderPolicy {
  readonly forceReadyFrame?: boolean;
  readonly idleTimeoutMs?: number;
  readonly shouldRender?: (context: TerrainDemoRenderPolicyContext) => boolean;
}

/**
 * Additional options for demo creation that do not belong to terrain config.
 */
export interface TerrainDemoOptions {
  readonly renderPolicy?: TerrainDemoRenderPolicy;
}

/**
 * Shared render policy used by the browser demo when no overrides are provided.
 */
export const DEFAULT_DEMO_RENDER_POLICY: TerrainDemoRenderPolicy = {
  idleTimeoutMs: 250,
  forceReadyFrame: true
};

/**
 * Resolves an optional render policy to the demo default.
 */
export function resolveTerrainDemoRenderPolicy(
  renderPolicy?: TerrainDemoRenderPolicy
): TerrainDemoRenderPolicy {
  return renderPolicy ?? DEFAULT_DEMO_RENDER_POLICY;
}

/**
 * Creates the interactive Babylon-backed terrain demo and returns its control API.
 */
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
  camera.panningSensibility = 120;
  camera.attachControl(false, false, 1);
  const cameraPointerInput = camera.inputs.attached.pointers as ArcRotateCameraPointersInput | undefined;
  const defaultCameraPointerButtons = cameraPointerInput
    ? [...cameraPointerInput.buttons]
    : [0, 1, 2];

  const light = new HemisphericLight("terrain-light", new Vector3(0.4, 1, 0.2), scene);
  light.intensity = 0.95;
  const sceneInstrumentation = new SceneInstrumentation(scene);
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
        updateEditorPickability();
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
  terrainAdapter.setShowPoi(terrain.config.features.poi);
  terrainAdapter.setPoiMarkerMeshesVisible(true);
  terrainAdapter.setPoiLabelsVisible(true);
  terrainAdapter.setShowPoiFootprints(true);
  terrainAdapter.setShowRoads(terrain.config.features.roads);
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
  const terrainEditSession = new TerrainEditSession(terrain);
  let editorEnabled = false;
  let editorSettings: TerrainEditorSettings = {
    workflow: "sculpt",
    tool: "raise",
    selectionShape: "brush",
    selectionMode: "add",
    brush: { radius: 40, strength: 1, hardness: 0 }
  };
  let editorPointerActive = false;
  let editorInputLocked = false;
  let editorLastEditPoint: { x: number; z: number } | null = null;
  let editorNavigationButton: 1 | 2 | null = null;
  let editorNavigationPointerId: number | null = null;
  let editorNavigationX = 0;
  let editorNavigationY = 0;
  let editorRectangleStart: { x: number; z: number } | null = null;
  let editorRefreshPromise: Promise<void> = Promise.resolve();
  let lastDerivedEditorRevision = 0;
  const cursorPointCount = 65;
  let editorCursor: LinesMesh | null = null;
  let editorBrushRing: Mesh | null = null;
  let editorSelectionMesh: Mesh | null = null;
  let editorRectanglePreview: LinesMesh | null = null;
  let selectionVisualFrame: number | null = null;

  const updateEditorCursor = (point: { x: number; z: number } | null): void => {
    if (!editorEnabled || !point) {
      if (editorCursor) editorCursor.isVisible = false;
      if (editorBrushRing) editorBrushRing.isVisible = false;
      return;
    }
    const points = Array.from({ length: cursorPointCount }, (_, index) => {
      const angle = (index / (cursorPointCount - 1)) * Math.PI * 2;
      const x = point.x + Math.cos(angle) * editorSettings.brush.radius;
      const z = point.z + Math.sin(angle) * editorSettings.brush.radius;
      return new Vector3(x, terrainEditSession.sampleHeight({ x, z }) + 0.35, z);
    });
    editorCursor = MeshBuilder.CreateLines("terrain-editor-cursor", {
      points,
      updatable: true,
      instance: editorCursor ?? undefined
    }, scene);
    editorCursor.color = editorSettings.workflow === "select" && editorSettings.selectionMode === "subtract"
      ? new Color3(0.95, 0.36, 0.32)
      : new Color3(0.2, 0.82, 1);
    editorCursor.alpha = 0.95;
    editorCursor.isPickable = false;
    editorCursor.isVisible = true;
    if (!editorBrushRing) {
      editorBrushRing = MeshBuilder.CreateTorus("editor-brush-ring", {
        diameter: 2,
        thickness: 0.055,
        tessellation: 64
      }, scene);
      const material = new StandardMaterial("editor-brush-ring-material", scene);
      material.disableLighting = true;
      material.specularColor = Color3.Black();
      material.alpha = 0.92;
      material.disableDepthWrite = true;
      editorBrushRing.material = material;
      editorBrushRing.renderingGroupId = 2;
      editorBrushRing.isPickable = false;
    }
    const ringColor = editorSettings.workflow === "select" && editorSettings.selectionMode === "subtract"
      ? new Color3(1, 0.18, 0.12)
      : new Color3(0.08, 0.82, 1);
    const ringMaterial = editorBrushRing.material as StandardMaterial;
    ringMaterial.diffuseColor = ringColor;
    ringMaterial.emissiveColor = ringColor;
    editorBrushRing.position.set(
      point.x,
      terrainEditSession.sampleHeight(point) + 1.4,
      point.z
    );
    editorBrushRing.scaling.setAll(editorSettings.brush.radius);
    editorBrushRing.scaling.y = Math.max(1, editorSettings.brush.radius * 0.025);
    editorBrushRing.isVisible = true;
    renderController.markSceneMutated();
  };

  const updateSelectionVisual = (): void => {
    selectionVisualFrame = null;
    editorSelectionMesh?.dispose(false, true);
    editorSelectionMesh = null;
    if (!editorEnabled || editorSettings.workflow !== "select") return;
    const selection = terrainEditSession.getSelection();
    const resolution = terrain.packedSnapshot.analysisResolution;
    const step = terrain.packedSnapshot.analysisStep;
    const selectedCount = selection.reduce((count, value) => count + (value > 0 ? 1 : 0), 0);
    if (selectedCount === 0) return;
    const stride = Math.max(1, Math.ceil(Math.sqrt(selectedCount / 4000)));
    const positions: number[] = [];
    const indices: number[] = [];
    for (let z = 0; z < resolution; z += stride) {
      for (let x = 0; x < resolution; x += stride) {
        const index = z * resolution + x;
        if (selection[index] === 0) continue;
        const x0 = terrain.config.worldMin + x * step;
        const z0 = terrain.config.worldMin + z * step;
        const x1 = Math.min(terrain.config.worldMin + terrain.config.worldSize, x0 + step * stride);
        const z1 = Math.min(terrain.config.worldMin + terrain.config.worldSize, z0 + step * stride);
        const base = positions.length / 3;
        positions.push(
          x0, terrainEditSession.sampleHeight({ x: x0, z: z0 }) + 0.45, z0,
          x1, terrainEditSession.sampleHeight({ x: x1, z: z0 }) + 0.45, z0,
          x1, terrainEditSession.sampleHeight({ x: x1, z: z1 }) + 0.45, z1,
          x0, terrainEditSession.sampleHeight({ x: x0, z: z1 }) + 0.45, z1
        );
        indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
      }
    }
    if (positions.length > 0) {
      editorSelectionMesh = new Mesh("terrain-editor-selection", scene);
      const vertexData = new VertexData();
      vertexData.positions = positions;
      vertexData.indices = indices;
      vertexData.applyToMesh(editorSelectionMesh);
      const material = new StandardMaterial("terrain-editor-selection-material", scene);
      material.diffuseColor = new Color3(0.05, 0.55, 0.85);
      material.emissiveColor = new Color3(0.05, 0.45, 0.75);
      material.specularColor = Color3.Black();
      material.alpha = 0.42;
      material.backFaceCulling = false;
      material.disableDepthWrite = true;
      editorSelectionMesh.material = material;
      editorSelectionMesh.renderingGroupId = 1;
      editorSelectionMesh.isPickable = false;
    }
    renderController.markSceneMutated();
  };

  const updateRectanglePreview = (end: { x: number; z: number } | null): void => {
    if (!editorRectangleStart || !end) {
      if (editorRectanglePreview) editorRectanglePreview.isVisible = false;
      return;
    }
    const corners = [
      editorRectangleStart,
      { x: end.x, z: editorRectangleStart.z },
      end,
      { x: editorRectangleStart.x, z: end.z },
      editorRectangleStart
    ];
    const points = corners.map((point) => new Vector3(
      point.x,
      terrainEditSession.sampleHeight(point) + 0.7,
      point.z
    ));
    editorRectanglePreview = MeshBuilder.CreateLines("terrain-editor-rectangle-preview", {
      points,
      updatable: true,
      instance: editorRectanglePreview ?? undefined
    }, scene);
    editorRectanglePreview.color = editorSettings.selectionMode === "subtract"
      ? new Color3(0.95, 0.36, 0.32)
      : new Color3(0.2, 0.82, 1);
    editorRectanglePreview.alpha = 0.95;
    editorRectanglePreview.isPickable = false;
    editorRectanglePreview.isVisible = true;
  };

  terrainEditSession.subscribe(() => {
    if (selectionVisualFrame === null) {
      selectionVisualFrame = window.requestAnimationFrame(updateSelectionVisual);
    }
  });
  sceneInstrumentation.captureFrameTime = true;
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
    sceneInstrumentation.dispose();
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

  const isTerrainChunkMesh = (name: string): boolean => /^terrain-\d+-\d+-lod\d+$/.test(name);

  const pickTerrainPoint = (event: PointerEvent): { x: number; z: number } | null => {
    const bounds = canvas.getBoundingClientRect();
    const pointerX = event.clientX - bounds.left;
    const pointerY = event.clientY - bounds.top;
    const pick = scene.pick(pointerX, pointerY, (mesh) => isTerrainChunkMesh(mesh.name));
    if (pick?.hit && pick.pickedPoint) {
      return { x: pick.pickedPoint.x, z: pick.pickedPoint.z };
    }

    const ray = scene.createPickingRay(pointerX, pointerY, Matrix.Identity(), camera, false);
    const maxDistance = Math.max(camera.upperRadiusLimit ?? 2000, terrain.config.worldSize * 2);
    const step = Math.max(terrain.packedSnapshot.analysisStep, maxDistance / 320);
    let previousDistance = 0;
    let previousDelta: number | null = null;
    const worldMax = terrain.config.worldMin + terrain.config.worldSize;
    for (let distance = 0; distance <= maxDistance; distance += step) {
      const position = ray.origin.add(ray.direction.scale(distance));
      const inside = position.x >= terrain.config.worldMin && position.x <= worldMax &&
        position.z >= terrain.config.worldMin && position.z <= worldMax;
      if (!inside) {
        previousDelta = null;
        previousDistance = distance;
        continue;
      }
      const delta = position.y - terrainEditSession.sampleHeight({ x: position.x, z: position.z });
      if (previousDelta !== null && previousDelta >= 0 && delta <= 0) {
        let low = previousDistance;
        let high = distance;
        for (let iteration = 0; iteration < 10; iteration += 1) {
          const middle = (low + high) * 0.5;
          const sample = ray.origin.add(ray.direction.scale(middle));
          const sampleDelta = sample.y - terrainEditSession.sampleHeight({ x: sample.x, z: sample.z });
          if (sampleDelta > 0) low = middle;
          else high = middle;
        }
        const hit = ray.origin.add(ray.direction.scale((low + high) * 0.5));
        return { x: hit.x, z: hit.z };
      }
      previousDelta = delta;
      previousDistance = distance;
    }
    return null;
  };

  canvas.addEventListener("contextmenu", (event) => {
    if (editorEnabled) event.preventDefault();
  });

  const updateEditorPickability = (): void => {
    scene.meshes.forEach((mesh) => {
      if (isTerrainChunkMesh(mesh.name)) mesh.isPickable = editorEnabled;
    });
  };

  const applyEditedHeightsToMeshes = (bounds?: TerrainEditorBounds): void => {
    const affectedChunks = new Set<string>();
    if (bounds) {
      const toChunk = (value: number): number => Math.max(0, Math.min(
        terrain.config.chunksPerAxis - 1,
        Math.floor((value - terrain.config.worldMin) / terrain.config.chunkSize)
      ));
      const minChunkX = toChunk(bounds.minX);
      const maxChunkX = toChunk(bounds.maxX);
      const minChunkZ = toChunk(bounds.minZ);
      const maxChunkZ = toChunk(bounds.maxZ);
      for (let chunkZ = minChunkZ - 1; chunkZ <= maxChunkZ + 1; chunkZ += 1) {
        for (let chunkX = minChunkX - 1; chunkX <= maxChunkX + 1; chunkX += 1) {
          if (chunkX >= 0 && chunkZ >= 0 && chunkX < terrain.config.chunksPerAxis && chunkZ < terrain.config.chunksPerAxis) {
            affectedChunks.add(`${chunkX}:${chunkZ}`);
          }
        }
      }
    }
    scene.meshes.forEach((mesh) => {
      if (!isTerrainChunkMesh(mesh.name)) return;
      if (bounds) {
        const match = mesh.name.match(/^terrain-(\d+)-(\d+)-lod\d+$/);
        if (!match || !affectedChunks.has(`${match[1]}:${match[2]}`)) return;
      }
      const positions = mesh.getVerticesData(VertexBuffer.PositionKind);
      if (!positions) return;
      const lodMatch = mesh.name.match(/-lod(\d+)$/);
      const lod = Number(lodMatch?.[1] ?? 0);
      const resolution = terrain.config.lodResolutions[lod] ?? terrain.config.lodResolutions[0];
      const surfaceVertexCount = resolution * resolution;
      for (let vertex = 0; vertex < positions.length / 3; vertex += 1) {
        const offset = vertex * 3;
        const surfaceHeight = terrainEditSession.sampleHeight({ x: positions[offset], z: positions[offset + 2] });
        positions[offset + 1] = vertex < surfaceVertexCount
          ? surfaceHeight
          : surfaceHeight - terrain.config.skirtDepth;
      }
      const normals = mesh.getVerticesData(VertexBuffer.NormalKind) ?? new Array<number>(positions.length).fill(0);
      const normalSampleStep = terrain.config.chunkSize / (terrain.config.lodResolutions[0] - 1);
      const writeSurfaceNormal = (vertex: number): void => {
        const offset = vertex * 3;
        const x = positions[offset];
        const z = positions[offset + 2];
        const gradientX = (
          terrainEditSession.sampleHeight({ x: x + normalSampleStep, z }) -
          terrainEditSession.sampleHeight({ x: x - normalSampleStep, z })
        ) / (normalSampleStep * 2);
        const gradientZ = (
          terrainEditSession.sampleHeight({ x, z: z + normalSampleStep }) -
          terrainEditSession.sampleHeight({ x, z: z - normalSampleStep })
        ) / (normalSampleStep * 2);
        const length = Math.hypot(gradientX, 1, gradientZ);
        normals[offset] = -gradientX / length;
        normals[offset + 1] = 1 / length;
        normals[offset + 2] = -gradientZ / length;
      };
      for (let vertex = 0; vertex < surfaceVertexCount; vertex += 1) {
        writeSurfaceNormal(vertex);
      }

      const writeSkirtNormal = (
        skirtVertex: number,
        topVertex: number,
        outwardX: number,
        outwardZ: number
      ): void => {
        const skirtOffset = skirtVertex * 3;
        const topOffset = topVertex * 3;
        const nx = normals[topOffset] * 0.35 + outwardX * 0.65;
        const ny = normals[topOffset + 1] * 0.35 - 0.35 * 0.65;
        const nz = normals[topOffset + 2] * 0.35 + outwardZ * 0.65;
        const length = Math.hypot(nx, ny, nz);
        normals[skirtOffset] = nx / length;
        normals[skirtOffset + 1] = ny / length;
        normals[skirtOffset + 2] = nz / length;
      };
      const northStart = surfaceVertexCount;
      const southStart = northStart + resolution;
      const westStart = southStart + resolution;
      const eastStart = westStart + resolution;
      for (let sample = 0; sample < resolution; sample += 1) {
        writeSkirtNormal(northStart + sample, sample, 0, -1);
        writeSkirtNormal(southStart + sample, (resolution - 1) * resolution + sample, 0, 1);
        writeSkirtNormal(westStart + sample, sample * resolution, -1, 0);
        writeSkirtNormal(eastStart + sample, sample * resolution + resolution - 1, 1, 0);
      }
      mesh.updateVerticesData(VertexBuffer.PositionKind, positions, true, false);
      mesh.updateVerticesData(VertexBuffer.NormalKind, normals, true, false);
      mesh.refreshBoundingInfo(false, false);
    });
    renderController.markSceneMutated();
  };

  const boundsAroundStroke = (
    start: { x: number; z: number },
    end: { x: number; z: number },
    radius: number
  ): TerrainEditorBounds => ({
    minX: Math.min(start.x, end.x) - radius,
    maxX: Math.max(start.x, end.x) + radius,
    minZ: Math.min(start.z, end.z) - radius,
    maxZ: Math.max(start.z, end.z) + radius
  });

  const refreshEditedTerrainMaterial = (): void => {
    const terrainMaterials = new Set(
      scene.meshes
        .filter((mesh) => isTerrainChunkMesh(mesh.name))
        .map((mesh) => mesh.material)
        .filter((material) => material !== null)
    );
    terrainMaterials.forEach((material) => material.markDirty(true));
  };

  const finishEditorAction = (): void => {
    refreshEditedTerrainMaterial();
    editorInputLocked = true;
    window.requestAnimationFrame(() => {
      editorInputLocked = false;
    });
  };

  canvas.addEventListener("pointerdown", (event) => {
    if (!editorEnabled) return;
    if (event.button === 1 || event.button === 2) {
      event.preventDefault();
      event.stopImmediatePropagation();
      editorNavigationButton = event.button;
      editorNavigationPointerId = event.pointerId;
      editorNavigationX = event.clientX;
      editorNavigationY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
      canvas.style.cursor = event.button === 2 ? "grabbing" : "move";
      return;
    }
    if (event.button !== 0) return;
    if (editorInputLocked) {
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const point = pickTerrainPoint(event);
    if (!point) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    canvas.setPointerCapture(event.pointerId);
    editorPointerActive = true;
    updateEditorCursor(point);
    if (editorSettings.workflow === "sculpt") {
      terrainEditSession.beginStroke(editorSettings.tool, point, editorSettings.brush);
      editorLastEditPoint = point;
      applyEditedHeightsToMeshes(boundsAroundStroke(point, point, editorSettings.brush.radius));
    } else if (editorSettings.selectionShape === "rectangle") {
      editorRectangleStart = point;
    } else {
      terrainEditSession.paintSelection(point, editorSettings.brush.radius, editorSettings.brush.hardness, editorSettings.selectionMode);
    }
  }, true);

  canvas.addEventListener("pointermove", (event) => {
    if (!editorEnabled) return;
    if (editorNavigationButton !== null && event.pointerId === editorNavigationPointerId) {
      event.preventDefault();
      event.stopImmediatePropagation();
      const dx = event.clientX - editorNavigationX;
      const dy = event.clientY - editorNavigationY;
      editorNavigationX = event.clientX;
      editorNavigationY = event.clientY;
      if (editorNavigationButton === 2) {
        camera.alpha -= dx * 0.005;
        camera.beta = Math.max(0.05, Math.min(Math.PI - 0.05, camera.beta - dy * 0.005));
      } else {
        const scale = camera.radius * 0.0018;
        const screenRight = new Vector3(-Math.sin(camera.alpha), 0, Math.cos(camera.alpha));
        const screenForward = new Vector3(-Math.cos(camera.alpha), 0, -Math.sin(camera.alpha));
        camera.target.addInPlace(screenRight.scale(-dx * scale));
        camera.target.addInPlace(screenForward.scale(dy * scale));
      }
      renderController.markSceneMutated();
      return;
    }
    const point = pickTerrainPoint(event);
    updateEditorCursor(point);
    if (editorSettings.workflow === "select" && editorSettings.selectionShape === "rectangle") {
      updateRectanglePreview(point);
    }
    if (!editorPointerActive) return;
    if (!point) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (editorSettings.workflow === "sculpt") {
      terrainEditSession.appendStroke(point);
      applyEditedHeightsToMeshes(boundsAroundStroke(
        editorLastEditPoint ?? point,
        point,
        editorSettings.brush.radius
      ));
      editorLastEditPoint = point;
    } else if (editorSettings.selectionShape === "brush") {
      terrainEditSession.paintSelection(point, editorSettings.brush.radius, editorSettings.brush.hardness, editorSettings.selectionMode);
    }
  }, true);

  canvas.addEventListener("pointerup", (event) => {
    if (editorEnabled && editorNavigationButton !== null && event.pointerId === editorNavigationPointerId) {
      event.preventDefault();
      event.stopImmediatePropagation();
      editorNavigationButton = null;
      editorNavigationPointerId = null;
      canvas.style.cursor = "crosshair";
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      return;
    }
    if (!editorEnabled || !editorPointerActive || event.button !== 0) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const point = pickTerrainPoint(event);
    if (editorSettings.workflow === "sculpt") {
      if (terrainEditSession.commitStroke()) finishEditorAction();
    } else if (editorSettings.selectionShape === "rectangle" && editorRectangleStart && point) {
      terrainEditSession.selectRectangle(editorRectangleStart, point, editorSettings.selectionMode);
    }
    editorRectangleStart = null;
    editorLastEditPoint = null;
    updateRectanglePreview(null);
    editorPointerActive = false;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }, true);

  canvas.addEventListener("pointercancel", () => {
    editorNavigationButton = null;
    editorNavigationPointerId = null;
    if (editorEnabled) canvas.style.cursor = "crosshair";
    if (!editorPointerActive) return;
    if (editorSettings.workflow === "sculpt") {
      terrainEditSession.cancelStroke();
      applyEditedHeightsToMeshes();
    }
    editorRectangleStart = null;
    editorLastEditPoint = null;
    updateRectanglePreview(null);
    editorPointerActive = false;
  }, true);

  const replaceTerrainSystem = async (
    nextConfigOverrides: BuiltTerrainConfigOverrides,
    nextTextureOptions: BabylonTerrainTextureOptions
  ): Promise<void> => {
    const renderSuspendToken = renderController.suspendRendering();
    const rebuildStartedAt = performance.now();
    try {
      const wireframe = terrainAdapter.getWireframe();
      const texturesEnabled = terrainAdapter.getTexturesEnabled();
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
      terrainEditSession.replaceTerrain(nextTerrain);
      lastDerivedEditorRevision = terrainEditSession.getState().revision;
      terrainAdapter = createTerrainAdapter(
        terrain,
        nextTextureOptions,
        nextBuildVersion
      );
      terrainAdapter.initialize();
      trackAdapterActivity(terrainAdapter, nextBuildVersion);
      terrainAdapter.setWireframe(wireframe);
      terrainAdapter.setTexturesEnabled(texturesEnabled);
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

  const importTerrainAsset = async (nextTerrain: BuiltTerrain, preserveEditSession = false): Promise<void> => {
    const renderSuspendToken = renderController.suspendRendering();
    try {
      const wireframe = terrainAdapter.getWireframe();
      const texturesEnabled = terrainAdapter.getTexturesEnabled();
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
      const textureOptions = terrainAdapter.getTextureOptions();
      const nextBuildVersion = ++buildVersion;

      setBuildStatus({
        phase: "world",
        message: "Importing terrain asset",
        completed: 0,
        total: 1
      });

      terrainAdapter.dispose();
      frameCameraToWorld(camera, nextTerrain.config);
      terrain = nextTerrain;
      if (preserveEditSession) terrainEditSession.acceptDerivedTerrain(nextTerrain);
      else {
        terrainEditSession.replaceTerrain(nextTerrain);
        lastDerivedEditorRevision = terrainEditSession.getState().revision;
      }
      terrainAdapter = createTerrainAdapter(
        terrain,
        textureOptions,
        nextBuildVersion
      );
      terrainAdapter.initialize();
      trackAdapterActivity(terrainAdapter, nextBuildVersion);
      terrainAdapter.setWireframe(wireframe);
      terrainAdapter.setTexturesEnabled(texturesEnabled);
      terrainAdapter.setCollisionRadius(collisionRadius);
      terrainAdapter.setFoliageRadius(foliageRadius);
      terrainAdapter.setShowFoliage(showFoliage);
      terrainAdapter.setShowPoi(showPoi);
      terrainAdapter.setPoiMarkerMeshesVisible(poiMarkerMeshesVisible);
      terrainAdapter.setPoiLabelsVisible(poiLabelsVisible);
      terrainAdapter.setShowPoiFootprints(showPoiFootprints);
      terrainAdapter.setPoiDebugConfig(poiDebugConfig);
      terrainAdapter.setShowRoads(showRoads);
      terrainAdapter.setLodDistances(lodDistances);
      terrainAdapter.setWaterLevel(waterLevel);
      terrainAdapter.setTerrainMaterialConfig(terrainMaterialConfig);
      terrainAdapter.setWaterConfig(waterConfig);
      terrainAdapter.setDebugViewMode(debugViewMode);
      terrainAdapter.update(camera.position);
      updateEditorPickability();
      await Promise.all([
        terrainAdapter.whenChunkMeshesReady(),
        terrainAdapter.whenFoliageReady()
      ]);
      if (nextBuildVersion !== buildVersion) {
        return;
      }
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

  const refreshEditedTerrain = async (): Promise<void> => {
    const revision = terrainEditSession.getState().revision;
    const editedTerrain = terrainEditSession.getTerrain();
    const refreshVersion = ++buildVersion;
    setBuildStatus({ phase: "world", message: "Refreshing edited terrain", completed: 0, total: 1 });
    const refreshed = await buildCoordinator.rebuildEditedTerrain(editedTerrain, refreshVersion);
    if (revision !== terrainEditSession.getState().revision || refreshVersion !== buildVersion) return;
    await importTerrainAsset(refreshed, true);
    lastDerivedEditorRevision = revision;
  };

  const flushTerrainEdits = async (): Promise<void> => {
    applyEditedHeightsToMeshes();
    if (terrainEditSession.getState().revision !== lastDerivedEditorRevision) {
      editorRefreshPromise = refreshEditedTerrain();
    }
    await editorRefreshPromise;
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
    getTerrainAsset: () => terrainEditSession.getTerrain(),
    getTerrainEditSession: () => terrainEditSession,
    setEditorEnabled: (enabled: boolean) => {
      if (!enabled && editorPointerActive) {
        terrainEditSession.cancelStroke();
        editorPointerActive = false;
        editorRectangleStart = null;
        editorLastEditPoint = null;
        updateRectanglePreview(null);
        applyEditedHeightsToMeshes();
      }
      editorEnabled = enabled;
      canvas.style.cursor = enabled ? "crosshair" : "";
      if (cameraPointerInput) {
        cameraPointerInput.buttons = enabled
          ? []
          : [...defaultCameraPointerButtons];
      }
      updateEditorPickability();
      if (!enabled) updateEditorCursor(null);
      updateSelectionVisual();
      renderController.markSceneMutated();
    },
    getEditorEnabled: () => editorEnabled,
    applyTerrainEditChanges: () => {
      applyEditedHeightsToMeshes();
      refreshEditedTerrainMaterial();
      renderController.markSceneMutated();
    },
    getEditorDerivedDirty: () =>
      terrainEditSession.getState().revision !== lastDerivedEditorRevision,
    setEditorSettings: (settings: TerrainEditorSettings) => {
      editorSettings = settings;
      updateSelectionVisual();
      renderController.markSceneMutated();
    },
    getEditorSettings: () => editorSettings,
    flushTerrainEdits,
    importTerrainAsset: (nextTerrain) => importTerrainAsset(nextTerrain, false),
    beginRendering: () => renderController.beginRendering(),
    stopRendering: () => renderController.stopRendering(),
    suspendRendering: () => renderController.suspendRendering(),
    markSceneMutated: () => renderController.markSceneMutated(),
    setWireframe: mutateScene((enabled: boolean) => terrainAdapter.setWireframe(enabled)),
    setTexturesEnabled: mutateScene((enabled: boolean) => terrainAdapter.setTexturesEnabled(enabled)),
    getTexturesEnabled: () => terrainAdapter.getTexturesEnabled(),
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
    setForceLod0: mutateScene((enabled: boolean) => terrainAdapter.setForceLod0(enabled)),
    getForceLod0: () => terrainAdapter.getForceLod0(),
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
    getPerformanceStats: () => {
      const activeMeshes = scene.getActiveMeshes();
      let activeVertices = 0;
      for (let index = 0; index < activeMeshes.length; index += 1) {
        activeVertices += activeMeshes.data[index]?.getTotalVertices() ?? 0;
      }

      return {
        fps: engine.getFps(),
        drawCalls: sceneInstrumentation.drawCallsCounter.current,
        meshes: scene.meshes.length,
        activeMeshes: activeMeshes.length,
        activeVertices,
        totalVertices: scene.getTotalVertices()
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
