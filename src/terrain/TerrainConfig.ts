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
  readonly shape: TerrainShapeConfig;
}

export type TerrainConfigOverrides = Partial<
  Omit<TerrainConfig, "worldSize" | "totalChunks" | "shape">
> & {
  shape?: Partial<TerrainShapeConfig>;
};

export const DEFAULT_TERRAIN_SHAPE_CONFIG: TerrainShapeConfig = Object.freeze({
  continentFrequency: 0.00115,
  continentAmplitude: 72,
  continentBlend: 0.75,
  radialFalloffStrength: 0.65,
  mountainMaskFrequency: 0.0026,
  mountainMaskMin: 0.48,
  mountainMaskMax: 0.78,
  mountainFrequency: 0.009,
  mountainAmplitude: 118,
  hillFrequency: 0.0065,
  hillAmplitude: 42,
  detailFrequency: 0.031,
  detailAmplitude: 7,
  moistureFrequency: 0.0018,
  temperatureNoiseFrequency: 0.0023,
  temperatureNoiseStrength: 0.3
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
  baseHeight: -24,
  maxHeight: 220,
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
  const shape = Object.freeze({
    ...DEFAULT_TERRAIN_SHAPE_CONFIG,
    ...overrides.shape
  });

  if (worldSize !== 1024) {
    throw new Error(`Expected a 1024-unit world, received ${worldSize}.`);
  }

  if (chunksPerAxis !== 8) {
    throw new Error(`Expected 8 chunks per axis, received ${chunksPerAxis}.`);
  }

  if (chunkSize !== 128) {
    throw new Error(`Expected a chunk size of 128, received ${chunkSize}.`);
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
    shape
  });
}
