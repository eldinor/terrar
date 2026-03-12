import { ProceduralGenerator } from "./ProceduralGenerator";
import { classifyTerrainBiome, TerrainBiome } from "./TerrainBiome";
import { TerrainConfig, TerrainLODLevel } from "./TerrainConfig";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";

export interface TerrainSampleGrid {
  readonly resolution: number;
  readonly step: number;
  readonly heights: Float32Array;
  readonly rawHeights: Float32Array;
  readonly erosionDeltas: Float32Array;
  readonly flow: Float32Array;
  readonly river: Float32Array;
  readonly lake: Float32Array;
  readonly sediment: Float32Array;
  readonly moisture: Float32Array;
  readonly temperature: Float32Array;
  readonly slopes: Float32Array;
  readonly biomes: Uint8Array;
  readonly shoreProximity: Float32Array;
  readonly waterDepth: Float32Array;
}

export class TerrainChunkData {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly centerX: number;
  readonly centerZ: number;
  readonly centerHeight: number;
  readonly grids: ReadonlyMap<TerrainLODLevel, TerrainSampleGrid>;

  constructor(
    readonly chunkX: number,
    readonly chunkZ: number,
    private readonly config: TerrainConfig,
    private readonly generator: ProceduralGenerator
  ) {
    this.minX = config.worldMin + chunkX * config.chunkSize;
    this.maxX = this.minX + config.chunkSize;
    this.minZ = config.worldMin + chunkZ * config.chunkSize;
    this.maxZ = this.minZ + config.chunkSize;
    this.centerX = this.minX + config.chunkSize * 0.5;
    this.centerZ = this.minZ + config.chunkSize * 0.5;
    this.centerHeight = generator.sample(this.centerX, this.centerZ).height;
    this.grids = this.generateAllLods();
  }

  getGrid(lod: TerrainLODLevel): TerrainSampleGrid {
    const grid = this.grids.get(lod);
    if (!grid) {
      throw new Error(`Missing terrain grid for LOD ${lod}.`);
    }
    return grid;
  }

  sampleSurfaceNormal(x: number, z: number, sampleStep: number): Vector3 {
    const left = this.generator.sample(x - sampleStep, z).height;
    const right = this.generator.sample(x + sampleStep, z).height;
    const down = this.generator.sample(x, z - sampleStep).height;
    const up = this.generator.sample(x, z + sampleStep).height;
    const gradientX = (right - left) / (sampleStep * 2);
    const gradientZ = (up - down) / (sampleStep * 2);
    return new Vector3(-gradientX, 1, -gradientZ).normalize();
  }

  private generateAllLods(): ReadonlyMap<TerrainLODLevel, TerrainSampleGrid> {
    const grids = new Map<TerrainLODLevel, TerrainSampleGrid>();

    this.config.lodResolutions.forEach((resolution, index) => {
      grids.set(index as TerrainLODLevel, this.generateGrid(resolution));
    });

    return grids;
  }

  private generateGrid(resolution: number): TerrainSampleGrid {
    const vertexCount = resolution * resolution;
    const step = this.config.chunkSize / (resolution - 1);
    const heights = new Float32Array(vertexCount);
    const rawHeights = new Float32Array(vertexCount);
    const erosionDeltas = new Float32Array(vertexCount);
    const flow = new Float32Array(vertexCount);
    const river = new Float32Array(vertexCount);
    const lake = new Float32Array(vertexCount);
    const sediment = new Float32Array(vertexCount);
    const moisture = new Float32Array(vertexCount);
    const temperature = new Float32Array(vertexCount);
    const slopes = new Float32Array(vertexCount);
    const biomes = new Uint8Array(vertexCount);
    const shoreProximity = new Float32Array(vertexCount);
    const waterDepth = new Float32Array(vertexCount);

    for (let z = 0; z < resolution; z += 1) {
      for (let x = 0; x < resolution; x += 1) {
        const sampleX = this.minX + x * step;
        const sampleZ = this.minZ + z * step;
        const sample = this.generator.sample(sampleX, sampleZ);
        const rawHeight = this.generator.sampleBaseTerrainHeight(sampleX, sampleZ);
        const index = this.toIndex(x, z, resolution);
        heights[index] = sample.height;
        rawHeights[index] = rawHeight;
        erosionDeltas[index] = rawHeight - sample.height;
        flow[index] = sample.flow;
        river[index] = sample.river;
        lake[index] = sample.lake;
        sediment[index] = sample.sediment;
        moisture[index] = sample.moisture;
        temperature[index] = sample.temperature;
        waterDepth[index] = Math.max(0, this.config.waterLevel - sample.height);
      }
    }

    for (let z = 0; z < resolution; z += 1) {
      for (let x = 0; x < resolution; x += 1) {
        const sampleX = this.minX + x * step;
        const sampleZ = this.minZ + z * step;
        const left = this.generator.sample(sampleX - step, sampleZ).height;
        const right = this.generator.sample(sampleX + step, sampleZ).height;
        const down = this.generator.sample(sampleX, sampleZ - step).height;
        const up = this.generator.sample(sampleX, sampleZ + step).height;
        const gradientX = (right - left) / (step * 2);
        const gradientZ = (up - down) / (step * 2);
        const slope = Math.atan(Math.sqrt(gradientX * gradientX + gradientZ * gradientZ));
        const normalizedSlope = slope / (Math.PI * 0.5);
        const index = this.toIndex(x, z, resolution);
        slopes[index] = normalizedSlope;
        biomes[index] = classifyTerrainBiome(
          {
            height: heights[index],
            moisture: moisture[index],
            temperature: temperature[index],
            flow: flow[index],
            river: river[index],
            lake: lake[index],
            sediment: sediment[index],
            lakeSurfaceHeight: heights[index]
          },
          normalizedSlope,
          this.config
        ) as number;
        shoreProximity[index] = this.computeShoreProximity(
          heights,
          x,
          z,
          resolution
        );
      }
    }

    return {
      resolution,
      step,
      heights,
      rawHeights,
      erosionDeltas,
      flow,
      river,
      lake,
      sediment,
      moisture,
      temperature,
      slopes,
      biomes,
      shoreProximity,
      waterDepth
    };
  }

  private toIndex(x: number, z: number, resolution: number): number {
    return z * resolution + x;
  }

  private computeShoreProximity(
    heights: Float32Array,
    x: number,
    z: number,
    resolution: number
  ): number {
    const radius = 2;
    let bestDistance = Number.POSITIVE_INFINITY;
    const centerHeight = heights[this.toIndex(x, z, resolution)];
    const centerAboveWater = centerHeight >= this.config.waterLevel;

    for (let offsetZ = -radius; offsetZ <= radius; offsetZ += 1) {
      for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
        if (offsetX === 0 && offsetZ === 0) {
          continue;
        }

        const sampleX = Math.min(resolution - 1, Math.max(0, x + offsetX));
        const sampleZ = Math.min(resolution - 1, Math.max(0, z + offsetZ));
        const sampleHeight = heights[this.toIndex(sampleX, sampleZ, resolution)];
        const sampleAboveWater = sampleHeight >= this.config.waterLevel;

        if (sampleAboveWater !== centerAboveWater) {
          bestDistance = Math.min(
            bestDistance,
            Math.sqrt(offsetX * offsetX + offsetZ * offsetZ)
          );
        }
      }
    }

    if (bestDistance === Number.POSITIVE_INFINITY) {
      return 0;
    }

    return 1 - Math.min(bestDistance / (Math.sqrt(8) + 0.0001), 1);
  }
}
