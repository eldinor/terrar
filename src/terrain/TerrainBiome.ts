import { TerrainConfig } from "./TerrainConfig";
import { TerrainSample } from "./ProceduralGenerator";

export const enum TerrainBiome {
  Ocean = 0,
  Beach = 1,
  Grassland = 2,
  Forest = 3,
  Rocky = 4,
  Alpine = 5,
  Snow = 6
}

export function classifyTerrainBiome(
  sample: TerrainSample,
  slope: number,
  config: TerrainConfig
): TerrainBiome {
  const normalizedHeight =
    (sample.height - config.baseHeight) / (config.maxHeight - config.baseHeight);
  const shorelineBand = config.waterLevel + 4;

  if (sample.height < config.waterLevel) {
    return TerrainBiome.Ocean;
  }

  if (sample.height < shorelineBand) {
    return TerrainBiome.Beach;
  }

  if (slope > 0.58) {
    return normalizedHeight > 0.7 ? TerrainBiome.Alpine : TerrainBiome.Rocky;
  }

  if (normalizedHeight > 0.78 || (normalizedHeight > 0.6 && sample.temperature < 0.28)) {
    return TerrainBiome.Snow;
  }

  if (normalizedHeight > 0.62) {
    return TerrainBiome.Alpine;
  }

  if (sample.moisture > 0.58) {
    return TerrainBiome.Forest;
  }

  return TerrainBiome.Grassland;
}

export function getBiomeName(biome: TerrainBiome): string {
  switch (biome) {
    case TerrainBiome.Ocean:
      return "ocean";
    case TerrainBiome.Beach:
      return "beach";
    case TerrainBiome.Grassland:
      return "grassland";
    case TerrainBiome.Forest:
      return "forest";
    case TerrainBiome.Rocky:
      return "rocky";
    case TerrainBiome.Alpine:
      return "alpine";
    case TerrainBiome.Snow:
      return "snow";
  }
}
