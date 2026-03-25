import type { TerrainDemo } from "./createTerrainDemo";
import {
  createTerrainExportBundle,
  createTerrainExportZipBytes,
  deserializeTerrainAsset,
  encodeTerrainExportFiles,
} from "../builder";
import {
  createFeaturePanelMount,
  createFooterMount,
  createHeaderActionsMount,
  createHeaderTrailingActionsMount,
  createLeftPanelMount,
} from "./demoShell";
import {
  buildPresetFromDraft,
  buildTerrainOverridesFromDraft,
  clampErosionResolution,
  clonePoiDebugConfig,
  clonePreset,
  type DraftConfig,
  downloadBinaryFile,
  downloadJsonFile,
  getPresetOptions,
  getSavedPresets,
  mergeDraftWithOverrides,
  mergeImportedPresets,
  parseImportedPresets,
  retuneDraftForWorldSize,
  savePresets,
  slugifyPresetName,
  syncDraftWorldBounds,
  type TerrainPreset,
} from "./demoState";
import {
  buildFeatureBuildStatusText,
  buildFeaturePanelState,
  buildHudText,
  buildMaterialTabState,
  buildRuntimeTabState,
  buildWorldTabState,
  type FeaturePanelState,
  type MaterialTabState,
  type RuntimeTabState,
  type WorldTabState,
  type PanelTab,
} from "./demoSnapshots";

interface DemoBridgeContext {
  readonly demo: TerrainDemo;
  readonly headerActions: HTMLDivElement;
  readonly headerTrailingActions: HTMLDivElement;
  readonly footer: HTMLDivElement;
  readonly panel: HTMLDivElement;
  readonly featurePanel: HTMLDivElement;
}

/**
 * UI bridge consumed by the React layer for snapshot reads and user actions.
 */
export interface DemoBridge {
  getSnapshot(): DemoSnapshot;
  getFeaturePanelState(): FeaturePanelState;
  getFeatureBuildStatusText(): string;
  getActivePanelTab(): PanelTab;
  getHudText(): string;
  getMaterialTabState(): MaterialTabState;
  getPresetOptionsData(): TerrainPreset[];
  getRuntimeTabState(): RuntimeTabState;
  getWorldTabState(): WorldTabState;
  subscribe(listener: () => void): () => void;
  applyPresetByIndex(index: number): Promise<void>;
  exportTerrainBundle(): void;
  importTerrainAssetText(serialized: string): Promise<void>;
  saveCurrentPreset(name: string): void;
  exportPresetByIndex(index: number): void;
  importPresetText(serialized: string): void;
  rebuildTerrainFromDraft(): Promise<void>;
  resetDraftTerrainConfig(): void;
  retuneWorldTabForWorldSize(): void;
  setActivePanelTab(tab: PanelTab): void;
  setFeaturePanelState(state: FeaturePanelState): void;
  setMaterialTabState(state: MaterialTabState): void;
  setRuntimeTabState(state: RuntimeTabState): void;
  setWorldTabState(state: WorldTabState): void;
}

/**
 * Immutable view-model snapshot published to React subscribers.
 */
export interface DemoSnapshot {
  readonly activePanelTab: PanelTab;
  readonly featurePanelMount: HTMLElement | null;
  readonly featurePanelState: FeaturePanelState | null;
  readonly featureStatusText: string;
  readonly footerMount: HTMLElement | null;
  readonly footerPerformanceMount: HTMLElement | null;
  readonly headerActionsMount: HTMLElement | null;
  readonly headerTrailingActionsMount: HTMLElement | null;
  readonly hudText: string;
  readonly leftPanelMount: HTMLElement | null;
  readonly materialTabState: MaterialTabState | null;
  readonly performanceText: string;
  readonly presetOptions: readonly TerrainPreset[];
  readonly runtimeTabState: RuntimeTabState | null;
  readonly worldTabState: WorldTabState | null;
}

let context: DemoBridgeContext | null = null;
let buildStatus = { phase: "idle", message: "", completed: 0, total: 0 } as ReturnType<TerrainDemo["getBuildStatus"]>;
let wireframe = false;
let debugVisible = false;
let loadingDebug = false;
let draftConfig: DraftConfig | null = null;
let presetOptions: TerrainPreset[] = [];
let activeTab: PanelTab = "runtime";
let transientHudMessage = "";
let transientHudTimeoutId: number | null = null;
let performanceText = "";
const snapshotListeners = new Set<() => void>();
let currentSnapshot: DemoSnapshot | null = null;

/**
 * Wires the demo runtime to the DOM mounts used by the React UI.
 */
export function initializeDemoBridge(nextContext: DemoBridgeContext): void {
  context = nextContext;
  buildStatus = nextContext.demo.getBuildStatus();
  draftConfig = buildDraftConfig();
  presetOptions = getPresetOptions(draftConfig.poiDebug);
  activeTab = "runtime";
  wireframe = false;
  debugVisible = false;
  loadingDebug = false;
  transientHudMessage = "";
  performanceText = formatPerformanceText(nextContext.demo.getPerformanceStats());
  if (transientHudTimeoutId !== null) {
    window.clearTimeout(transientHudTimeoutId);
    transientHudTimeoutId = null;
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
  renderHeaderActions();
  renderHeaderTrailingActions();
  renderFooter();
  publishSnapshot();

  window.setInterval(() => {
    renderHud();
    updateFeatureBuildStatus();
    updatePerformanceStats();
  }, 200);

  nextContext.demo.subscribeBuildStatus((status) => {
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

    const current = requireContext();

    if (event.key.toLowerCase() === "g") {
      if (loadingDebug) {
        return;
      }

      loadingDebug = true;
      renderHud();
      debugVisible = await current.demo.toggleDebugOverlay();
      loadingDebug = false;
      renderHud();
    }

    if (event.key.toLowerCase() === "v") {
      wireframe = !wireframe;
      current.demo.setWireframe(wireframe);
      renderHud();
    }
  });
}

/**
 * Subscribes to immutable snapshot updates.
 */
export function subscribe(listener: () => void): () => void {
  snapshotListeners.add(listener);
  return () => {
    snapshotListeners.delete(listener);
  };
}

/**
 * Returns the latest published UI snapshot.
 */
export function getSnapshot(): DemoSnapshot {
  if (!currentSnapshot) {
    currentSnapshot = createSnapshot();
  }

  return currentSnapshot;
}

/**
 * Builds the left footer HUD string for the current demo state.
 */
export function getHudText(): string {
  const current = requireContext();
  return buildHudText({
    buildStatus,
    debugVisible,
    foliage: current.demo.getFoliageStats(),
    loadingDebug,
    poi: current.demo.getPoiStats(),
    roads: current.demo.getRoadStats(),
    statusMessage: transientHudMessage,
    wireframe,
    workerStatus: current.demo.getWorkerStatus(),
  });
}

/**
 * Builds the feature panel status text shown above feature controls.
 */
export function getFeatureBuildStatusText(): string {
  const current = requireContext();
  return buildFeatureBuildStatusText({
    buildProfile: current.demo.getBuildProfile(),
    buildStatus,
    draftConfig: requireDraftConfig(),
    workerStatus: current.demo.getWorkerStatus(),
  });
}

/**
 * Returns the saved preset list currently visible to the UI.
 */
export function getPresetOptionsData(): TerrainPreset[] {
  return presetOptions.map(clonePreset);
}

/**
 * Builds the current feature panel state from the live demo and draft config.
 */
export function getFeaturePanelState(): FeaturePanelState {
  const current = requireContext();
  return buildFeaturePanelState(requireDraftConfig(), current.demo.getPoiStats(), current.demo.getPoiMeshStats());
}

/**
 * Builds the runtime tab state for React.
 */
export function getRuntimeTabState(): RuntimeTabState {
  const current = requireContext();
  return buildRuntimeTabState(requireDraftConfig(), current.demo.getDebugViewMode());
}

/**
 * Builds the material tab state for React.
 */
export function getMaterialTabState(): MaterialTabState {
  return buildMaterialTabState(requireDraftConfig());
}

/**
 * Builds the world tab state for React.
 */
export function getWorldTabState(): WorldTabState {
  return buildWorldTabState(requireDraftConfig());
}

/**
 * Returns the currently selected left-panel tab.
 */
export function getActivePanelTab(): PanelTab {
  return activeTab;
}

export function setFeaturePanelState(state: FeaturePanelState): void {
  const current = requireContext();
  const currentDraft = requireDraftConfig();
  currentDraft.features = { ...state.features };
  if (!currentDraft.features.poi) {
    currentDraft.features.roads = false;
  }
  currentDraft.hidePoiMarkerMeshes = state.hidePoiMarkerMeshes;
  currentDraft.hidePoiLabels = state.hidePoiLabels;
  currentDraft.showPoiFootprints = state.showPoiFootprints;
  currentDraft.poiDebug = clonePoiDebugConfig(state.poiDebug);

  current.demo.setPoiMarkerMeshesVisible(!currentDraft.hidePoiMarkerMeshes);
  current.demo.setPoiLabelsVisible(!currentDraft.hidePoiLabels);
  current.demo.setShowPoiFootprints(currentDraft.showPoiFootprints);
  current.demo.setPoiDebugConfig(currentDraft.poiDebug);

  renderFeaturePanel();
  renderFeatureStatus();
  renderHud();
}

export function setRuntimeTabState(state: RuntimeTabState): void {
  const current = requireContext();
  const currentDraft = requireDraftConfig();
  currentDraft.waterLevel = state.waterLevel;
  currentDraft.water = { ...state.water };
  currentDraft.buildFoliage = state.buildFoliage;
  currentDraft.showFoliage = state.buildFoliage ? state.showFoliage : false;
  currentDraft.collisionRadius = state.collisionRadius;
  currentDraft.foliageRadius = state.foliageRadius;

  const nextLodDistances = [...state.lodDistances] as [number, number, number];
  nextLodDistances[1] = Math.max(nextLodDistances[1], nextLodDistances[0] + 10);
  nextLodDistances[2] = Math.max(nextLodDistances[2], nextLodDistances[1] + 10);
  currentDraft.lodDistances = nextLodDistances;

  current.demo.setWaterLevel(currentDraft.waterLevel);
  applyDraftWaterConfig();
  current.demo.setCollisionRadius(currentDraft.collisionRadius);
  current.demo.setFoliageRadius(currentDraft.foliageRadius);
  current.demo.setShowFoliage(currentDraft.showFoliage);
  current.demo.setLodDistances(currentDraft.lodDistances);
  current.demo.setDebugViewMode(state.debugViewMode);

  renderPanel();
  renderHud();
}

export function setMaterialTabState(state: MaterialTabState): void {
  const current = requireContext();
  const currentDraft = requireDraftConfig();
  currentDraft.useGeneratedTextures = state.useGeneratedTextures;
  currentDraft.materialThresholds = { ...state.materialThresholds };
  currentDraft.materialScales = { ...state.materialScales };
  currentDraft.blendSharpness = state.blendSharpness;
  currentDraft.shorelineStartOffset = Math.min(state.shorelineStartOffset, state.shorelineEndOffset - 0.5);
  currentDraft.shorelineEndOffset = Math.max(state.shorelineEndOffset, currentDraft.shorelineStartOffset + 0.5);
  currentDraft.sedimentStrength = state.sedimentStrength;
  currentDraft.sedimentSandBias = state.sedimentSandBias;
  currentDraft.smallRiverTintStrength = state.smallRiverTintStrength;
  currentDraft.smallRiverTintBrightness = state.smallRiverTintBrightness;
  currentDraft.smallRiverTintSaturation = state.smallRiverTintSaturation;

  currentDraft.materialThresholds.rockSlopeStart = Math.min(
    currentDraft.materialThresholds.rockSlopeStart,
    currentDraft.materialThresholds.rockSlopeFull - 0.02,
  );
  currentDraft.materialThresholds.rockSlopeFull = Math.max(
    currentDraft.materialThresholds.rockSlopeFull,
    currentDraft.materialThresholds.rockSlopeStart + 0.02,
  );
  currentDraft.materialThresholds.snowStartHeight = Math.min(
    currentDraft.materialThresholds.snowStartHeight,
    currentDraft.materialThresholds.snowFullHeight - 1,
  );
  currentDraft.materialThresholds.snowFullHeight = Math.max(
    currentDraft.materialThresholds.snowFullHeight,
    currentDraft.materialThresholds.snowStartHeight + 1,
  );
  currentDraft.materialThresholds.dirtLowHeight = Math.min(
    currentDraft.materialThresholds.dirtLowHeight,
    currentDraft.materialThresholds.dirtHighHeight - 1,
  );
  currentDraft.materialThresholds.dirtHighHeight = Math.max(
    currentDraft.materialThresholds.dirtHighHeight,
    currentDraft.materialThresholds.dirtLowHeight + 1,
  );

  runAsyncTask(current.demo.setUseGeneratedTextures(currentDraft.useGeneratedTextures));
  current.demo.setTerrainMaterialThresholds(currentDraft.materialThresholds);
  applyDraftMaterialConfig();
  renderPanel();
}

export function setWorldTabState(state: WorldTabState): void {
  const currentDraft = requireDraftConfig();
  currentDraft.seed = state.seed;
  currentDraft.chunksPerAxis = state.chunksPerAxis;
  currentDraft.chunkSize = state.chunkSize;
  syncDraftWorldBounds(currentDraft);
  currentDraft.baseHeight = state.baseHeight;
  currentDraft.maxHeight = Math.max(state.maxHeight, currentDraft.baseHeight + 40);
  currentDraft.shape = { ...state.shape };
  currentDraft.erosion = {
    ...state.erosion,
    resolution: clampErosionResolution(state.erosion.resolution),
  };
  currentDraft.rivers = {
    ...state.rivers,
    resolution: clampErosionResolution(state.rivers.resolution),
    depth: Math.min(state.rivers.depth, state.rivers.maxDepth),
    maxDepth: Math.max(state.rivers.maxDepth, state.rivers.depth),
  };
  currentDraft.poi = { ...state.poi };
  renderWorldTabState();
}

export function retuneWorldTabForWorldSize(): void {
  const current = requireContext();
  const currentDraft = requireDraftConfig();
  retuneDraftForWorldSize(currentDraft);
  current.demo.setCollisionRadius(currentDraft.collisionRadius);
  current.demo.setFoliageRadius(currentDraft.foliageRadius);
  current.demo.setLodDistances(currentDraft.lodDistances);
  current.demo.setWaterConfig(currentDraft.water);
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

  const defaultPoiDebug = buildDraftConfig().poiDebug;
  const savedPresets = mergeImportedPresets(
    getSavedPresets(defaultPoiDebug),
    [buildPresetFromDraft(trimmedName, requireDraftConfig())],
  );
  savePresets(savedPresets);
  presetOptions = getPresetOptions(defaultPoiDebug);
  renderPresetOptions();
  renderPanel();
  renderFeaturePanel();
}

/**
 * Returns the right footer performance string shown by the UI.
 */
export function getPerformanceText(): string {
  return performanceText;
}

/**
 * Exports the current terrain as a browser-downloaded ZIP bundle.
 */
export function exportTerrainBundle(): void {
  try {
    const current = requireContext();
    const terrain = current.demo.getTerrainAsset();
    const bundle = createTerrainExportBundle(terrain);
    const encoded = encodeTerrainExportFiles(bundle);
    const zipBytes = createTerrainExportZipBytes(encoded, {
      includePortableGraymaps: false,
    });
    downloadBinaryFile(
      `${slugifyPresetName(`terrain-${terrain.config.seed}`)}.zip`,
      zipBytes,
      "application/zip",
    );
    setTransientHudMessage("terrain zip downloaded");
  } catch (error) {
    console.error(error);
    setTransientHudMessage("terrain export failed");
  }
}

/**
 * Imports a serialized `terrain.asset.json` payload into the current demo.
 */
export async function importTerrainAssetText(serialized: string): Promise<void> {
  try {
    const current = requireContext();
    const terrain = deserializeTerrainAsset(serialized);
    await current.demo.importTerrainAsset(terrain);
    debugVisible = false;
    draftConfig = buildDraftConfig();
    renderPanel();
    renderFeaturePanel();
    renderFeatureStatus();
    setTransientHudMessage("terrain asset imported");
  } catch (error) {
    console.error(error);
    setTransientHudMessage("terrain import failed");
    throw error;
  }
}

/**
 * Exports a saved preset as JSON.
 */
export function exportPresetByIndex(index: number): void {
  const preset = presetOptions[index];
  if (!preset) {
    throw new Error("Preset not found.");
  }

  downloadJsonFile(`${slugifyPresetName(preset.name)}.json`, clonePreset(preset));
}

/**
 * Imports preset JSON into local saved presets.
 */
export function importPresetText(serialized: string): void {
  const defaultPoiDebug = buildDraftConfig().poiDebug;
  const imported = parseImportedPresets(serialized, defaultPoiDebug);
  const savedPresets = mergeImportedPresets(getSavedPresets(defaultPoiDebug), imported);
  savePresets(savedPresets);
  presetOptions = getPresetOptions(defaultPoiDebug);
  renderPresetOptions();
  renderPanel();
  renderFeaturePanel();
}

/**
 * Rebuilds the terrain from the current draft configuration.
 */
export async function rebuildTerrainFromDraft(): Promise<void> {
  await applyDraftToWorld();
}

/**
 * Resets the editable draft configuration back to the live terrain state.
 */
export function resetDraftTerrainConfig(): void {
  draftConfig = buildDraftConfig();
  renderPanel();
  renderFeaturePanel();
  renderHud();
  renderFeatureStatus();
}

function renderHud(): void {
  publishSnapshot();
}

function renderFeatureStatus(): void {
  publishSnapshot();
}

function renderFeaturePanelState(): void {
  publishSnapshot();
}

function renderRuntimeTabState(): void {
  publishSnapshot();
}

function renderMaterialTabState(): void {
  publishSnapshot();
}

function renderWorldTabState(): void {
  publishSnapshot();
}

function renderLeftPanelState(): void {
  publishSnapshot();
}

function renderPresetOptions(): void {
  publishSnapshot();
}

function renderPanel(): void {
  const current = requireContext();
  current.panel.replaceChildren();
  current.panel.appendChild(createLeftPanelMount());
  renderRuntimeTabState();
  renderMaterialTabState();
  renderWorldTabState();
  renderLeftPanelState();
  renderFeaturePanel();
}

function renderFeaturePanel(): void {
  const current = requireContext();
  current.featurePanel.replaceChildren();
  current.featurePanel.appendChild(createFeaturePanelMount());
  renderFeaturePanelState();
}

function renderFooter(): void {
  const current = requireContext();
  current.footer.replaceChildren();
  current.footer.appendChild(createFooterMount());
}

function renderHeaderActions(): void {
  const current = requireContext();
  current.headerActions.replaceChildren();
  current.headerActions.appendChild(createHeaderActionsMount());
}

function renderHeaderTrailingActions(): void {
  const current = requireContext();
  current.headerTrailingActions.replaceChildren();
  current.headerTrailingActions.appendChild(createHeaderTrailingActionsMount());
}

function updateFeatureBuildStatus(): void {
  renderFeatureStatus();
}

function updatePerformanceStats(): void {
  const nextText = formatPerformanceText(requireContext().demo.getPerformanceStats());
  if (nextText === performanceText) {
    return;
  }
  performanceText = nextText;
  publishSnapshot();
}

async function applyDraftToWorld(): Promise<void> {
  const current = requireContext();
  const currentDraft = requireDraftConfig();
  await current.demo.rebuildTerrain(buildTerrainOverridesFromDraft(currentDraft));
  current.demo.setCollisionRadius(currentDraft.collisionRadius);
  current.demo.setFoliageRadius(currentDraft.foliageRadius);
  current.demo.setShowFoliage(currentDraft.showFoliage);
  current.demo.setShowPoi(currentDraft.features.poi);
  current.demo.setPoiMarkerMeshesVisible(!currentDraft.hidePoiMarkerMeshes);
  current.demo.setPoiLabelsVisible(!currentDraft.hidePoiLabels);
  current.demo.setShowPoiFootprints(currentDraft.showPoiFootprints);
  current.demo.setPoiDebugConfig(currentDraft.poiDebug);
  current.demo.setShowRoads(currentDraft.features.roads);
  current.demo.setLodDistances(currentDraft.lodDistances);
  current.demo.setWaterLevel(currentDraft.waterLevel);
  current.demo.setWaterConfig(currentDraft.water);
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
  const current = requireContext();
  const currentDraft = requireDraftConfig();
  const config = current.demo.getTerrainMaterialConfig();
  config.thresholds = { ...currentDraft.materialThresholds };
  config.scales = {
    ...config.scales,
    grassScale: currentDraft.materialScales.grassScale,
    dirtScale: currentDraft.materialScales.dirtScale,
    sandScale: currentDraft.materialScales.sandScale,
    rockScale: currentDraft.materialScales.rockScale,
    snowScale: currentDraft.materialScales.snowScale,
    macroScale: currentDraft.materialScales.macroScale,
    antiTileStrength: currentDraft.materialScales.antiTileStrength,
  };
  config.blendSharpness = currentDraft.blendSharpness;
  config.shorelineStartOffset = currentDraft.shorelineStartOffset;
  config.shorelineEndOffset = currentDraft.shorelineEndOffset;
  config.sedimentStrength = currentDraft.sedimentStrength;
  config.sedimentSandBias = currentDraft.sedimentSandBias;
  config.smallRiverTintStrength = currentDraft.smallRiverTintStrength;
  config.smallRiverTintBrightness = currentDraft.smallRiverTintBrightness;
  config.smallRiverTintSaturation = currentDraft.smallRiverTintSaturation;
  current.demo.setTerrainMaterialConfig(config);
}

function applyDraftWaterConfig(): void {
  const current = requireContext();
  current.demo.setWaterConfig(requireDraftConfig().water);
}

function buildDraftConfig(): DraftConfig {
  const current = requireContext();
  const config = current.demo.getTerrainConfig();
  return {
    seed: String(config.seed),
    useGeneratedTextures: current.demo.getUseGeneratedTextures(),
    worldMin: config.worldMin,
    worldMax: config.worldMax,
    worldSize: config.worldSize,
    chunksPerAxis: config.chunksPerAxis,
    chunkSize: config.chunkSize,
    baseHeight: config.baseHeight,
    maxHeight: config.maxHeight,
    waterLevel: current.demo.getWaterLevel(),
    water: { ...current.demo.getWaterConfig() },
    collisionRadius: current.demo.getCollisionRadius(),
    buildFoliage: config.buildFoliage,
    foliageRadius: current.demo.getFoliageRadius(),
    showFoliage: current.demo.getShowFoliage(),
    showPoi: current.demo.getTerrainConfig().features.poi,
    hidePoiMarkerMeshes: !current.demo.getPoiMarkerMeshesVisible(),
    hidePoiLabels: !current.demo.getPoiLabelsVisible(),
    showPoiFootprints: current.demo.getShowPoiFootprints(),
    poiDebug: current.demo.getPoiDebugConfig(),
    showRoads: current.demo.getTerrainConfig().features.roads,
    lodDistances: [...current.demo.getLodDistances()] as [number, number, number],
    materialThresholds: { ...current.demo.getTerrainMaterialThresholds() },
    materialScales: { ...current.demo.getTerrainMaterialConfig().scales },
    blendSharpness: current.demo.getTerrainMaterialConfig().blendSharpness,
    shorelineStartOffset: current.demo.getTerrainMaterialConfig().shorelineStartOffset,
    shorelineEndOffset: current.demo.getTerrainMaterialConfig().shorelineEndOffset,
    sedimentStrength: current.demo.getTerrainMaterialConfig().sedimentStrength,
    sedimentSandBias: current.demo.getTerrainMaterialConfig().sedimentSandBias,
    smallRiverTintStrength: current.demo.getTerrainMaterialConfig().smallRiverTintStrength,
    smallRiverTintBrightness: current.demo.getTerrainMaterialConfig().smallRiverTintBrightness,
    smallRiverTintSaturation: current.demo.getTerrainMaterialConfig().smallRiverTintSaturation,
    erosion: { ...config.erosion },
    features: { ...config.features },
    poi: { ...config.poi },
    rivers: { ...config.rivers },
    shape: { ...config.shape },
  };
}

function requireContext(): DemoBridgeContext {
  if (!context) {
    throw new Error("Demo bridge has not been initialized.");
  }
  return context;
}

function requireDraftConfig(): DraftConfig {
  if (!draftConfig) {
    throw new Error("Demo draft config has not been initialized.");
  }
  return draftConfig;
}

function publishSnapshot(): void {
  currentSnapshot = createSnapshot();
  snapshotListeners.forEach((listener) => listener());
}

function setTransientHudMessage(message: string, durationMs = 3000): void {
  transientHudMessage = message;
  renderHud();

  if (transientHudTimeoutId !== null) {
    window.clearTimeout(transientHudTimeoutId);
  }

  transientHudTimeoutId = window.setTimeout(() => {
    transientHudMessage = "";
    transientHudTimeoutId = null;
    renderHud();
  }, durationMs);
}

function createSnapshot(): DemoSnapshot {
  return {
    activePanelTab: getActivePanelTab(),
    featurePanelMount: document.getElementById("react-feature-panel"),
    featurePanelState: getFeaturePanelState(),
    featureStatusText: getFeatureBuildStatusText(),
    footerMount: document.getElementById("react-footer-status"),
    footerPerformanceMount: document.getElementById("react-footer-performance"),
    headerActionsMount: document.getElementById("react-header-actions"),
    headerTrailingActionsMount: document.getElementById("react-header-actions-trailing"),
    hudText: getHudText(),
    leftPanelMount: document.getElementById("react-left-panel"),
    materialTabState: getMaterialTabState(),
    performanceText: getPerformanceText(),
    presetOptions: getPresetOptionsData(),
    runtimeTabState: getRuntimeTabState(),
    worldTabState: getWorldTabState(),
  };
}

function formatPerformanceText(stats: TerrainDemo["getPerformanceStats"] extends () => infer TResult ? TResult : never): string {
  return [
    `FPS ${formatMetricValue(stats.fps)}`,
    `DC ${formatMetricValue(stats.drawCalls)}`,
    `Mesh ${formatMetricValue(stats.meshes)}`,
    `Active ${formatMetricValue(stats.activeMeshes)}`,
    `A-Vert ${formatMetricValue(stats.activeVertices)}`,
    `Vert ${formatMetricValue(stats.totalVertices)}`
  ].join(" | ");
}

function formatMetricValue(value: number): string {
  if (!Number.isFinite(value)) {
    return "--";
  }
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value >= 100 ? Math.round(value).toString() : value.toFixed(1).replace(/\.0$/, "");
}
