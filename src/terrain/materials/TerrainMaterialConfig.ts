export interface TerrainLayerThresholds {
  rockSlopeStart: number;
  rockSlopeFull: number;
  snowStartHeight: number;
  snowFullHeight: number;
  grassMaxSlope: number;
  dirtLowHeight: number;
  dirtHighHeight: number;
}

export interface TerrainTextureScaleConfig {
  grassScale: number;
  dirtScale: number;
  sandScale: number;
  rockScale: number;
  snowScale: number;
  macroScale: number;
  antiTileStrength: number;
}

export interface TerrainMaterialConfig {
  thresholds: TerrainLayerThresholds;
  scales: TerrainTextureScaleConfig;
  shorelineStartOffset: number;
  shorelineEndOffset: number;
  sedimentStrength: number;
  sedimentSandBias: number;
  smallRiverTintStrength: number;
  smallRiverTintBrightness: number;
  smallRiverTintSaturation: number;
  blendSharpness: number;
  triplanarSharpness: number;
  normalStrength: number;
  debugMode: number;
}

export const DEFAULT_TERRAIN_MATERIAL_CONFIG: TerrainMaterialConfig = Object.freeze({
  thresholds: Object.freeze({
    rockSlopeStart: 0.34,
    rockSlopeFull: 0.82,
    snowStartHeight: 92,
    snowFullHeight: 138,
    grassMaxSlope: 0.46,
    dirtLowHeight: -24,
    dirtHighHeight: 58
  }),
  scales: Object.freeze({
    grassScale: 0.11,
    dirtScale: 0.1,
    sandScale: 0.09,
    rockScale: 0.08,
    snowScale: 0.07,
    macroScale: 0.008,
    antiTileStrength: 0.6
  }),
  shorelineStartOffset: 1.5,
  shorelineEndOffset: 16,
  sedimentStrength: 1,
  sedimentSandBias: 0.4,
  smallRiverTintStrength: 1.05,
  smallRiverTintBrightness: 1.15,
  smallRiverTintSaturation: 1.1,
  blendSharpness: 1.2,
  triplanarSharpness: 4,
  normalStrength: 1,
  debugMode: 0
});

export function createTerrainMaterialConfigForHeightRange(
  minHeight: number,
  maxHeight: number
): TerrainMaterialConfig {
  const range = Math.max(maxHeight - minHeight, 1);

  return {
    ...DEFAULT_TERRAIN_MATERIAL_CONFIG,
    thresholds: {
      rockSlopeStart: 0.34,
      rockSlopeFull: 0.82,
      snowStartHeight: minHeight + range * 0.56,
      snowFullHeight: minHeight + range * 0.76,
      grassMaxSlope: 0.46,
      dirtLowHeight: minHeight,
      dirtHighHeight: minHeight + range * 0.34
    },
    scales: {
      ...DEFAULT_TERRAIN_MATERIAL_CONFIG.scales
    },
    shorelineStartOffset: DEFAULT_TERRAIN_MATERIAL_CONFIG.shorelineStartOffset,
    shorelineEndOffset: DEFAULT_TERRAIN_MATERIAL_CONFIG.shorelineEndOffset,
    sedimentStrength: DEFAULT_TERRAIN_MATERIAL_CONFIG.sedimentStrength,
    sedimentSandBias: DEFAULT_TERRAIN_MATERIAL_CONFIG.sedimentSandBias,
    smallRiverTintStrength: DEFAULT_TERRAIN_MATERIAL_CONFIG.smallRiverTintStrength,
    smallRiverTintBrightness:
      DEFAULT_TERRAIN_MATERIAL_CONFIG.smallRiverTintBrightness,
    smallRiverTintSaturation:
      DEFAULT_TERRAIN_MATERIAL_CONFIG.smallRiverTintSaturation,
    blendSharpness: DEFAULT_TERRAIN_MATERIAL_CONFIG.blendSharpness,
    triplanarSharpness: DEFAULT_TERRAIN_MATERIAL_CONFIG.triplanarSharpness,
    normalStrength: DEFAULT_TERRAIN_MATERIAL_CONFIG.normalStrength,
    debugMode: DEFAULT_TERRAIN_MATERIAL_CONFIG.debugMode
  };
}

export function cloneTerrainMaterialConfig(
  config: TerrainMaterialConfig
): TerrainMaterialConfig {
  return {
    thresholds: { ...config.thresholds },
    scales: { ...config.scales },
    shorelineStartOffset: config.shorelineStartOffset,
    shorelineEndOffset: config.shorelineEndOffset,
    sedimentStrength: config.sedimentStrength,
    sedimentSandBias: config.sedimentSandBias,
    smallRiverTintStrength: config.smallRiverTintStrength,
    smallRiverTintBrightness: config.smallRiverTintBrightness,
    smallRiverTintSaturation: config.smallRiverTintSaturation,
    blendSharpness: config.blendSharpness,
    triplanarSharpness: config.triplanarSharpness,
    normalStrength: config.normalStrength,
    debugMode: config.debugMode
  };
}
