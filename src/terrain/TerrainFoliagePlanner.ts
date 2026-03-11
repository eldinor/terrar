import { TerrainBiome } from "./TerrainBiome";
import { TerrainChunkData } from "./TerrainChunkData";
import { TerrainConfig } from "./TerrainConfig";

export const enum TerrainFoliageKind {
  Tree = 0,
  Bush = 1,
  Rock = 2
}

export interface TerrainFoliageCandidate {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly biome: TerrainBiome;
  readonly kind: TerrainFoliageKind;
  readonly scale: number;
  readonly yaw: number;
}

export class TerrainFoliagePlanner {
  private readonly seed: number;

  constructor(
    private readonly config: TerrainConfig,
    seed: number | string
  ) {
    this.seed = normalizeSeed(seed);
  }

  generateCandidates(chunkData: TerrainChunkData): TerrainFoliageCandidate[] {
    const grid = chunkData.getGrid(0);
    const candidates: TerrainFoliageCandidate[] = [];
    const stride = 6;

    for (let z = stride; z < grid.resolution - stride; z += stride) {
      for (let x = stride; x < grid.resolution - stride; x += stride) {
        const index = z * grid.resolution + x;
        const biome = grid.biomes[index];
        const slope = grid.slopes[index];
        const height = grid.heights[index];
        const moisture = grid.moisture[index];

        if (!shouldPlaceFoliage(biome, slope, height, this.config)) {
          continue;
        }

        const worldX = chunkData.minX + x * grid.step;
        const worldZ = chunkData.minZ + z * grid.step;
        const jitterX = (hashToUnitFloat(this.seed, worldX * 2, worldZ * 2) - 0.5) * grid.step * 0.9;
        const jitterZ = (hashToUnitFloat(this.seed, worldX * 3, worldZ * 3) - 0.5) * grid.step * 0.9;
        const density = hashToUnitFloat(this.seed, worldX * 5, worldZ * 5);
        const kindRoll = hashToUnitFloat(this.seed, worldX * 13, worldZ * 13);
        const threshold = biome === TerrainBiome.Forest ? 0.16 : biome === TerrainBiome.Grassland ? 0.1 : 0.08;

        if (density < threshold * (0.65 + moisture * 0.7)) {
          candidates.push({
            x: worldX + jitterX,
            y: height,
            z: worldZ + jitterZ,
            biome,
            kind: pickFoliageKind(biome, kindRoll),
            scale: 0.85 + hashToUnitFloat(this.seed, worldX * 7, worldZ * 7) * 0.35,
            yaw: hashToUnitFloat(this.seed, worldX * 11, worldZ * 11) * Math.PI * 2
          });
        }
      }
    }

    return candidates;
  }
}

function shouldPlaceFoliage(
  biome: TerrainBiome,
  slope: number,
  height: number,
  config: TerrainConfig
): boolean {
  if (height < config.waterLevel + 2 || slope > 0.42) {
    return false;
  }

  return biome === TerrainBiome.Forest || biome === TerrainBiome.Grassland || biome === TerrainBiome.Alpine;
}

function pickFoliageKind(
  biome: TerrainBiome,
  sample: number
): TerrainFoliageKind {
  if (biome === TerrainBiome.Alpine) {
    return sample > 0.35 ? TerrainFoliageKind.Rock : TerrainFoliageKind.Bush;
  }

  if (biome === TerrainBiome.Forest) {
    if (sample > 0.74) {
      return TerrainFoliageKind.Bush;
    }

    if (sample > 0.56) {
      return TerrainFoliageKind.Rock;
    }

    return TerrainFoliageKind.Tree;
  }

  if (sample > 0.68) {
    return TerrainFoliageKind.Rock;
  }

  if (sample > 0.34) {
    return TerrainFoliageKind.Bush;
  }

  return TerrainFoliageKind.Tree;
}

function normalizeSeed(seed: number | string): number {
  if (typeof seed === "number") {
    return seed | 0;
  }

  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash | 0;
}

function hashToUnitFloat(seed: number, x: number, z: number): number {
  const ix = Math.floor(x * 1000);
  const iz = Math.floor(z * 1000);
  let h = seed ^ Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}
