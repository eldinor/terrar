import { describe, expect, it } from "vitest";
import { ProceduralGenerator } from "../src/terrain/ProceduralGenerator";
import { TerrainChunkData } from "../src/terrain/TerrainChunkData";
import {
  DEFAULT_TERRAIN_CONFIG,
  mergeTerrainConfig,
  TerrainConfig,
  TerrainLODLevel
} from "../src/terrain/TerrainConfig";
import { TerrainFoliagePlanner } from "../src/terrain/TerrainFoliagePlanner";
import { TerrainPoiPlanner } from "../src/terrain/TerrainPoiPlanner";
import { TerrainRoadPlanner } from "../src/terrain/TerrainRoadPlanner";
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

  it("applies thermal erosion deterministically", () => {
    const config = mergeTerrainConfig({ seed: "erosion-seed" });
    const generatorA = new ProceduralGenerator(config);
    const generatorB = new ProceduralGenerator(config);

    const sampleA = generatorA.sample(-210.25, 167.75);
    const sampleB = generatorB.sample(-210.25, 167.75);

    expect(sampleA.height).toBeCloseTo(sampleB.height, 6);
  });

  it("changes terrain heights when erosion is disabled", () => {
    const configWithErosion = mergeTerrainConfig({ seed: "erosion-compare" });
    const configWithoutErosion = mergeTerrainConfig({
      seed: "erosion-compare",
      erosion: {
        enabled: false
      }
    });
    const eroded = new ProceduralGenerator(configWithErosion);
    const raw = new ProceduralGenerator(configWithoutErosion);

    const sample = { x: 144.5, z: -233.25 };
    const erodedHeight = eroded.sample(sample.x, sample.z).height;
    const rawHeight = raw.sample(sample.x, sample.z).height;

    expect(erodedHeight).not.toBeCloseTo(rawHeight, 3);
  });

  it("biases erosion transport downhill instead of only smoothing locally", () => {
    const config = mergeTerrainConfig({
      seed: "erosion-flow",
      erosion: {
        enabled: true,
        iterations: 32,
        talusHeight: 0.8,
        smoothing: 0.3
      }
    });
    const generator = new ProceduralGenerator(config);

    const ridge = generator.sample(90, -120).height;
    const downhill = generator.sample(104, -106).height;
    const lowerFan = generator.sample(118, -92).height;

    expect(ridge).toBeGreaterThan(downhill);
    expect(downhill).toBeGreaterThan(config.baseHeight);
    expect(lowerFan).toBeGreaterThan(config.baseHeight);
  });

  it("produces deterministic non-zero flow accumulation", () => {
    const config = mergeTerrainConfig({ seed: "flow-seed" });
    const generatorA = new ProceduralGenerator(config);
    const generatorB = new ProceduralGenerator(config);

    const sampleA = generatorA.sample(96, -144);
    const sampleB = generatorB.sample(96, -144);

    expect(sampleA.flow).toBeCloseTo(sampleB.flow, 6);
    expect(sampleA.flow).toBeGreaterThanOrEqual(0);
    expect(sampleA.flow).toBeLessThanOrEqual(1);
  });

  it("produces deterministic river strength in drainage channels", () => {
    const config = mergeTerrainConfig({
      seed: "river-seed",
      rivers: {
        enabled: true,
        flowThreshold: 0.72
      }
    });
    const generatorA = new ProceduralGenerator(config);
    const generatorB = new ProceduralGenerator(config);

    const point = findStrongRiverPoint(generatorA, config);
    const sampleA = generatorA.sample(point.x, point.z);
    const sampleB = generatorB.sample(point.x, point.z);

    expect(sampleA.river).toBeCloseTo(sampleB.river, 6);
    expect(sampleA.river).toBeGreaterThanOrEqual(0);
    expect(sampleA.river).toBeLessThanOrEqual(1);
    expect(sampleA.river).toBeGreaterThan(0.05);
  });

  it("carves terrain lower when rivers are enabled", () => {
    const withRivers = mergeTerrainConfig({
      seed: "river-carve",
      rivers: {
        enabled: true,
        flowThreshold: 0.7,
        depth: 2.4,
        maxDepth: 8
      }
    });
    const withoutRivers = mergeTerrainConfig({
      seed: "river-carve",
      rivers: {
        enabled: false
      }
    });
    const riverGenerator = new ProceduralGenerator(withRivers);
    const dryGenerator = new ProceduralGenerator(withoutRivers);

    const point = findStrongRiverPoint(riverGenerator, withRivers);
    const riverSample = riverGenerator.sample(point.x, point.z);
    const drySample = dryGenerator.sample(point.x, point.z);

    expect(riverSample.river).toBeGreaterThan(0.03);
    expect(riverSample.height).toBeLessThan(drySample.height);
  });

  it("produces deterministic lake basins when depressions are filled", () => {
    const config = mergeTerrainConfig({
      seed: "lake-seed",
      rivers: {
        enabled: true,
        flowThreshold: 0.68,
        bankStrength: 0.82,
        lakeThreshold: 0.55,
        maxDepth: 8,
        minElevation: 4
      }
    });
    const generatorA = new ProceduralGenerator(config);
    const generatorB = new ProceduralGenerator(config);

    const point = findStrongLakePoint(generatorA, config);
    const sampleA = generatorA.sample(point.x, point.z);
    const sampleB = generatorB.sample(point.x, point.z);

    expect(sampleA.lake).toBeCloseTo(sampleB.lake, 6);
    expect(sampleA.lake).toBeGreaterThanOrEqual(0);
    expect(sampleA.lake).toBeLessThanOrEqual(1);
    expect(sampleA.lake).toBeGreaterThan(0.03);
    expect(sampleA.lakeSurfaceHeight).toBeGreaterThanOrEqual(sampleA.height);
  });

  it("produces deterministic sediment deposition along channels and basins", () => {
    const config = mergeTerrainConfig({
      seed: "sediment-seed",
      rivers: {
        enabled: true,
        flowThreshold: 0.72,
        lakeThreshold: 0.8
      }
    });
    const generatorA = new ProceduralGenerator(config);
    const generatorB = new ProceduralGenerator(config);

    const riverPoint = findStrongRiverPoint(generatorA, config);
    const lakePoint = findStrongLakePoint(generatorA, config);
    const riverSampleA = generatorA.sample(riverPoint.x, riverPoint.z);
    const riverSampleB = generatorB.sample(riverPoint.x, riverPoint.z);
    const lakeSampleA = generatorA.sample(lakePoint.x, lakePoint.z);

    expect(riverSampleA.sediment).toBeCloseTo(riverSampleB.sediment, 6);
    expect(riverSampleA.sediment).toBeGreaterThanOrEqual(0);
    expect(riverSampleA.sediment).toBeLessThanOrEqual(1);
    expect(Math.max(riverSampleA.sediment, lakeSampleA.sediment)).toBeGreaterThan(0.05);
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

describe("POI planning", () => {
  it("produces deterministic POI sites for the same seed", () => {
    const config = mergeTerrainConfig({ seed: "poi-seed" });
    const generator = new ProceduralGenerator(config);
    const plannerA = new TerrainPoiPlanner(config, generator);
    const plannerB = new TerrainPoiPlanner(config, generator);

    expect(plannerA.generateSites()).toEqual(plannerB.generateSites());
  });

  it("produces non-zero POI sites for the default world", () => {
    const generator = new ProceduralGenerator(DEFAULT_TERRAIN_CONFIG);
    const planner = new TerrainPoiPlanner(DEFAULT_TERRAIN_CONFIG, generator);

    const sites = planner.generateSites();

    expect(sites.length).toBeGreaterThan(0);
    expect(new Set(sites.map((site) => site.kind)).size).toBeGreaterThan(1);
  });
});

describe("Road planning", () => {
  it("produces deterministic road routes for the same seed", () => {
    const config = mergeTerrainConfig({ seed: "road-seed" });
    const generator = new ProceduralGenerator(config);
    const poiPlanner = new TerrainPoiPlanner(config, generator);
    const roadsA = new TerrainRoadPlanner(config, generator).generateRoads(
      poiPlanner.generateSites()
    );
    const roadsB = new TerrainRoadPlanner(config, generator).generateRoads(
      poiPlanner.generateSites()
    );

    expect(roadsA).toEqual(roadsB);
  });

  it("produces non-zero roads for the default world", () => {
    const generator = new ProceduralGenerator(DEFAULT_TERRAIN_CONFIG);
    const pois = new TerrainPoiPlanner(DEFAULT_TERRAIN_CONFIG, generator).generateSites();
    const roads = new TerrainRoadPlanner(DEFAULT_TERRAIN_CONFIG, generator).generateRoads(
      pois
    );

    expect(roads.length).toBeGreaterThan(0);
    expect(roads.some((road) => road.points.length >= 2)).toBe(true);
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
      expect(firstGrid.river[firstIndex]).toBe(secondGrid.river[secondIndex]);
      expect(firstGrid.lake[firstIndex]).toBe(secondGrid.lake[secondIndex]);
      expect(firstGrid.sediment[firstIndex]).toBe(secondGrid.sediment[secondIndex]);
      expect(firstGrid.biomes[firstIndex]).toBe(secondGrid.biomes[secondIndex]);
    }
  });
}

function findStrongRiverPoint(
  generator: ProceduralGenerator,
  config: TerrainConfig
): { x: number; z: number } {
  let best = { x: 0, z: 0, river: -1 };
  const step = 32;

  for (let z = config.worldMin; z <= config.worldMax; z += step) {
    for (let x = config.worldMin; x <= config.worldMax; x += step) {
      const river = generator.sample(x, z).river;
      if (river > best.river) {
        best = { x, z, river };
      }
    }
  }

  return { x: best.x, z: best.z };
}

function findStrongLakePoint(
  generator: ProceduralGenerator,
  config: TerrainConfig
): { x: number; z: number } {
  let best = { x: 0, z: 0, lake: -1 };
  const step = 32;

  for (let z = config.worldMin; z <= config.worldMax; z += step) {
    for (let x = config.worldMin; x <= config.worldMax; x += step) {
      const lake = generator.sample(x, z).lake;
      if (lake > best.lake) {
        best = { x, z, lake };
      }
    }
  }

  return { x: best.x, z: best.z };
}
