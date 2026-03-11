import {
  DEFAULT_TERRAIN_MATERIAL_CONFIG,
  TerrainMaterialConfig
} from "./TerrainMaterialConfig";

export interface TerrainSurfaceInput {
  height: number;
  slope: number;
  moisture: number;
  temperature: number;
  biome?: string;
}

export interface TerrainLayerWeights {
  grass: number;
  dirt: number;
  rock: number;
  snow: number;
}

export function computeTerrainLayerWeights(
  input: TerrainSurfaceInput,
  config: TerrainMaterialConfig = DEFAULT_TERRAIN_MATERIAL_CONFIG
): TerrainLayerWeights {
  const slope = saturate(input.slope);
  const materialSlope = Math.pow(slope, 1.35);
  const height = input.height;
  const thresholds = config.thresholds;

  const rock = smoothstep(
    thresholds.rockSlopeStart,
    thresholds.rockSlopeFull,
    materialSlope
  );
  const snow = smoothstep(
    thresholds.snowStartHeight,
    thresholds.snowFullHeight,
    height
  );

  const grassSlopeFavor =
    1 -
    smoothstep(
      thresholds.grassMaxSlope * 0.35,
      thresholds.grassMaxSlope,
      materialSlope
    );
  const grassHeightFavor =
    1 -
    smoothstep(
      thresholds.snowStartHeight * 0.6,
      thresholds.snowStartHeight,
      height
    );
  let grass = grassSlopeFavor * grassHeightFavor * (1 - rock) * (1 - snow);

  const dirtLowlandFavor =
    1 -
    smoothstep(
      thresholds.dirtLowHeight,
      thresholds.dirtHighHeight,
      height
    );
  const dirtSlopeFavor =
    smoothstep(0.08, thresholds.rockSlopeStart + 0.08, materialSlope) * (1 - rock * 0.7);
  let dirt =
    Math.max(dirtLowlandFavor * 0.8, dirtSlopeFavor * 0.65) *
    (1 - snow) *
    (1 - rock * 0.45);

  const sum = grass + dirt + rock + snow;
  if (sum < 0.0001) {
    grass = 0;
    dirt = 1;
    return { grass, dirt, rock: 0, snow: 0 };
  }

  return {
    grass: grass / sum,
    dirt: dirt / sum,
    rock: rock / sum,
    snow: snow / sum
  };
}

function saturate(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) {
    return value >= edge1 ? 1 : 0;
  }

  const t = saturate((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
