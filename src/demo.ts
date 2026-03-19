import type {
  BuiltTerrainConfigOverrides as TerrainConfigOverrides,
  BuiltTerrainErosionConfig as TerrainErosionConfig,
  BuiltTerrainFeatureConfig as TerrainFeatureConfig,
  BuiltTerrainPoiConfig as TerrainPoiConfig,
  BuiltTerrainRiverConfig as TerrainRiverConfig,
  BuiltTerrainShapeConfig as TerrainShapeConfig
} from "./builder";
import type { TerrainMineResource, TerrainPoiKind } from "./terrain/TerrainPoiPlanner";
import type {
  BabylonTerrainPoiDebugConfig as TerrainPoiDebugConfig,
  BabylonTerrainPoiMeshStats as TerrainPoiMeshStats,
  BabylonTerrainPoiStats as TerrainPoiStats
} from "./adapters/babylon";
import type { BabylonTerrainWaterConfig as TerrainWaterConfig } from "./adapters/babylon";
import {
  BabylonTerrainDebugViewMode as TerrainDebugViewMode,
  BabylonTerrainLayerThresholds as TerrainLayerThresholds
} from "./adapters/babylon";
import { createTerrainDemo } from "./demo/createTerrainDemo";

interface TerrainPreset {
  readonly name: string;
  readonly config: TerrainConfigOverrides;
  readonly featureState?: PresetFeatureState;
}

interface PresetFeatureState {
  readonly poiDebug: TerrainPoiDebugConfig;
  readonly hidePoiMarkerMeshes: boolean;
  readonly hidePoiLabels: boolean;
  readonly showPoiFootprints: boolean;
}

export interface LegacyFeaturePanelState {
  readonly features: TerrainFeatureConfig;
  readonly hidePoiMarkerMeshes: boolean;
  readonly hidePoiLabels: boolean;
  readonly showPoiFootprints: boolean;
  readonly poiDebug: TerrainPoiDebugConfig;
  readonly poiStats: TerrainPoiStats;
  readonly poiMeshStats: TerrainPoiMeshStats;
}

export interface LegacyRuntimeTabState {
  readonly waterLevel: number;
  readonly water: TerrainWaterConfig;
  readonly buildFoliage: boolean;
  readonly showFoliage: boolean;
  readonly collisionRadius: number;
  readonly foliageRadius: number;
  readonly lodDistances: readonly [number, number, number];
  readonly debugViewMode: TerrainDebugViewMode;
}

export interface LegacyMaterialTabState {
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

export interface LegacyWorldTabState {
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

const BUILTIN_PRESETS: readonly TerrainPreset[] = [
  {
    name: "Default",
    config: {},
  },
  {
    name: "Large Mountain World",
    config: {
      waterLevel: -8,
      baseHeight: -22,
      maxHeight: 292,
      chunksPerAxis: 10,
      chunkSize: 160,
      shape: {
        continentAmplitude: 92,
        radialFalloffStrength: 0.42,
        mountainAmplitude: 176,
        mountainFrequency: 0.0105,
        hillAmplitude: 44,
        detailAmplitude: 10,
      },
      erosion: {
        enabled: true,
        resolution: 257,
        iterations: 14,
        talusHeight: 1.45,
        smoothing: 0.12,
      },
    },
  },
  {
    name: "Wet Riverlands",
    config: {
      waterLevel: 6,
      baseHeight: -28,
      maxHeight: 196,
      shape: {
        continentAmplitude: 62,
        radialFalloffStrength: 0.88,
        mountainAmplitude: 92,
        hillAmplitude: 34,
        detailAmplitude: 6,
      },
      rivers: {
        enabled: true,
        resolution: 257,
        flowThreshold: 0.64,
        bankStrength: 0.74,
        lakeThreshold: 2.5,
        depth: 1.8,
        maxDepth: 5.5,
        minSlope: 0.01,
        minElevation: 4,
      },
    },
  },
  {
    name: "Sparse Settlements",
    config: {
      poi: {
        density: 0.58,
        spacing: 1.35,
      },
      features: {
        poi: true,
        roads: false,
      },
    },
    featureState: {
      poiDebug: {
        showScores: false,
        showRadii: false,
        showTags: false,
        kinds: {
          village: true,
          outpost: true,
          mine: true,
        },
        mineResources: {
          coal: true,
          iron: true,
          copper: true,
        },
      },
      hidePoiMarkerMeshes: false,
      hidePoiLabels: false,
      showPoiFootprints: true,
    },
  },
] as const;

const SAVED_PRESETS_KEY = "terrar.saved-presets";
export const LEGACY_HUD_EVENT = "terrar:legacy-hud-update";
export const LEGACY_FEATURE_STATUS_EVENT = "terrar:legacy-feature-status-update";
export const LEGACY_FEATURE_PANEL_EVENT = "terrar:legacy-feature-panel-update";
export const LEGACY_RUNTIME_TAB_EVENT = "terrar:legacy-runtime-tab-update";
export const LEGACY_MATERIAL_TAB_EVENT = "terrar:legacy-material-tab-update";
export const LEGACY_WORLD_TAB_EVENT = "terrar:legacy-world-tab-update";
export const LEGACY_LEFT_PANEL_EVENT = "terrar:legacy-left-panel-update";
export const LEGACY_PRESETS_EVENT = "terrar:legacy-presets-update";

const mount = document.getElementById("app");

if (!mount) {
  throw new Error("Missing #app mount element.");
}

const canvas = document.createElement("canvas");
canvas.id = "terrain-canvas";
mount.appendChild(canvas);

export const demo = createTerrainDemo(canvas);
let buildStatus = demo.getBuildStatus();

const panel = document.createElement("div");
panel.style.position = "fixed";
panel.style.top = "72px";
panel.style.left = "16px";
panel.style.width = "320px";
panel.style.maxHeight = "calc(100vh - 88px)";
panel.style.overflowY = "auto";
panel.style.overflowX = "hidden";
panel.style.padding = "12px";
panel.style.border = "1px solid rgba(255, 255, 255, 0.18)";
panel.style.borderRadius = "12px";
panel.style.background = "rgba(6, 10, 15, 0.78)";
panel.style.color = "#f4edc9";
panel.style.font = "12px/1.45 Consolas, 'Courier New', monospace";
panel.style.zIndex = "10";
panel.style.userSelect = "none";
panel.style.backdropFilter = "blur(8px)";
panel.style.boxSizing = "border-box";
document.body.appendChild(panel);

const featurePanel = document.createElement("div");
featurePanel.style.position = "fixed";
featurePanel.style.top = "72px";
featurePanel.style.right = "16px";
featurePanel.style.width = "280px";
featurePanel.style.maxHeight = "calc(100vh - 88px)";
featurePanel.style.overflowY = "auto";
featurePanel.style.overflowX = "hidden";
featurePanel.style.padding = "12px";
featurePanel.style.border = "1px solid rgba(255, 255, 255, 0.18)";
featurePanel.style.borderRadius = "12px";
featurePanel.style.background = "rgba(6, 10, 15, 0.78)";
featurePanel.style.color = "#f4edc9";
featurePanel.style.font = "12px/1.45 Consolas, 'Courier New', monospace";
featurePanel.style.zIndex = "10";
featurePanel.style.userSelect = "none";
featurePanel.style.backdropFilter = "blur(8px)";
featurePanel.style.boxSizing = "border-box";
document.body.appendChild(featurePanel);

let wireframe = false;
let debugVisible = false;
let loadingDebug = false;
let draftConfig = buildDraftConfig();
let presetOptions = getPresetOptions();
let activeTab: PanelTab = "runtime";

export function getLegacyHudText(): string {
  const debugState = loadingDebug ? "loading" : debugVisible ? "on" : "off";
  const foliage = demo.getFoliageStats();
  const poi = demo.getPoiStats();
  const roads = demo.getRoadStats();
  const workerStatus = demo.getWorkerStatus();
  const workerText = workerStatus.sharedSnapshotsEnabled
    ? "sab:on"
    : workerStatus.workersEnabled
      ? "sab:off"
      : "workers:off";
  const buildText = buildStatus.phase === "idle" ? "" : ` | build: ${buildStatus.message}`;
  return (
    `G debug: ${debugState} | V wireframe: ${wireframe ? "on" : "off"} | ` +
    `foliage: ${foliage.visibleInstances}/${foliage.totalInstances} ` +
    `(T ${foliage.visibleTrees}/${foliage.totalTrees}, ` +
    `B ${foliage.visibleBushes}/${foliage.totalBushes}, ` +
    `R ${foliage.visibleRocks}/${foliage.totalRocks}) | ` +
    `poi: ${poi.total} | roads: ${roads.totalRoads} | ${workerText}${buildText}`
  );
}

export function getFeatureBuildStatusText(): string {
  const summary = draftConfig.features.poi
    ? draftConfig.features.roads
      ? "POI and roads will rebuild into the world."
      : "POI will load on rebuild. Roads remain disabled."
    : "POI and roads are excluded by default.";
  const workerStatus = demo.getWorkerStatus();
  const workerLine = workerStatus.workersEnabled
    ? workerStatus.sharedSnapshotsEnabled
      ? "Workers active. Shared snapshots enabled."
      : "Workers active. Shared snapshots unavailable."
    : "Workers unavailable. Main-thread fallback only.";
  const workerDetail =
    `crossOriginIsolated: ${workerStatus.crossOriginIsolated}\n` +
    `SharedArrayBuffer: ${workerStatus.sharedArrayBufferDefined}\n` +
    `Snapshot Mode: ${workerStatus.snapshotMode}\n` +
    `Live Terrain Systems: ${workerStatus.liveTerrainSystems}\n` +
    `Chunks: ${workerStatus.chunkCount}\n` +
    `Loaded Chunk Meshes: ${workerStatus.loadedChunkMeshes}\n` +
    `Mesh Apply: ${workerStatus.applyingChunkMeshes ? "active" : "idle"}\n` +
    `Pending Chunk Meshes: ${workerStatus.pendingChunkMeshes}`;
  const buildProfile = demo.getBuildProfile();
  const profileDetail =
    `\nWorld Build: ${formatDuration(buildProfile.lastWorldBuildMs)}\n` +
    `Terrain Swap: ${formatDuration(buildProfile.lastTerrainSwapMs)}\n` +
    `Chunk Workers: ${formatDuration(buildProfile.lastChunkWorkerBuildMs)}\n` +
    `Mesh Apply: ${formatDuration(buildProfile.lastMeshApplyMs)}\n` +
    `Total Rebuild: ${formatDuration(buildProfile.lastTotalRebuildMs)}`;
  const progress = buildStatus.phase === "idle" ? "" : `\n${buildStatus.message}`;
  return `${summary}\n${workerLine}\n${workerDetail}${profileDetail}${progress}`;
}

export function getPresetOptionsData(): TerrainPreset[] {
  return presetOptions.map(clonePreset);
}

export function getFeaturePanelState(): LegacyFeaturePanelState {
  return {
    features: { ...draftConfig.features },
    hidePoiMarkerMeshes: draftConfig.hidePoiMarkerMeshes,
    hidePoiLabels: draftConfig.hidePoiLabels,
    showPoiFootprints: draftConfig.showPoiFootprints,
    poiDebug: clonePoiDebugConfig(draftConfig.poiDebug),
    poiStats: demo.getPoiStats(),
    poiMeshStats: demo.getPoiMeshStats()
  };
}

export function getRuntimeTabState(): LegacyRuntimeTabState {
  return {
    waterLevel: draftConfig.waterLevel,
    water: { ...draftConfig.water },
    buildFoliage: draftConfig.buildFoliage,
    showFoliage: draftConfig.showFoliage,
    collisionRadius: draftConfig.collisionRadius,
    foliageRadius: draftConfig.foliageRadius,
    lodDistances: [...draftConfig.lodDistances] as [number, number, number],
    debugViewMode: demo.getDebugViewMode()
  };
}

export function getMaterialTabState(): LegacyMaterialTabState {
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
    maxHeight: draftConfig.maxHeight
  };
}

export function getWorldTabState(): LegacyWorldTabState {
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
    shape: { ...draftConfig.shape }
  };
}

export function getActivePanelTab(): PanelTab {
  return activeTab;
}

export function setFeaturePanelState(state: LegacyFeaturePanelState): void {
  draftConfig.features = { ...state.features };
  if (!draftConfig.features.poi) {
    draftConfig.features.roads = false;
  }
  draftConfig.hidePoiMarkerMeshes = state.hidePoiMarkerMeshes;
  draftConfig.hidePoiLabels = state.hidePoiLabels;
  draftConfig.showPoiFootprints = state.showPoiFootprints;
  draftConfig.poiDebug = clonePoiDebugConfig(state.poiDebug);

  demo.setPoiMarkerMeshesVisible(!draftConfig.hidePoiMarkerMeshes);
  demo.setPoiLabelsVisible(!draftConfig.hidePoiLabels);
  demo.setShowPoiFootprints(draftConfig.showPoiFootprints);
  demo.setPoiDebugConfig(draftConfig.poiDebug);

  renderFeaturePanel();
  renderFeatureStatus();
  renderHud();
}

export function setRuntimeTabState(state: LegacyRuntimeTabState): void {
  draftConfig.waterLevel = state.waterLevel;
  draftConfig.water = { ...state.water };
  draftConfig.buildFoliage = state.buildFoliage;
  draftConfig.showFoliage = state.buildFoliage ? state.showFoliage : false;
  draftConfig.collisionRadius = state.collisionRadius;
  draftConfig.foliageRadius = state.foliageRadius;

  const nextLodDistances = [...state.lodDistances] as [number, number, number];
  nextLodDistances[1] = Math.max(nextLodDistances[1], nextLodDistances[0] + 10);
  nextLodDistances[2] = Math.max(nextLodDistances[2], nextLodDistances[1] + 10);
  draftConfig.lodDistances = nextLodDistances;

  demo.setWaterLevel(draftConfig.waterLevel);
  applyDraftWaterConfig();
  demo.setCollisionRadius(draftConfig.collisionRadius);
  demo.setFoliageRadius(draftConfig.foliageRadius);
  demo.setShowFoliage(draftConfig.showFoliage);
  demo.setLodDistances(draftConfig.lodDistances);
  demo.setDebugViewMode(state.debugViewMode);

  renderPanel();
  renderHud();
}

export function setMaterialTabState(state: LegacyMaterialTabState): void {
  draftConfig.useGeneratedTextures = state.useGeneratedTextures;
  draftConfig.materialThresholds = { ...state.materialThresholds };
  draftConfig.materialScales = { ...state.materialScales };
  draftConfig.blendSharpness = state.blendSharpness;
  draftConfig.shorelineStartOffset = Math.min(state.shorelineStartOffset, state.shorelineEndOffset - 0.5);
  draftConfig.shorelineEndOffset = Math.max(state.shorelineEndOffset, draftConfig.shorelineStartOffset + 0.5);
  draftConfig.sedimentStrength = state.sedimentStrength;
  draftConfig.sedimentSandBias = state.sedimentSandBias;
  draftConfig.smallRiverTintStrength = state.smallRiverTintStrength;
  draftConfig.smallRiverTintBrightness = state.smallRiverTintBrightness;
  draftConfig.smallRiverTintSaturation = state.smallRiverTintSaturation;

  draftConfig.materialThresholds.rockSlopeStart = Math.min(
    draftConfig.materialThresholds.rockSlopeStart,
    draftConfig.materialThresholds.rockSlopeFull - 0.02,
  );
  draftConfig.materialThresholds.rockSlopeFull = Math.max(
    draftConfig.materialThresholds.rockSlopeFull,
    draftConfig.materialThresholds.rockSlopeStart + 0.02,
  );
  draftConfig.materialThresholds.snowStartHeight = Math.min(
    draftConfig.materialThresholds.snowStartHeight,
    draftConfig.materialThresholds.snowFullHeight - 1,
  );
  draftConfig.materialThresholds.snowFullHeight = Math.max(
    draftConfig.materialThresholds.snowFullHeight,
    draftConfig.materialThresholds.snowStartHeight + 1,
  );
  draftConfig.materialThresholds.dirtLowHeight = Math.min(
    draftConfig.materialThresholds.dirtLowHeight,
    draftConfig.materialThresholds.dirtHighHeight - 1,
  );
  draftConfig.materialThresholds.dirtHighHeight = Math.max(
    draftConfig.materialThresholds.dirtHighHeight,
    draftConfig.materialThresholds.dirtLowHeight + 1,
  );

  runAsyncTask(demo.setUseGeneratedTextures(draftConfig.useGeneratedTextures));
  demo.setTerrainMaterialThresholds(draftConfig.materialThresholds);
  applyDraftMaterialConfig();
  renderPanel();
}

export function setWorldTabState(state: LegacyWorldTabState): void {
  draftConfig.seed = state.seed.trim() === "" ? "1337" : state.seed;
  draftConfig.chunksPerAxis = state.chunksPerAxis;
  draftConfig.chunkSize = state.chunkSize;
  syncDraftWorldBounds();
  draftConfig.baseHeight = state.baseHeight;
  draftConfig.maxHeight = Math.max(state.maxHeight, draftConfig.baseHeight + 40);
  draftConfig.shape = { ...state.shape };
  draftConfig.erosion = {
    ...state.erosion,
    resolution: clampErosionResolution(state.erosion.resolution)
  };
  draftConfig.rivers = {
    ...state.rivers,
    resolution: clampErosionResolution(state.rivers.resolution),
    depth: Math.min(state.rivers.depth, state.rivers.maxDepth),
    maxDepth: Math.max(state.rivers.maxDepth, state.rivers.depth)
  };
  draftConfig.poi = { ...state.poi };
}

export function retuneWorldTabForWorldSize(): void {
  retuneDraftForWorldSize();
  demo.setCollisionRadius(draftConfig.collisionRadius);
  demo.setFoliageRadius(draftConfig.foliageRadius);
  demo.setLodDistances(draftConfig.lodDistances);
  demo.setWaterConfig(draftConfig.water);
  renderPanel();
  renderHud();
}

export function setActivePanelTab(tab: PanelTab): void {
  activeTab = tab;
  renderPanel();
}

export async function applyPresetByIndex(index: number): Promise<void> {
  const preset = presetOptions[index];
  if (!preset) {
    return;
  }

  draftConfig = mergeDraftWithOverrides(buildDraftConfig(), preset.config);
  if (preset.featureState) {
    draftConfig.poiDebug = clonePoiDebugConfig(preset.featureState.poiDebug);
    draftConfig.hidePoiMarkerMeshes = preset.featureState.hidePoiMarkerMeshes;
    draftConfig.hidePoiLabels = preset.featureState.hidePoiLabels;
    draftConfig.showPoiFootprints = preset.featureState.showPoiFootprints;
  }

  renderPresetOptions();
  renderPanel();
  renderFeaturePanel();
  renderHud();
  renderFeatureStatus();
}

export function saveCurrentPreset(name: string): void {
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error("Preset name is required.");
  }

  const savedPresets = mergeImportedPresets(getSavedPresets(), [buildPresetFromDraft(trimmedName)]);
  savePresets(savedPresets);
  presetOptions = getPresetOptions();
  renderPresetOptions();
  renderPanel();
  renderFeaturePanel();
}

export function exportPresetByIndex(index: number): void {
  const preset = presetOptions[index];
  if (!preset) {
    throw new Error("Preset not found.");
  }

  downloadJsonFile(`${slugifyPresetName(preset.name)}.json`, clonePreset(preset));
}

export function importPresetText(serialized: string): void {
  const imported = parseImportedPresets(serialized);
  const savedPresets = mergeImportedPresets(getSavedPresets(), imported);
  savePresets(savedPresets);
  presetOptions = getPresetOptions();
  renderPresetOptions();
  renderPanel();
  renderFeaturePanel();
}

export async function rebuildTerrainFromDraft(): Promise<void> {
  await applyDraftToWorld();
}

export function resetDraftTerrainConfig(): void {
  draftConfig = buildDraftConfig();
  renderPanel();
  renderFeaturePanel();
  renderHud();
  renderFeatureStatus();
}

function renderHud(): void {
  window.dispatchEvent(
    new CustomEvent<string>(LEGACY_HUD_EVENT, {
      detail: getLegacyHudText()
    })
  );
}

function renderFeatureStatus(): void {
  window.dispatchEvent(
    new CustomEvent<string>(LEGACY_FEATURE_STATUS_EVENT, {
      detail: getFeatureBuildStatusText()
    })
  );
}

function renderFeaturePanelState(): void {
  window.dispatchEvent(
    new CustomEvent<LegacyFeaturePanelState>(LEGACY_FEATURE_PANEL_EVENT, {
      detail: getFeaturePanelState()
    })
  );
}

function renderRuntimeTabState(): void {
  window.dispatchEvent(
    new CustomEvent<LegacyRuntimeTabState>(LEGACY_RUNTIME_TAB_EVENT, {
      detail: getRuntimeTabState()
    })
  );
}

function renderMaterialTabState(): void {
  window.dispatchEvent(
    new CustomEvent<LegacyMaterialTabState>(LEGACY_MATERIAL_TAB_EVENT, {
      detail: getMaterialTabState()
    })
  );
}

function renderWorldTabState(): void {
  window.dispatchEvent(
    new CustomEvent<LegacyWorldTabState>(LEGACY_WORLD_TAB_EVENT, {
      detail: getWorldTabState()
    })
  );
}

function renderLeftPanelState(): void {
  window.dispatchEvent(
    new CustomEvent<PanelTab>(LEGACY_LEFT_PANEL_EVENT, {
      detail: getActivePanelTab()
    })
  );
}

function renderPresetOptions(): void {
  window.dispatchEvent(
    new CustomEvent<TerrainPreset[]>(LEGACY_PRESETS_EVENT, {
      detail: getPresetOptionsData()
    })
  );
}

renderHud();
renderFeatureStatus();
renderFeaturePanelState();
renderRuntimeTabState();
renderMaterialTabState();
renderWorldTabState();
renderLeftPanelState();
renderPresetOptions();
renderPanel();
renderFeaturePanel();
window.setInterval(() => {
  renderHud();
  updateFeatureBuildStatus();
}, 250);
demo.subscribeBuildStatus((status) => {
  buildStatus = status;
  renderHud();
  updateFeatureBuildStatus();
  renderFeaturePanelState();
  renderRuntimeTabState();
  renderMaterialTabState();
  renderWorldTabState();
});

window.addEventListener("keydown", async (event) => {
  if (event.repeat) {
    return;
  }

  if (event.key.toLowerCase() === "g") {
    if (loadingDebug) {
      return;
    }

    loadingDebug = true;
    renderHud();
    debugVisible = await demo.toggleDebugOverlay();
    loadingDebug = false;
    renderHud();
  }

  if (event.key.toLowerCase() === "v") {
    wireframe = !wireframe;
    demo.setWireframe(wireframe);
    renderHud();
  }
});

function renderPanel(): void {
  panel.replaceChildren();
  panel.appendChild(createLeftPanelMount());
  renderRuntimeTabState();
  renderMaterialTabState();
  renderWorldTabState();
  renderLeftPanelState();
  renderFeaturePanel();
}

function renderFeaturePanel(): void {
  featurePanel.replaceChildren();
  featurePanel.appendChild(createFeaturePanelMount());
  renderFeaturePanelState();
}

function renderRuntimeTab(): void {
  panel.appendChild(createRuntimeTabMount());
}

function renderMaterialTab(): void {
  panel.appendChild(createMaterialTabMount());
}

function renderWorldTab(): void {
  panel.appendChild(createWorldTabMount());
}

function renderPresetsTab(): void {
  panel.appendChild(createPresetsTabMount());
}

function createTabBar(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gridTemplateColumns = "repeat(4, 1fr)";
  wrap.style.gap = "6px";
  wrap.style.marginTop = "10px";
  wrap.style.width = "100%";
  wrap.style.boxSizing = "border-box";

  const tabs: readonly [PanelTab, string][] = [
    ["runtime", "Runtime"],
    ["material", "Material"],
    ["world", "World"],
    ["presets", "Presets"],
  ];

  tabs.forEach(([tab, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.style.padding = "7px 6px";
    button.style.borderRadius = "8px";
    button.style.border = "1px solid rgba(255,255,255,0.16)";
    button.style.background = activeTab === tab ? "rgba(56, 93, 123, 0.95)" : "rgba(18, 29, 39, 0.95)";
    button.style.color = "#f4edc9";
    button.style.cursor = "pointer";
    button.style.minWidth = "0";
    button.style.maxWidth = "100%";
    button.style.whiteSpace = "nowrap";
    button.style.overflow = "hidden";
    button.style.textOverflow = "ellipsis";
    button.addEventListener("click", () => {
      activeTab = tab;
      renderPanel();
    });
    wrap.appendChild(button);
  });

  return wrap;
}

function createPresetsTabMount(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.id = "react-presets-tab";
  wrap.style.marginTop = "8px";
  return wrap;
}

function createLeftPanelMount(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.id = "react-left-panel";
  return wrap;
}

function createFeaturePanelMount(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.id = "react-feature-panel";
  return wrap;
}

function createRuntimeTabMount(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.id = "react-runtime-tab";
  wrap.style.marginTop = "8px";
  return wrap;
}

function createMaterialTabMount(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.id = "react-material-tab";
  wrap.style.marginTop = "8px";
  return wrap;
}

function createWorldTabMount(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.id = "react-world-tab";
  wrap.style.marginTop = "8px";
  return wrap;
}

function createDebugModeControl(): HTMLElement {
  const row = document.createElement("label");
  row.style.display = "grid";
  row.style.gap = "4px";
  row.style.marginTop = "8px";
  row.style.width = "100%";
  row.style.minWidth = "0";
  row.style.boxSizing = "border-box";

  const title = document.createElement("div");
  title.textContent = "Terrain View";

  const select = document.createElement("select");
  select.style.width = "100%";
  select.style.maxWidth = "100%";
  select.style.padding = "6px 8px";
  select.style.boxSizing = "border-box";
  select.style.borderRadius = "8px";
  select.style.border = "1px solid rgba(255,255,255,0.16)";
  select.style.background = "rgba(14, 21, 29, 0.95)";
  select.style.color = "#f4edc9";

  const modes: readonly [string, TerrainDebugViewMode][] = [
    ["Final", TerrainDebugViewMode.Final],
    ["Grass Weight", TerrainDebugViewMode.GrassWeight],
    ["Dirt Weight", TerrainDebugViewMode.DirtWeight],
    ["Rock Weight", TerrainDebugViewMode.RockWeight],
    ["Snow Weight", TerrainDebugViewMode.SnowWeight],
    ["Height", TerrainDebugViewMode.Height],
    ["Slope", TerrainDebugViewMode.Slope],
    ["Triplanar Blend", TerrainDebugViewMode.TriplanarBlend],
    ["Erosion", TerrainDebugViewMode.Erosion],
    ["Raw Height", TerrainDebugViewMode.RawHeight],
    ["Flow", TerrainDebugViewMode.Flow],
    ["River", TerrainDebugViewMode.River],
    ["Lake", TerrainDebugViewMode.Lake],
    ["Sediment", TerrainDebugViewMode.Sediment],
    ["River Width", TerrainDebugViewMode.RiverWidth],
    ["Water Transition", TerrainDebugViewMode.WaterTransition],
    ["Resource", TerrainDebugViewMode.Resource],
    ["Coal", TerrainDebugViewMode.Coal],
    ["Iron", TerrainDebugViewMode.Iron],
    ["Copper", TerrainDebugViewMode.Copper],
  ];

  modes.forEach(([label, value]) => {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = label;
    option.selected = demo.getDebugViewMode() === value;
    select.appendChild(option);
  });

  select.addEventListener("change", () => {
    demo.setDebugViewMode(Number(select.value) as TerrainDebugViewMode);
  });

  row.appendChild(title);
  row.appendChild(select);
  return row;
}

function createCheckbox(
  label: string,
  initialValue: boolean,
  onChange: (checked: boolean) => void,
  disabled = false,
): HTMLElement {
  const row = document.createElement("label");
  row.style.display = "flex";
  row.style.alignItems = "center";
  row.style.gap = "8px";
  row.style.marginTop = "10px";
  row.style.width = "100%";
  row.style.minWidth = "0";
  row.style.boxSizing = "border-box";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = initialValue;
  input.disabled = disabled;
  input.style.flex = "0 0 auto";
  input.addEventListener("change", () => onChange(input.checked));

  const title = document.createElement("span");
  title.textContent = label;
  title.style.minWidth = "0";
  title.style.opacity = disabled ? "0.55" : "1";
  row.style.opacity = disabled ? "0.7" : "1";

  row.appendChild(input);
  row.appendChild(title);
  return row;
}

function createActionButtons(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gridTemplateColumns = "1fr 1fr";
  wrap.style.gap = "8px";
  wrap.style.marginTop = "12px";

  wrap.appendChild(
    createButton("Rebuild Terrain", () => {
      return applyDraftToWorld();
    }),
  );
  wrap.appendChild(
    createButton("Reset Draft", () => {
      draftConfig = buildDraftConfig();
      renderPanel();
    }),
  );

  return wrap;
}

function createPoiStatsRow(): HTMLElement {
  const stats = demo.getPoiStats();
  const meshStats = demo.getPoiMeshStats();
  const row = document.createElement("div");
  row.style.marginTop = "8px";
  row.style.padding = "6px 8px";
  row.style.borderRadius = "8px";
  row.style.background = "rgba(14, 21, 29, 0.95)";
  row.style.border = "1px solid rgba(255,255,255,0.1)";
  row.style.color = "#9cb3c3";
  row.style.whiteSpace = "pre-wrap";
  row.textContent =
    `POI ${stats.total}: V ${stats.villages} | ` +
    `O ${stats.outposts} | M ${stats.mines}\n` +
    `Meshes ${meshStats.enabled}/${meshStats.total}`;
  return row;
}

function createFeatureBuildStatusMount(): HTMLElement {
  const row = document.createElement("div");
  row.style.marginTop = "8px";
  row.id = "react-feature-build-status";
  return row;
}

function updateFeatureBuildStatus(): void {
  renderFeatureStatus();
}

function createPoiDebugControls(): HTMLElement {
  const wrap = document.createElement("div");
  wrap.style.display = "grid";
  wrap.style.gap = "6px";
  wrap.style.marginTop = "8px";
  wrap.style.padding = "8px";
  wrap.style.borderRadius = "8px";
  wrap.style.background = "rgba(14, 21, 29, 0.95)";
  wrap.style.border = "1px solid rgba(255,255,255,0.1)";

  const title = document.createElement("div");
  title.textContent = "POI Debug";
  title.style.color = "#9cb3c3";
  wrap.appendChild(title);

  wrap.appendChild(
    createCheckbox("Show Scores", draftConfig.poiDebug.showScores, (checked) => {
      draftConfig.poiDebug.showScores = checked;
      demo.setPoiDebugConfig(draftConfig.poiDebug);
    }),
  );
  wrap.appendChild(
    createCheckbox("Show Radii", draftConfig.poiDebug.showRadii, (checked) => {
      draftConfig.poiDebug.showRadii = checked;
      demo.setPoiDebugConfig(draftConfig.poiDebug);
    }),
  );
  wrap.appendChild(
    createCheckbox("Show Tags", draftConfig.poiDebug.showTags, (checked) => {
      draftConfig.poiDebug.showTags = checked;
      demo.setPoiDebugConfig(draftConfig.poiDebug);
    }),
  );

  (
    [
      ["Villages", "village"],
      ["Outposts", "outpost"],
      ["Mines", "mine"],
    ] as const
  ).forEach(([label, kind]) => {
    wrap.appendChild(
      createCheckbox(label, draftConfig.poiDebug.kinds[kind], (checked) => {
        draftConfig.poiDebug.kinds[kind] = checked;
        demo.setPoiDebugConfig(draftConfig.poiDebug);
        renderHud();
      }),
    );
  });

  wrap.appendChild(createDivider());
  wrap.appendChild(createSectionLabel("Mine Resources"));
  (
    [
      ["Coal", "coal"],
      ["Iron", "iron"],
      ["Copper", "copper"],
    ] as const
  ).forEach(([label, kind]) => {
    wrap.appendChild(
      createCheckbox(label, draftConfig.poiDebug.mineResources[kind], (checked) => {
        draftConfig.poiDebug.mineResources[kind] = checked;
        demo.setPoiDebugConfig(draftConfig.poiDebug);
        renderHud();
      }),
    );
  });

  return wrap;
}

function createWaterDebugControl(): HTMLElement {
  const row = document.createElement("label");
  row.style.display = "grid";
  row.style.gap = "4px";
  row.style.marginTop = "8px";
  row.style.width = "100%";
  row.style.minWidth = "0";
  row.style.boxSizing = "border-box";

  const title = document.createElement("div");
  title.textContent = "Water Debug";

  const select = document.createElement("select");
  select.style.width = "100%";
  select.style.maxWidth = "100%";
  select.style.padding = "6px 8px";
  select.style.boxSizing = "border-box";
  select.style.borderRadius = "8px";
  select.style.border = "1px solid rgba(255,255,255,0.16)";
  select.style.background = "rgba(14, 21, 29, 0.95)";
  select.style.color = "#f4edc9";

  const modes: readonly [string, number][] = [
    ["Final", 0],
    ["Terrain Mask", 1],
    ["Water Depth", 2],
    ["Shore Fade", 3],
  ];

  modes.forEach(([label, value]) => {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = label;
    option.selected = draftConfig.water.debugView === value;
    select.appendChild(option);
  });

  select.addEventListener("change", () => {
    draftConfig.water.debugView = Number(select.value);
    applyDraftWaterConfig();
  });

  row.appendChild(title);
  row.appendChild(select);
  return row;
}

async function applyDraftToWorld(): Promise<void> {
  await demo.rebuildTerrain(buildTerrainOverridesFromDraft());
  demo.setCollisionRadius(draftConfig.collisionRadius);
  demo.setFoliageRadius(draftConfig.foliageRadius);
  demo.setShowFoliage(draftConfig.showFoliage);
  demo.setShowPoi(draftConfig.features.poi);
  demo.setPoiMarkerMeshesVisible(!draftConfig.hidePoiMarkerMeshes);
  demo.setPoiLabelsVisible(!draftConfig.hidePoiLabels);
  demo.setShowPoiFootprints(draftConfig.showPoiFootprints);
  demo.setPoiDebugConfig(draftConfig.poiDebug);
  demo.setShowRoads(draftConfig.features.roads);
  demo.setLodDistances(draftConfig.lodDistances);
  demo.setWaterLevel(draftConfig.waterLevel);
  demo.setWaterConfig(draftConfig.water);
  applyDraftMaterialConfig();
  debugVisible = false;
  renderHud();
  draftConfig = buildDraftConfig();
  renderPanel();
  renderFeaturePanel();
}

function runAsyncTask(task: Promise<void>): void {
  void task.catch((error: unknown) => {
    console.error(error);
  });
}

function applyDraftMaterialConfig(): void {
  const config = demo.getTerrainMaterialConfig();
  config.thresholds = { ...draftConfig.materialThresholds };
  config.scales = {
    ...config.scales,
    grassScale: draftConfig.materialScales.grassScale,
    dirtScale: draftConfig.materialScales.dirtScale,
    sandScale: draftConfig.materialScales.sandScale,
    rockScale: draftConfig.materialScales.rockScale,
    snowScale: draftConfig.materialScales.snowScale,
    macroScale: draftConfig.materialScales.macroScale,
    antiTileStrength: draftConfig.materialScales.antiTileStrength,
  };
  config.blendSharpness = draftConfig.blendSharpness;
  config.shorelineStartOffset = draftConfig.shorelineStartOffset;
  config.shorelineEndOffset = draftConfig.shorelineEndOffset;
  config.sedimentStrength = draftConfig.sedimentStrength;
  config.sedimentSandBias = draftConfig.sedimentSandBias;
  config.smallRiverTintStrength = draftConfig.smallRiverTintStrength;
  config.smallRiverTintBrightness = draftConfig.smallRiverTintBrightness;
  config.smallRiverTintSaturation = draftConfig.smallRiverTintSaturation;
  demo.setTerrainMaterialConfig(config);
}

function applyDraftWaterConfig(): void {
  demo.setWaterConfig(draftConfig.water);
}

function buildDraftConfig(): DraftConfig {
  const config = demo.getTerrainConfig();
  return {
    seed: String(config.seed),
    useGeneratedTextures: demo.getUseGeneratedTextures(),
    worldMin: config.worldMin,
    worldMax: config.worldMax,
    worldSize: config.worldSize,
    chunksPerAxis: config.chunksPerAxis,
    chunkSize: config.chunkSize,
    baseHeight: config.baseHeight,
    maxHeight: config.maxHeight,
    waterLevel: demo.getWaterLevel(),
    water: { ...demo.getWaterConfig() },
    collisionRadius: demo.getCollisionRadius(),
    buildFoliage: config.buildFoliage,
    foliageRadius: demo.getFoliageRadius(),
    showFoliage: demo.getShowFoliage(),
    showPoi: demo.getTerrainConfig().features.poi,
    hidePoiMarkerMeshes: !demo.getPoiMarkerMeshesVisible(),
    hidePoiLabels: !demo.getPoiLabelsVisible(),
    showPoiFootprints: demo.getShowPoiFootprints(),
    poiDebug: demo.getPoiDebugConfig(),
    showRoads: demo.getTerrainConfig().features.roads,
    lodDistances: [...demo.getLodDistances()] as [number, number, number],
    materialThresholds: { ...demo.getTerrainMaterialThresholds() },
    materialScales: { ...demo.getTerrainMaterialConfig().scales },
    blendSharpness: demo.getTerrainMaterialConfig().blendSharpness,
    shorelineStartOffset: demo.getTerrainMaterialConfig().shorelineStartOffset,
    shorelineEndOffset: demo.getTerrainMaterialConfig().shorelineEndOffset,
    sedimentStrength: demo.getTerrainMaterialConfig().sedimentStrength,
    sedimentSandBias: demo.getTerrainMaterialConfig().sedimentSandBias,
    smallRiverTintStrength: demo.getTerrainMaterialConfig().smallRiverTintStrength,
    smallRiverTintBrightness: demo.getTerrainMaterialConfig().smallRiverTintBrightness,
    smallRiverTintSaturation: demo.getTerrainMaterialConfig().smallRiverTintSaturation,
    erosion: { ...config.erosion },
    features: { ...config.features },
    poi: { ...config.poi },
    rivers: { ...config.rivers },
    shape: { ...config.shape },
  };
}

function buildTerrainOverridesFromDraft(): TerrainConfigOverrides {
  return {
    seed: draftConfig.seed,
    worldMin: draftConfig.worldMin,
    worldMax: draftConfig.worldMax,
    chunksPerAxis: draftConfig.chunksPerAxis,
    chunkSize: draftConfig.chunkSize,
    baseHeight: draftConfig.baseHeight,
    maxHeight: draftConfig.maxHeight,
    waterLevel: draftConfig.waterLevel,
    collisionRadius: draftConfig.collisionRadius,
    buildFoliage: draftConfig.buildFoliage,
    foliageRadius: draftConfig.foliageRadius,
    lodDistances: draftConfig.lodDistances,
    erosion: { ...draftConfig.erosion },
    features: { ...draftConfig.features },
    poi: { ...draftConfig.poi },
    rivers: { ...draftConfig.rivers },
    shape: { ...draftConfig.shape },
  };
}

function mergeDraftWithOverrides(base: DraftConfig, overrides: TerrainConfigOverrides): DraftConfig {
  return {
    seed: String(overrides.seed ?? base.seed),
    useGeneratedTextures: base.useGeneratedTextures,
    worldMin: overrides.worldMin ?? base.worldMin,
    worldMax: overrides.worldMax ?? base.worldMax,
    worldSize: (overrides.worldMax ?? base.worldMax) - (overrides.worldMin ?? base.worldMin),
    chunksPerAxis: overrides.chunksPerAxis ?? base.chunksPerAxis,
    chunkSize: overrides.chunkSize ?? base.chunkSize,
    baseHeight: overrides.baseHeight ?? base.baseHeight,
    maxHeight: overrides.maxHeight ?? base.maxHeight,
    waterLevel: overrides.waterLevel ?? base.waterLevel,
    water: { ...base.water },
    collisionRadius: overrides.collisionRadius ?? base.collisionRadius,
    buildFoliage: overrides.buildFoliage ?? base.buildFoliage,
    foliageRadius: overrides.foliageRadius ?? base.foliageRadius,
    showFoliage: (overrides.buildFoliage ?? base.buildFoliage) ? base.showFoliage : false,
    showPoi: overrides.features?.poi ?? base.showPoi,
    hidePoiMarkerMeshes: base.hidePoiMarkerMeshes,
    hidePoiLabels: base.hidePoiLabels,
    showPoiFootprints: base.showPoiFootprints,
    poiDebug: {
      showScores: base.poiDebug.showScores,
      showRadii: base.poiDebug.showRadii,
      showTags: base.poiDebug.showTags,
      kinds: { ...base.poiDebug.kinds },
      mineResources: { ...base.poiDebug.mineResources },
    },
    showRoads: overrides.features?.roads ?? base.showRoads,
    lodDistances: (overrides.lodDistances ? [...overrides.lodDistances] : [...base.lodDistances]) as [
      number,
      number,
      number,
    ],
    materialThresholds: { ...base.materialThresholds },
    materialScales: { ...base.materialScales },
    blendSharpness: base.blendSharpness,
    shorelineStartOffset: base.shorelineStartOffset,
    shorelineEndOffset: base.shorelineEndOffset,
    sedimentStrength: base.sedimentStrength,
    sedimentSandBias: base.sedimentSandBias,
    smallRiverTintStrength: base.smallRiverTintStrength,
    smallRiverTintBrightness: base.smallRiverTintBrightness,
    smallRiverTintSaturation: base.smallRiverTintSaturation,
    erosion: {
      ...base.erosion,
      ...overrides.erosion,
    },
    features: {
      ...base.features,
      ...overrides.features,
    },
    poi: {
      ...base.poi,
      ...overrides.poi,
    },
    rivers: {
      ...base.rivers,
      ...overrides.rivers,
    },
    shape: {
      ...base.shape,
      ...overrides.shape,
    },
  };
}

function clonePoiDebugConfig(
  config: MutableTerrainPoiDebugConfig | TerrainPoiDebugConfig,
): MutableTerrainPoiDebugConfig {
  return {
    showScores: config.showScores,
    showRadii: config.showRadii,
    showTags: config.showTags,
    kinds: { ...config.kinds },
    mineResources: { ...config.mineResources },
  };
}

function clonePreset(preset: TerrainPreset): TerrainPreset {
  return {
    name: preset.name,
    config: { ...preset.config },
    featureState: preset.featureState
      ? {
          poiDebug: clonePoiDebugConfig(preset.featureState.poiDebug),
          hidePoiMarkerMeshes: preset.featureState.hidePoiMarkerMeshes,
          hidePoiLabels: preset.featureState.hidePoiLabels,
          showPoiFootprints: preset.featureState.showPoiFootprints,
        }
      : undefined,
  };
}

function buildPresetFromDraft(name: string): TerrainPreset {
  return {
    name,
    config: buildTerrainOverridesFromDraft(),
    featureState: {
      poiDebug: clonePoiDebugConfig(draftConfig.poiDebug),
      hidePoiMarkerMeshes: draftConfig.hidePoiMarkerMeshes,
      hidePoiLabels: draftConfig.hidePoiLabels,
      showPoiFootprints: draftConfig.showPoiFootprints,
    },
  };
}

function getPresetOptions(): TerrainPreset[] {
  return [...BUILTIN_PRESETS, ...getSavedPresets()];
}

function getSavedPresets(): TerrainPreset[] {
  const serialized = window.localStorage.getItem(SAVED_PRESETS_KEY);
  if (!serialized) {
    return [];
  }

  try {
    const parsed = JSON.parse(serialized) as unknown;
    return normalizeImportedPresets(parsed);
  } catch {
    return [];
  }
}

function savePresets(presets: TerrainPreset[]): void {
  window.localStorage.setItem(SAVED_PRESETS_KEY, JSON.stringify(presets));
}

function parseImportedPresets(serialized: string): TerrainPreset[] {
  const parsed = JSON.parse(serialized) as unknown;
  const presets = normalizeImportedPresets(parsed);
  if (presets.length === 0) {
    throw new Error("The imported JSON does not contain any valid presets.");
  }
  return presets;
}

function normalizeImportedPresets(value: unknown): TerrainPreset[] {
  const list = Array.isArray(value) ? value : isTerrainPresetRecord(value) ? [value] : [];
  return list.flatMap((entry) => (isTerrainPresetRecord(entry) ? [normalizePreset(entry)] : []));
}

function normalizePreset(value: TerrainPresetRecord): TerrainPreset {
  const defaultPoiDebug = buildDraftConfig().poiDebug;
  return {
    name: value.name.trim(),
    config: value.config ?? {},
    featureState: value.featureState
      ? {
          poiDebug: clonePoiDebugConfig(value.featureState.poiDebug ?? defaultPoiDebug),
          hidePoiMarkerMeshes: value.featureState.hidePoiMarkerMeshes ?? false,
          hidePoiLabels: value.featureState.hidePoiLabels ?? false,
          showPoiFootprints: value.featureState.showPoiFootprints ?? false,
        }
      : undefined,
  };
}

function mergeImportedPresets(existing: TerrainPreset[], imported: TerrainPreset[]): TerrainPreset[] {
  const byName = new Map<string, TerrainPreset>();
  existing.forEach((preset) => byName.set(preset.name, preset));
  imported.forEach((preset) => byName.set(preset.name, preset));
  return [...byName.values()];
}

function downloadJsonFile(filename: string, payload: TerrainPreset): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

function slugifyPresetName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "terrain-preset"
  );
}

interface TerrainPresetRecord {
  readonly name: string;
  readonly config?: TerrainConfigOverrides;
  readonly featureState?: Partial<PresetFeatureStateRecord>;
}

interface PresetFeatureStateRecord {
  readonly poiDebug: MutableTerrainPoiDebugConfig;
  readonly hidePoiMarkerMeshes: boolean;
  readonly hidePoiLabels: boolean;
  readonly showPoiFootprints: boolean;
}

function isTerrainPresetRecord(value: unknown): value is TerrainPresetRecord {
  return typeof value === "object" && value !== null && typeof (value as { name?: unknown }).name === "string";
}

function createHeading(text: string): HTMLElement {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.fontSize = "14px";
  el.style.fontWeight = "700";
  return el;
}

function createSectionLabel(text: string): HTMLElement {
  const el = document.createElement("div");
  el.textContent = text;
  el.style.marginTop = "12px";
  el.style.fontSize = "11px";
  el.style.textTransform = "uppercase";
  el.style.letterSpacing = "0.08em";
  el.style.color = "#9cb3c3";
  return el;
}

function createDivider(): HTMLElement {
  const el = document.createElement("div");
  el.style.height = "1px";
  el.style.marginTop = "12px";
  el.style.background = "rgba(255,255,255,0.1)";
  return el;
}

function createInfoRow(label: string, value: string): HTMLElement {
  const el = document.createElement("div");
  el.style.marginTop = "8px";
  el.style.padding = "6px 8px";
  el.style.borderRadius = "8px";
  el.style.background = "rgba(14, 21, 29, 0.95)";
  el.style.border = "1px solid rgba(255,255,255,0.1)";
  el.style.color = "#9cb3c3";
  el.textContent = `${label}: ${value}`;
  return el;
}

function createButton(label: string, onClick: () => void | Promise<void>): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.style.padding = "8px 10px";
  button.style.borderRadius = "8px";
  button.style.border = "1px solid rgba(255,255,255,0.16)";
  button.style.background = "rgba(18, 29, 39, 0.95)";
  button.style.color = "#f4edc9";
  button.style.cursor = "pointer";
  button.style.width = "100%";
  button.style.maxWidth = "100%";
  button.style.minWidth = "0";
  button.style.boxSizing = "border-box";
  button.addEventListener("click", () => {
    runAsyncTask(Promise.resolve(onClick()));
  });
  return button;
}

function createTextInput(label: string, initialValue: string, onChange: (value: string) => void): HTMLElement {
  const row = document.createElement("label");
  row.style.display = "grid";
  row.style.gap = "4px";
  row.style.marginTop = "8px";
  row.style.width = "100%";
  row.style.minWidth = "0";
  row.style.boxSizing = "border-box";

  const title = document.createElement("div");
  title.textContent = label;

  const input = document.createElement("input");
  input.type = "text";
  input.value = initialValue;
  input.style.width = "100%";
  input.style.maxWidth = "100%";
  input.style.padding = "6px 8px";
  input.style.boxSizing = "border-box";
  input.style.borderRadius = "8px";
  input.style.border = "1px solid rgba(255,255,255,0.16)";
  input.style.background = "rgba(14, 21, 29, 0.95)";
  input.style.color = "#f4edc9";
  input.addEventListener("change", () => onChange(input.value));

  row.appendChild(title);
  row.appendChild(input);
  return row;
}

function createColorInput(label: string, initialValue: string, onChange: (value: string) => void): HTMLElement {
  const row = document.createElement("label");
  row.style.display = "grid";
  row.style.gap = "4px";
  row.style.marginTop = "8px";
  row.style.width = "100%";
  row.style.minWidth = "0";
  row.style.boxSizing = "border-box";

  const title = document.createElement("div");
  title.textContent = label;

  const input = document.createElement("input");
  input.type = "color";
  input.value = initialValue;
  input.style.width = "100%";
  input.style.height = "32px";
  input.style.maxWidth = "100%";
  input.style.padding = "2px";
  input.style.boxSizing = "border-box";
  input.style.borderRadius = "8px";
  input.style.border = "1px solid rgba(255,255,255,0.16)";
  input.style.background = "rgba(14, 21, 29, 0.95)";
  input.addEventListener("input", () => onChange(input.value));

  row.appendChild(title);
  row.appendChild(input);
  return row;
}

function createSlider(
  label: string,
  min: number,
  max: number,
  step: number,
  initialValue: number,
  onInput: (value: number) => void,
): HTMLElement {
  const row = document.createElement("label");
  row.style.display = "grid";
  row.style.gap = "4px";
  row.style.marginTop = "8px";
  row.style.width = "100%";
  row.style.minWidth = "0";
  row.style.boxSizing = "border-box";

  const title = document.createElement("div");
  title.textContent = `${label}: ${formatValue(initialValue, step)}`;

  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(initialValue);
  input.style.width = "100%";
  input.style.maxWidth = "100%";
  input.style.boxSizing = "border-box";

  input.addEventListener("input", () => {
    const value = Number(input.value);
    title.textContent = `${label}: ${formatValue(value, step)}`;
    onInput(value);
  });
  row.appendChild(title);
  row.appendChild(input);
  return row;
}

function formatValue(value: number, step: number): string {
  return step >= 1 ? String(value) : value.toFixed(getDecimalPlaces(step));
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

function getDecimalPlaces(step: number): number {
  const stepText = String(step);
  const dotIndex = stepText.indexOf(".");
  return dotIndex === -1 ? 0 : stepText.length - dotIndex - 1;
}

interface DraftConfig {
  seed: string;
  useGeneratedTextures: boolean;
  worldMin: number;
  worldMax: number;
  worldSize: number;
  chunksPerAxis: number;
  chunkSize: number;
  baseHeight: number;
  maxHeight: number;
  waterLevel: number;
  water: MutableTerrainWaterConfig;
  collisionRadius: number;
  buildFoliage: boolean;
  foliageRadius: number;
  showFoliage: boolean;
  showPoi: boolean;
  hidePoiMarkerMeshes: boolean;
  hidePoiLabels: boolean;
  showPoiFootprints: boolean;
  poiDebug: MutableTerrainPoiDebugConfig;
  showRoads: boolean;
  features: MutableTerrainFeatureConfig;
  lodDistances: [number, number, number];
  materialThresholds: TerrainLayerThresholds;
  materialScales: {
    grassScale: number;
    dirtScale: number;
    sandScale: number;
    rockScale: number;
    snowScale: number;
    macroScale: number;
    antiTileStrength: number;
  };
  blendSharpness: number;
  shorelineStartOffset: number;
  shorelineEndOffset: number;
  sedimentStrength: number;
  sedimentSandBias: number;
  smallRiverTintStrength: number;
  smallRiverTintBrightness: number;
  smallRiverTintSaturation: number;
  erosion: MutableTerrainErosionConfig;
  poi: MutableTerrainPoiConfig;
  rivers: MutableTerrainRiverConfig;
  shape: MutableTerrainShapeConfig;
}

type MutableTerrainShapeConfig = {
  -readonly [Key in keyof TerrainShapeConfig]: TerrainShapeConfig[Key];
};

type MutableTerrainErosionConfig = {
  -readonly [Key in keyof TerrainErosionConfig]: TerrainErosionConfig[Key];
};

type MutableTerrainPoiConfig = {
  -readonly [Key in keyof TerrainPoiConfig]: TerrainPoiConfig[Key];
};

type MutableTerrainFeatureConfig = {
  -readonly [Key in keyof TerrainFeatureConfig]: TerrainFeatureConfig[Key];
};

type MutableTerrainPoiDebugConfig = {
  showScores: boolean;
  showRadii: boolean;
  showTags: boolean;
  kinds: Record<TerrainPoiKind, boolean>;
  mineResources: Record<TerrainMineResource, boolean>;
};

type MutableTerrainRiverConfig = {
  -readonly [Key in keyof TerrainRiverConfig]: TerrainRiverConfig[Key];
};

type MutableTerrainWaterConfig = {
  -readonly [Key in keyof TerrainWaterConfig]: TerrainWaterConfig[Key];
};

function clampErosionResolution(value: number): number {
  const rounded = Math.round(value);
  const clamped = Math.max(65, Math.min(513, rounded));
  return clamped % 2 === 0 ? clamped + 1 : clamped;
}

function syncDraftWorldBounds(): void {
  draftConfig.worldSize = draftConfig.chunksPerAxis * draftConfig.chunkSize;
  draftConfig.worldMin = -draftConfig.worldSize * 0.5;
  draftConfig.worldMax = draftConfig.worldSize * 0.5;
}

function retuneDraftForWorldSize(): void {
  const scale = Math.max(1, draftConfig.worldSize / 1024);
  const sqrtScale = Math.sqrt(scale);
  draftConfig.lodDistances = [
    roundToNearest(clamp(160 * sqrtScale, 160, 420), 10),
    roundToNearest(clamp(320 * sqrtScale, 320, 760), 10),
    roundToNearest(clamp(520 * sqrtScale, 520, 1200), 10),
  ];
  draftConfig.collisionRadius = roundToNearest(clamp(220 * sqrtScale, 220, 820), 10);
  draftConfig.foliageRadius = roundToNearest(clamp(700 * sqrtScale, 700, 2600), 10);
  draftConfig.erosion.resolution = clampErosionResolution(257 * sqrtScale);
  draftConfig.rivers.resolution = clampErosionResolution(257 * sqrtScale);
  draftConfig.water.inlandMeshResolution = clampErosionResolution(257 * sqrtScale);
  draftConfig.poi.density = roundToNearest(clamp(0.8 * sqrtScale, 0.8, 3), 0.05);
  draftConfig.poi.spacing = roundToNearest(clamp(1.1 * Math.pow(scale, 0.18), 1.1, 1.6), 0.05);
}

function roundToNearest(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
