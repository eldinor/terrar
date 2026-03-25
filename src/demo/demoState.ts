import type {
  BuiltTerrainConfigOverrides as TerrainConfigOverrides,
  BuiltTerrainErosionConfig as TerrainErosionConfig,
  BuiltTerrainFeatureConfig as TerrainFeatureConfig,
  BuiltTerrainPoiConfig as TerrainPoiConfig,
  BuiltTerrainRiverConfig as TerrainRiverConfig,
  BuiltTerrainShapeConfig as TerrainShapeConfig,
} from "../builder";
import type {
  BabylonTerrainLayerThresholds as TerrainLayerThresholds,
  BabylonTerrainPoiDebugConfig as TerrainPoiDebugConfig,
  BabylonTerrainWaterConfig as TerrainWaterConfig,
} from "../adapters/babylon";
import type { TerrainMineResource, TerrainPoiKind } from "../terrain/TerrainPoiPlanner";

export interface TerrainPreset {
  readonly name: string;
  readonly config: TerrainConfigOverrides;
  readonly featureState?: PresetFeatureState;
}

export interface PresetFeatureState {
  readonly poiDebug: TerrainPoiDebugConfig;
  readonly hidePoiMarkerMeshes: boolean;
  readonly hidePoiLabels: boolean;
  readonly showPoiFootprints: boolean;
}

export interface DraftConfig {
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

export type MutableTerrainShapeConfig = {
  -readonly [Key in keyof TerrainShapeConfig]: TerrainShapeConfig[Key];
};

export type MutableTerrainErosionConfig = {
  -readonly [Key in keyof TerrainErosionConfig]: TerrainErosionConfig[Key];
};

export type MutableTerrainPoiConfig = {
  -readonly [Key in keyof TerrainPoiConfig]: TerrainPoiConfig[Key];
};

export type MutableTerrainFeatureConfig = {
  -readonly [Key in keyof TerrainFeatureConfig]: TerrainFeatureConfig[Key];
};

export type MutableTerrainPoiDebugConfig = {
  showScores: boolean;
  showRadii: boolean;
  showTags: boolean;
  kinds: Record<TerrainPoiKind, boolean>;
  mineResources: Record<TerrainMineResource, boolean>;
};

export type MutableTerrainRiverConfig = {
  -readonly [Key in keyof TerrainRiverConfig]: TerrainRiverConfig[Key];
};

export type MutableTerrainWaterConfig = {
  -readonly [Key in keyof TerrainWaterConfig]: TerrainWaterConfig[Key];
};

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
        resolution: 513,
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
        resolution: 513,
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

export function buildTerrainOverridesFromDraft(draftConfig: DraftConfig): TerrainConfigOverrides {
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

export function mergeDraftWithOverrides(base: DraftConfig, overrides: TerrainConfigOverrides): DraftConfig {
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

export function clonePoiDebugConfig(
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

export function clonePreset(preset: TerrainPreset): TerrainPreset {
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

export function buildPresetFromDraft(name: string, draftConfig: DraftConfig): TerrainPreset {
  return {
    name,
    config: buildTerrainOverridesFromDraft(draftConfig),
    featureState: {
      poiDebug: clonePoiDebugConfig(draftConfig.poiDebug),
      hidePoiMarkerMeshes: draftConfig.hidePoiMarkerMeshes,
      hidePoiLabels: draftConfig.hidePoiLabels,
      showPoiFootprints: draftConfig.showPoiFootprints,
    },
  };
}

export function getPresetOptions(defaultPoiDebug: MutableTerrainPoiDebugConfig): TerrainPreset[] {
  return [...BUILTIN_PRESETS, ...getSavedPresets(defaultPoiDebug)];
}

export function getSavedPresets(defaultPoiDebug: MutableTerrainPoiDebugConfig): TerrainPreset[] {
  const serialized = window.localStorage.getItem(SAVED_PRESETS_KEY);
  if (!serialized) {
    return [];
  }

  try {
    const parsed = JSON.parse(serialized) as unknown;
    return normalizeImportedPresets(parsed, defaultPoiDebug);
  } catch {
    return [];
  }
}

export function savePresets(presets: TerrainPreset[]): void {
  window.localStorage.setItem(SAVED_PRESETS_KEY, JSON.stringify(presets));
}

export function parseImportedPresets(
  serialized: string,
  defaultPoiDebug: MutableTerrainPoiDebugConfig,
): TerrainPreset[] {
  const parsed = JSON.parse(serialized) as unknown;
  const presets = normalizeImportedPresets(parsed, defaultPoiDebug);
  if (presets.length === 0) {
    throw new Error("The imported JSON does not contain any valid presets.");
  }
  return presets;
}

export function mergeImportedPresets(existing: TerrainPreset[], imported: TerrainPreset[]): TerrainPreset[] {
  const byName = new Map<string, TerrainPreset>();
  existing.forEach((preset) => byName.set(preset.name, preset));
  imported.forEach((preset) => byName.set(preset.name, preset));
  return [...byName.values()];
}

export function downloadJsonFile(filename: string, payload: TerrainPreset): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  downloadBlob(filename, blob);
}

export function downloadBinaryFile(
  filename: string,
  bytes: Uint8Array,
  mimeType: string,
): void {
  const blob = new Blob([new Uint8Array(bytes)], { type: mimeType });
  downloadBlob(filename, blob);
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

export function slugifyPresetName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "terrain-preset"
  );
}

export function clampErosionResolution(value: number): number {
  const rounded = Math.round(value);
  const clamped = Math.max(65, Math.min(513, rounded));
  return clamped % 2 === 0 ? clamped + 1 : clamped;
}

export function syncDraftWorldBounds(draftConfig: DraftConfig): void {
  draftConfig.worldSize = draftConfig.chunksPerAxis * draftConfig.chunkSize;
  draftConfig.worldMin = -draftConfig.worldSize * 0.5;
  draftConfig.worldMax = draftConfig.worldSize * 0.5;
}

export function retuneDraftForWorldSize(draftConfig: DraftConfig): void {
  const scale = Math.max(1, draftConfig.worldSize / 1024);
  const sqrtScale = Math.sqrt(scale);
  draftConfig.lodDistances = [
    roundToNearest(clamp(160 * sqrtScale, 160, 420), 10),
    roundToNearest(clamp(320 * sqrtScale, 320, 760), 10),
    roundToNearest(clamp(520 * sqrtScale, 520, 1200), 10),
  ];
  draftConfig.collisionRadius = roundToNearest(clamp(110 * scale, 110, 260), 5);
  draftConfig.foliageRadius = roundToNearest(clamp(180 * scale, 180, 420), 5);
  draftConfig.water.riverMeshMinWidth = clamp(2.2 * sqrtScale, 2.2, 4.8);
  draftConfig.water.riverMeshThreshold = clamp(0.032 / sqrtScale, 0.016, 0.04);
  draftConfig.poi.density = clamp(1 / scale, 0.45, 1.25);
  draftConfig.poi.spacing = clamp(1 * sqrtScale, 1, 1.85);
}

function normalizeImportedPresets(
  value: unknown,
  defaultPoiDebug: MutableTerrainPoiDebugConfig,
): TerrainPreset[] {
  const list = Array.isArray(value) ? value : isTerrainPresetRecord(value) ? [value] : [];
  return list.flatMap((entry) =>
    isTerrainPresetRecord(entry) ? [normalizePreset(entry, defaultPoiDebug)] : [],
  );
}

function normalizePreset(
  value: TerrainPresetRecord,
  defaultPoiDebug: MutableTerrainPoiDebugConfig,
): TerrainPreset {
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

function isTerrainPresetRecord(value: unknown): value is TerrainPresetRecord {
  return typeof value === "object" && value !== null && typeof (value as { name?: unknown }).name === "string";
}

function roundToNearest(value: number, step: number): number {
  return Math.round(value / step) * step;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
