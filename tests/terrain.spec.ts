import { describe, expect, it } from "vitest";
import { ProceduralGenerator } from "../src/terrain/ProceduralGenerator";
import { TerrainChunkData } from "../src/terrain/TerrainChunkData";
import {
  DEFAULT_TERRAIN_CONFIG,
  mergeTerrainConfig,
  TerrainLODLevel
} from "../src/terrain/TerrainConfig";
import { TerrainFoliagePlanner } from "../src/terrain/TerrainFoliagePlanner";
import {
  computeTerrainLayerWeights,
  DEFAULT_TERRAIN_MATERIAL_CONFIG
} from "../src/terrain/materials";

describe("Procedural terrain determinism", () => {
  it("returns identical samples for the same seed and coordinates", () => {
    const config = mergeTerrainConfig({ seed: "alpha-seed" });
    const generatorA = new ProceduralGenerator(config);
    const generatorB = new ProceduralGenerator(config);

    const sampleA = generatorA.sample(123.5, -78.25);
    const sampleB = generatorB.sample(123.5, -78.25);

    expect(sampleA).toEqual(sampleB);
  });

  it("returns different samples when the seed changes", () => {
    const generatorA = new ProceduralGenerator(
      mergeTerrainConfig({ seed: "alpha-seed" })
    );
    const generatorB = new ProceduralGenerator(
      mergeTerrainConfig({ seed: "beta-seed" })
    );

    const sampleA = generatorA.sample(123.5, -78.25);
    const sampleB = generatorB.sample(123.5, -78.25);

    expect(sampleA).not.toEqual(sampleB);
  });
});

describe("Chunk border continuity", () => {
  const config = DEFAULT_TERRAIN_CONFIG;
  const generator = new ProceduralGenerator(config);

  it("matches heights across horizontal chunk borders for every LOD", () => {
    const leftChunk = new TerrainChunkData(2, 3, config, generator);
    const rightChunk = new TerrainChunkData(3, 3, config, generator);

    assertSharedBorder(leftChunk, rightChunk, "horizontal");
  });

  it("matches heights across vertical chunk borders for every LOD", () => {
    const northChunk = new TerrainChunkData(4, 1, config, generator);
    const southChunk = new TerrainChunkData(4, 2, config, generator);

    assertSharedBorder(northChunk, southChunk, "vertical");
  });

  it("matches sampled surface normals across chunk borders", () => {
    const leftChunk = new TerrainChunkData(2, 3, config, generator);
    const rightChunk = new TerrainChunkData(3, 3, config, generator);

    ([0, 1, 2, 3] as TerrainLODLevel[]).forEach((lod) => {
      const grid = leftChunk.getGrid(lod);

      for (let sample = 0; sample < grid.resolution; sample += 1) {
        const worldX = leftChunk.maxX;
        const worldZ = leftChunk.minZ + sample * grid.step;
        const leftNormal = leftChunk.sampleSurfaceNormal(worldX, worldZ, grid.step);
        const rightNormal = rightChunk.sampleSurfaceNormal(worldX, worldZ, grid.step);

        expect(leftNormal.x).toBeCloseTo(rightNormal.x, 5);
        expect(leftNormal.y).toBeCloseTo(rightNormal.y, 5);
        expect(leftNormal.z).toBeCloseTo(rightNormal.z, 5);
      }
    });
  });

  it("samples exact chunk boundary coordinates from world space", () => {
    const chunk = new TerrainChunkData(1, 1, config, generator);
    const lod0 = chunk.getGrid(0);
    const lod3 = chunk.getGrid(3);

    expect(chunk.minX + (lod0.resolution - 1) * lod0.step).toBe(chunk.maxX);
    expect(chunk.minZ + (lod3.resolution - 1) * lod3.step).toBe(chunk.maxZ);
  });
});

describe("Foliage planning", () => {
  it("produces deterministic candidates for the same chunk and seed", () => {
    const config = mergeTerrainConfig({ seed: "foliage-seed" });
    const generator = new ProceduralGenerator(config);
    const chunkData = new TerrainChunkData(5, 5, config, generator);
    const plannerA = new TerrainFoliagePlanner(config, config.seed);
    const plannerB = new TerrainFoliagePlanner(config, config.seed);

    const candidatesA = plannerA.generateCandidates(chunkData);
    const candidatesB = plannerB.generateCandidates(chunkData);

    expect(candidatesA).toEqual(candidatesB);
  });

  it("changes foliage layout when the seed changes", () => {
    const configA = mergeTerrainConfig({ seed: "foliage-seed-a" });
    const configB = mergeTerrainConfig({ seed: "foliage-seed-b" });
    const generatorA = new ProceduralGenerator(configA);
    const generatorB = new ProceduralGenerator(configB);
    const chunkA = new TerrainChunkData(5, 5, configA, generatorA);
    const chunkB = new TerrainChunkData(5, 5, configB, generatorB);
    const plannerA = new TerrainFoliagePlanner(configA, configA.seed);
    const plannerB = new TerrainFoliagePlanner(configB, configB.seed);

    const candidatesA = plannerA.generateCandidates(chunkA);
    const candidatesB = plannerB.generateCandidates(chunkB);

    expect(candidatesA).not.toEqual(candidatesB);
  });

  it("produces non-zero foliage candidates for the default world", { timeout: 15000 }, () => {
    const config = DEFAULT_TERRAIN_CONFIG;
    const generator = new ProceduralGenerator(config);
    const planner = new TerrainFoliagePlanner(config, config.seed);
    let total = 0;
    let bushes = 0;
    let rocks = 0;

    for (let z = 0; z < config.chunksPerAxis; z += 1) {
      for (let x = 0; x < config.chunksPerAxis; x += 1) {
        const candidates = planner.generateCandidates(
          new TerrainChunkData(x, z, config, generator)
        );
        total += candidates.length;
        bushes += candidates.filter((candidate) => candidate.kind === 1).length;
        rocks += candidates.filter((candidate) => candidate.kind === 2).length;
      }
    }

    expect(total).toBeGreaterThan(0);
    expect(bushes).toBeGreaterThan(0);
    expect(rocks).toBeGreaterThan(0);
  });
});

describe("Terrain material weights", () => {
  it("normalizes weights for typical terrain samples", () => {
    const weights = computeTerrainLayerWeights(
      {
        height: 72,
        slope: 0.22,
        moisture: 0.5,
        temperature: 0.65
      },
      DEFAULT_TERRAIN_MATERIAL_CONFIG
    );

    const sum = weights.grass + weights.dirt + weights.rock + weights.snow;
    expect(sum).toBeCloseTo(1, 5);
  });

  it("favors rock on steep slopes", () => {
    const steep = computeTerrainLayerWeights({
      height: 95,
      slope: 0.92,
      moisture: 0.2,
      temperature: 0.4
    });

    expect(steep.rock).toBeGreaterThan(steep.grass);
    expect(steep.rock).toBeGreaterThan(steep.dirt);
  });

  it("favors snow at high elevation", () => {
    const alpine = computeTerrainLayerWeights({
      height: 190,
      slope: 0.18,
      moisture: 0.3,
      temperature: 0.1
    });

    expect(alpine.snow).toBeGreaterThan(0.7);
  });
});

function assertSharedBorder(
  firstChunk: TerrainChunkData,
  secondChunk: TerrainChunkData,
  direction: "horizontal" | "vertical"
): void {
  ([0, 1, 2, 3] as TerrainLODLevel[]).forEach((lod) => {
    const firstGrid = firstChunk.getGrid(lod);
    const secondGrid = secondChunk.getGrid(lod);

    for (let sample = 0; sample < firstGrid.resolution; sample += 1) {
      const firstIndex =
        direction === "horizontal"
          ? sample * firstGrid.resolution + (firstGrid.resolution - 1)
          : (firstGrid.resolution - 1) * firstGrid.resolution + sample;
      const secondIndex =
        direction === "horizontal" ? sample * secondGrid.resolution : sample;

      expect(firstGrid.heights[firstIndex]).toBe(secondGrid.heights[secondIndex]);
      expect(firstGrid.moisture[firstIndex]).toBe(secondGrid.moisture[secondIndex]);
      expect(firstGrid.temperature[firstIndex]).toBe(secondGrid.temperature[secondIndex]);
      expect(firstGrid.biomes[firstIndex]).toBe(secondGrid.biomes[secondIndex]);
    }
  });
}
