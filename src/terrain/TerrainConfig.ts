export const TERRAIN_LOD_RESOLUTIONS = [129, 65, 33, 17] as const;

export type TerrainLODLevel = 0 | 1 | 2 | 3;

export interface TerrainShapeConfig {
  readonly continentFrequency: number;
  readonly continentAmplitude: number;
  readonly continentBlend: number;
  readonly radialFalloffStrength: number;
  readonly mountainMaskFrequency: number;
  readonly mountainMaskMin: number;
  readonly mountainMaskMax: number;
  readonly mountainFrequency: number;
  readonly mountainAmplitude: number;
  readonly hillFrequency: number;
  readonly hillAmplitude: number;
  readonly detailFrequency: number;
  readonly detailAmplitude: number;
  readonly moistureFrequency: number;
  readonly temperatureNoiseFrequency: number;
  readonly temperatureNoiseStrength: number;
}

export interface TerrainErosionConfig {
  readonly enabled: boolean;
  readonly resolution: number;
  readonly iterations: number;
  readonly talusHeight: number;
  readonly smoothing: number;
}

export interface TerrainRiverConfig {
  readonly enabled: boolean;
  readonly resolution: number;
  readonly flowThreshold: number;
  readonly bankStrength: number;
  readonly lakeThreshold: number;
  readonly depth: number;
  readonly maxDepth: number;
  readonly minSlope: number;
  readonly minElevation: number;
}

export interface TerrainPoiConfig {
  readonly density: number;
  readonly spacing: number;
}

export interface TerrainFeatureConfig {
  readonly poi: boolean;
  readonly roads: boolean;
}

export interface TerrainConfig {
  readonly seed: number | string;
  readonly worldMin: number;
  readonly worldMax: number;
  readonly worldSize: number;
  readonly chunksPerAxis: number;
  readonly totalChunks: number;
  readonly chunkSize: number;
  readonly lodResolutions: readonly [129, 65, 33, 17];
  readonly lodDistances: readonly [number, number, number];
  readonly foliageLodDistances: readonly [number, number];
  readonly collisionRadius: number;
  readonly foliageRadius: number;
  readonly waterLevel: number;
  readonly skirtDepth: number;
  readonly baseHeight: number;
  readonly maxHeight: number;
  readonly features: TerrainFeatureConfig;
  readonly erosion: TerrainErosionConfig;
  readonly rivers: TerrainRiverConfig;
  readonly poi: TerrainPoiConfig;
  readonly shape: TerrainShapeConfig;
}

export type TerrainConfigOverrides = Partial<
  Omit<
    TerrainConfig,
    "worldSize" | "totalChunks" | "shape" | "erosion" | "rivers" | "poi" | "features"
  >
> & {
  shape?: Partial<TerrainShapeConfig>;
  erosion?: Partial<TerrainErosionConfig>;
  rivers?: Partial<TerrainRiverConfig>;
  poi?: Partial<TerrainPoiConfig>;
  features?: Partial<TerrainFeatureConfig>;
};

export const DEFAULT_TERRAIN_SHAPE_CONFIG: TerrainShapeConfig = Object.freeze({
  continentFrequency: 0.00115,
  continentAmplitude: 82,
  continentBlend: 0.75,
  radialFalloffStrength: 0.65,
  mountainMaskFrequency: 0.0026,
  mountainMaskMin: 0.46,
  mountainMaskMax: 0.8,
  mountainFrequency: 0.0082,
  mountainAmplitude: 132,
  hillFrequency: 0.0062,
  hillAmplitude: 44,
  detailFrequency: 0.031,
  detailAmplitude: 6.5,
  moistureFrequency: 0.0018,
  temperatureNoiseFrequency: 0.0023,
  temperatureNoiseStrength: 0.3
});

export const DEFAULT_TERRAIN_EROSION_CONFIG: TerrainErosionConfig = Object.freeze({
  enabled: true,
  resolution: 257,
  iterations: 10,
  talusHeight: 1.7,
  smoothing: 0.14
});

export const DEFAULT_TERRAIN_RIVER_CONFIG: TerrainRiverConfig = Object.freeze({
  enabled: true,
  resolution: 257,
  flowThreshold: 0.82,
  bankStrength: 0.54,
  lakeThreshold: 1.55,
  depth: 1.8,
  maxDepth: 5.5,
  minSlope: 0.026,
  minElevation: 12
});

export const DEFAULT_TERRAIN_POI_CONFIG: TerrainPoiConfig = Object.freeze({
  density: 0.8,
  spacing: 1.1
});

export const DEFAULT_TERRAIN_FEATURE_CONFIG: TerrainFeatureConfig = Object.freeze({
  poi: false,
  roads: false
});

export const DEFAULT_TERRAIN_CONFIG: TerrainConfig = Object.freeze({
  seed: 1337,
  worldMin: -512,
  worldMax: 512,
  worldSize: 1024,
  chunksPerAxis: 8,
  totalChunks: 64,
  chunkSize: 128,
  lodResolutions: TERRAIN_LOD_RESOLUTIONS,
  lodDistances: [160, 320, 520] as const,
  foliageLodDistances: [240, 420] as const,
  collisionRadius: 220,
  foliageRadius: 700,
  waterLevel: 0,
  skirtDepth: 12,
  baseHeight: -18,
  maxHeight: 260,
  features: DEFAULT_TERRAIN_FEATURE_CONFIG,
  erosion: DEFAULT_TERRAIN_EROSION_CONFIG,
  rivers: DEFAULT_TERRAIN_RIVER_CONFIG,
  poi: DEFAULT_TERRAIN_POI_CONFIG,
  shape: DEFAULT_TERRAIN_SHAPE_CONFIG
});

export function mergeTerrainConfig(
  overrides: TerrainConfigOverrides = {}
): TerrainConfig {
  const worldMin = overrides.worldMin ?? DEFAULT_TERRAIN_CONFIG.worldMin;
  const worldMax = overrides.worldMax ?? DEFAULT_TERRAIN_CONFIG.worldMax;
  const chunksPerAxis =
    overrides.chunksPerAxis ?? DEFAULT_TERRAIN_CONFIG.chunksPerAxis;
  const chunkSize = overrides.chunkSize ?? DEFAULT_TERRAIN_CONFIG.chunkSize;
  const worldSize = worldMax - worldMin;
  const totalChunks = chunksPerAxis * chunksPerAxis;
  const erosion = Object.freeze({
    ...DEFAULT_TERRAIN_EROSION_CONFIG,
    ...overrides.erosion
  });
  const rivers = Object.freeze({
    ...DEFAULT_TERRAIN_RIVER_CONFIG,
    ...overrides.rivers
  });
  const poi = Object.freeze({
    ...DEFAULT_TERRAIN_POI_CONFIG,
    ...overrides.poi
  });
  const features = Object.freeze({
    ...DEFAULT_TERRAIN_FEATURE_CONFIG,
    ...overrides.features
  });
  const shape = Object.freeze({
    ...DEFAULT_TERRAIN_SHAPE_CONFIG,
    ...overrides.shape
  });
  const expectedWorldSize = chunksPerAxis * chunkSize;

  if (worldSize !== expectedWorldSize) {
    throw new Error(
      `Expected world size ${expectedWorldSize} from ${chunksPerAxis} chunks at size ${chunkSize}, received ${worldSize}.`
    );
  }

  if (chunksPerAxis < 2 || !Number.isInteger(chunksPerAxis)) {
    throw new Error(`Expected an integer chunksPerAxis >= 2, received ${chunksPerAxis}.`);
  }

  if (chunkSize < 32) {
    throw new Error(`Expected a chunk size >= 32, received ${chunkSize}.`);
  }

  if (worldMin >= worldMax) {
    throw new Error(`Expected worldMin < worldMax, received ${worldMin} and ${worldMax}.`);
  }

  return Object.freeze({
    seed: overrides.seed ?? DEFAULT_TERRAIN_CONFIG.seed,
    worldMin,
    worldMax,
    worldSize,
    chunksPerAxis,
    totalChunks,
    chunkSize,
    lodResolutions: DEFAULT_TERRAIN_CONFIG.lodResolutions,
    lodDistances: (overrides.lodDistances ??
      DEFAULT_TERRAIN_CONFIG.lodDistances) as TerrainConfig["lodDistances"],
    foliageLodDistances: (overrides.foliageLodDistances ??
      DEFAULT_TERRAIN_CONFIG.foliageLodDistances) as TerrainConfig["foliageLodDistances"],
    collisionRadius:
      overrides.collisionRadius ?? DEFAULT_TERRAIN_CONFIG.collisionRadius,
    foliageRadius:
      overrides.foliageRadius ?? DEFAULT_TERRAIN_CONFIG.foliageRadius,
    waterLevel: overrides.waterLevel ?? DEFAULT_TERRAIN_CONFIG.waterLevel,
    skirtDepth: overrides.skirtDepth ?? DEFAULT_TERRAIN_CONFIG.skirtDepth,
    baseHeight: overrides.baseHeight ?? DEFAULT_TERRAIN_CONFIG.baseHeight,
    maxHeight: overrides.maxHeight ?? DEFAULT_TERRAIN_CONFIG.maxHeight,
    features,
    erosion,
    rivers,
    poi,
    shape
  });
}
