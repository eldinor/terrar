import { Scalar } from "@babylonjs/core/Maths/math.scalar";
import { TerrainConfig } from "./TerrainConfig";

export interface TerrainSample {
  readonly height: number;
  readonly moisture: number;
  readonly temperature: number;
  readonly flow: number;
  readonly river: number;
  readonly lake: number;
  readonly lakeSurfaceHeight: number;
  readonly sediment: number;
  readonly coal: number;
  readonly iron: number;
  readonly copper: number;
}

export interface ProceduralGeneratorSnapshot {
  readonly analysisResolution: number;
  readonly analysisStep: number;
  readonly terrainHeightField: Float32Array | null;
  readonly flowField: Float32Array | null;
  readonly riverField: Float32Array | null;
  readonly lakeField: Float32Array | null;
  readonly lakeSurfaceField: Float32Array | null;
  readonly sedimentField: Float32Array | null;
  readonly coalField: Float32Array | null;
  readonly ironField: Float32Array | null;
  readonly copperField: Float32Array | null;
}

interface FbmOptions {
  readonly frequency: number;
  readonly octaves: number;
  readonly lacunarity: number;
  readonly gain: number;
}

export class ProceduralGenerator {
  private readonly seed: number;
  private readonly worldHalfExtent: number;
  private readonly terrainHeightField: Float32Array | null;
  private readonly flowField: Float32Array | null;
  private readonly riverField: Float32Array | null;
  private readonly lakeField: Float32Array | null;
  private readonly lakeSurfaceField: Float32Array | null;
  private readonly sedimentField: Float32Array | null;
  private readonly coalField: Float32Array | null;
  private readonly ironField: Float32Array | null;
  private readonly copperField: Float32Array | null;
  private readonly analysisResolution: number;
  private readonly analysisStep: number;

  constructor(
    private readonly config: TerrainConfig,
    snapshot: ProceduralGeneratorSnapshot | null = null
  ) {
    this.seed = normalizeSeed(config.seed);
    this.worldHalfExtent = config.worldSize * 0.5;
    this.analysisResolution =
      snapshot?.analysisResolution ??
      Math.max(2, Math.max(config.erosion.resolution, config.rivers.resolution) | 0);
    this.analysisStep =
      snapshot?.analysisStep ??
      (config.worldSize / (this.analysisResolution - 1));

    if (snapshot) {
      this.terrainHeightField = cloneField(snapshot.terrainHeightField);
      this.flowField = cloneField(snapshot.flowField);
      this.riverField = cloneField(snapshot.riverField);
      this.lakeField = cloneField(snapshot.lakeField);
      this.lakeSurfaceField = cloneField(snapshot.lakeSurfaceField);
      this.sedimentField = cloneField(snapshot.sedimentField);
      this.coalField = cloneField(snapshot.coalField);
      this.ironField = cloneField(snapshot.ironField);
      this.copperField = cloneField(snapshot.copperField);
      return;
    }

    const usesCachedHeightfield =
      config.erosion.enabled || config.rivers.enabled || config.features.poi;
    if (!usesCachedHeightfield) {
      this.terrainHeightField = null;
      this.flowField = null;
      this.riverField = null;
      this.lakeField = null;
      this.lakeSurfaceField = null;
      this.sedimentField = null;
      this.coalField = null;
      this.ironField = null;
      this.copperField = null;
      return;
    }

    const heights = this.buildHeightField();
    if (config.erosion.enabled) {
      applyThermalErosionInPlace(heights, this.analysisResolution, config);
    }

    if (config.rivers.enabled) {
      const hydrology = buildHydrologyFields(
        heights,
        this.analysisResolution,
        config
      );
      this.flowField = hydrology.flow;
      this.lakeField = hydrology.lake;
      this.lakeSurfaceField = hydrology.filledHeights;
      this.riverField = buildRiverField(
        heights,
        hydrology.filledHeights,
        hydrology.flow,
        hydrology.lake,
        hydrology.receivers,
        this.analysisResolution,
        config
      );
      applyHydraulicChannelErosionInPlace(
        heights,
        hydrology.flow,
        this.riverField,
        hydrology.lake,
        hydrology.receivers,
        this.analysisResolution,
        config
      );
      carveRiverChannelsInPlace(
        heights,
        this.riverField,
        hydrology.flow,
        hydrology.lake,
        this.analysisResolution,
        config
      );
      this.sedimentField = buildSedimentField(
        heights,
        this.flowField,
        this.riverField,
        hydrology.lake,
        hydrology.receivers,
        this.analysisResolution,
        config
      );
    } else {
      this.flowField = buildFlowAccumulationField(heights, this.analysisResolution);
      this.riverField = null;
      this.lakeField = null;
      this.lakeSurfaceField = null;
      this.sedimentField = null;
    }

    const resources = this.buildResourceFields(heights);
    this.coalField = resources.coal;
    this.ironField = resources.iron;
    this.copperField = resources.copper;
    this.terrainHeightField = heights;
  }

  createSnapshot(): ProceduralGeneratorSnapshot {
    return {
      analysisResolution: this.analysisResolution,
      analysisStep: this.analysisStep,
      terrainHeightField: cloneField(this.terrainHeightField),
      flowField: cloneField(this.flowField),
      riverField: cloneField(this.riverField),
      lakeField: cloneField(this.lakeField),
      lakeSurfaceField: cloneField(this.lakeSurfaceField),
      sedimentField: cloneField(this.sedimentField),
      coalField: cloneField(this.coalField),
      ironField: cloneField(this.ironField),
      copperField: cloneField(this.copperField)
    };
  }

  sample(x: number, z: number): TerrainSample {
    const unclampedHeight = this.sampleBaseHeight(x, z);
    const height = this.sampleHeight(x, z, unclampedHeight);
    const { moisture, temperature } = this.sampleClimate(x, z);
    const flow = this.sampleFlow(x, z);
    const river = this.sampleRiver(x, z);
    const lake = this.sampleLake(x, z);
    const lakeSurfaceHeight = this.sampleLakeSurfaceHeight(x, z, height);
    const sediment = this.sampleSediment(x, z);
    const coal = this.sampleCoal(x, z, height, moisture);
    const iron = this.sampleIron(x, z, height);
    const copper = this.sampleCopper(x, z, height);
    return {
      height,
      moisture,
      temperature,
      flow,
      river,
      lake,
      lakeSurfaceHeight,
      sediment,
      coal,
      iron,
      copper
    };
  }

  sampleBaseTerrainHeight(x: number, z: number): number {
    return this.sampleBaseHeight(x, z);
  }

  sampleFlowAccumulation(x: number, z: number): number {
    return this.sampleFlow(x, z);
  }

  sampleRiverStrength(x: number, z: number): number {
    return this.sampleRiver(x, z);
  }

  sampleLakeStrength(x: number, z: number): number {
    return this.sampleLake(x, z);
  }

  sampleSediment(x: number, z: number): number {
    if (!this.sedimentField) {
      return 0;
    }

    const sediment = this.sampleField(this.sedimentField, x, z);
    return Number.isFinite(sediment) ? sediment : 0;
  }

  sampleCoal(x: number, z: number, fallbackHeight?: number, fallbackMoisture?: number): number {
    if (this.coalField) {
      const coal = this.sampleField(this.coalField, x, z);
      return Number.isFinite(coal) ? coal : 0;
    }

    return this.sampleProceduralCoal(
      x,
      z,
      fallbackHeight ?? this.sampleBaseHeight(x, z),
      fallbackMoisture ?? this.sampleClimate(x, z).moisture
    );
  }

  sampleIron(x: number, z: number, fallbackHeight?: number): number {
    if (this.ironField) {
      const iron = this.sampleField(this.ironField, x, z);
      return Number.isFinite(iron) ? iron : 0;
    }

    return this.sampleProceduralIron(x, z, fallbackHeight ?? this.sampleBaseHeight(x, z));
  }

  sampleCopper(x: number, z: number, fallbackHeight?: number): number {
    if (this.copperField) {
      const copper = this.sampleField(this.copperField, x, z);
      return Number.isFinite(copper) ? copper : 0;
    }

    return this.sampleProceduralCopper(x, z, fallbackHeight ?? this.sampleBaseHeight(x, z));
  }

  private sampleBaseHeight(x: number, z: number): number {
    const shape = this.config.shape;
    const continentBase =
      this.fbm(x, z, {
        frequency: shape.continentFrequency,
        octaves: 4,
        lacunarity: 2.05,
        gain: 0.5
      }) *
        2 -
      1;
    const radialMask = 1 - Scalar.Clamp(length2(x, z) / this.worldHalfExtent, 0, 1);
    const continentNoise =
      (continentBase * shape.continentBlend + radialMask * shape.radialFalloffStrength) *
      shape.continentAmplitude;

    const mountainMask = Scalar.Clamp(
      remap(
        this.fbm(x + 971.3, z - 241.8, {
          frequency: shape.mountainMaskFrequency,
          octaves: 3,
          lacunarity: 2,
          gain: 0.55
        }),
        shape.mountainMaskMin,
        shape.mountainMaskMax
      ),
      0,
      1
    );
    const mountainNoise =
      this.ridgedFbm(x, z, {
        frequency: shape.mountainFrequency,
        octaves: 5,
        lacunarity: 2.1,
        gain: 0.52
      }) * shape.mountainAmplitude;
    const hillNoise =
      (this.fbm(x - 314.1, z + 427.7, {
        frequency: shape.hillFrequency,
        octaves: 4,
        lacunarity: 2,
        gain: 0.5
      }) -
        0.5) *
      shape.hillAmplitude;
    const detailNoise =
      (this.fbm(x + 111.7, z + 89.4, {
        frequency: shape.detailFrequency,
        octaves: 2,
        lacunarity: 2,
        gain: 0.5
      }) -
        0.5) *
      shape.detailAmplitude;

    return Scalar.Clamp(
      this.config.baseHeight +
        continentNoise +
        mountainMask * mountainNoise +
        hillNoise +
        detailNoise,
      this.config.baseHeight,
      this.config.maxHeight
    );
  }

  private sampleClimate(
    x: number,
    z: number
  ): Pick<TerrainSample, "moisture" | "temperature"> {
    const shape = this.config.shape;
    const moisture = Scalar.Clamp(
      this.fbm(x - 703.2, z + 122.6, {
        frequency: shape.moistureFrequency,
        octaves: 4,
        lacunarity: 2,
        gain: 0.5
      }),
      0,
      1
    );
    const latitude = 1 - Math.abs(z) / this.worldHalfExtent;
    const temperature = Scalar.Clamp(
      latitude * 0.78 +
        (this.fbm(x + 1883.5, z - 901.4, {
          frequency: shape.temperatureNoiseFrequency,
          octaves: 3,
          lacunarity: 2,
          gain: 0.5
        }) -
          0.5) *
          shape.temperatureNoiseStrength,
      0,
      1
    );

    return { moisture, temperature };
  }

  private sampleHeight(x: number, z: number, fallbackHeight: number): number {
    if (!this.terrainHeightField) {
      return fallbackHeight;
    }

    const height = this.sampleField(this.terrainHeightField, x, z);
    return Number.isFinite(height) ? height : fallbackHeight;
  }

  private sampleFlow(x: number, z: number): number {
    if (!this.flowField) {
      return 0;
    }

    const flow = this.sampleField(this.flowField, x, z);
    return Number.isFinite(flow) ? flow : 0;
  }

  private sampleRiver(x: number, z: number): number {
    if (!this.riverField) {
      return 0;
    }

    const river = this.sampleField(this.riverField, x, z);
    return Number.isFinite(river) ? river : 0;
  }

  private sampleLake(x: number, z: number): number {
    if (!this.lakeField) {
      return 0;
    }

    const lake = this.sampleField(this.lakeField, x, z);
    return Number.isFinite(lake) ? lake : 0;
  }

  private sampleLakeSurfaceHeight(
    x: number,
    z: number,
    fallbackHeight: number
  ): number {
    if (!this.lakeSurfaceField) {
      return fallbackHeight;
    }

    const lakeSurfaceHeight = this.sampleField(this.lakeSurfaceField, x, z);
    return Number.isFinite(lakeSurfaceHeight) ? lakeSurfaceHeight : fallbackHeight;
  }

  private buildHeightField(): Float32Array {
    const resolution = this.analysisResolution;
    const heights = new Float32Array(resolution * resolution);
    const worldMin = this.config.worldMin;

    for (let z = 0; z < resolution; z += 1) {
      for (let x = 0; x < resolution; x += 1) {
        const worldX = worldMin + x * this.analysisStep;
        const worldZ = worldMin + z * this.analysisStep;
        heights[this.toIndex(x, z, resolution)] = this.sampleBaseHeight(worldX, worldZ);
      }
    }

    return heights;
  }

  private buildResourceFields(heights: Float32Array): {
    coal: Float32Array;
    iron: Float32Array;
    copper: Float32Array;
  } {
    const coal = new Float32Array(heights.length);
    const iron = new Float32Array(heights.length);
    const copper = new Float32Array(heights.length);
    const worldMin = this.config.worldMin;

    for (let z = 0; z < this.analysisResolution; z += 1) {
      for (let x = 0; x < this.analysisResolution; x += 1) {
        const index = this.toIndex(x, z, this.analysisResolution);
        const worldX = worldMin + x * this.analysisStep;
        const worldZ = worldMin + z * this.analysisStep;
        const height = heights[index];
        const climate = this.sampleClimate(worldX, worldZ);
        coal[index] = this.sampleProceduralCoal(worldX, worldZ, height, climate.moisture);
        iron[index] = this.sampleProceduralIron(worldX, worldZ, height);
        copper[index] = this.sampleProceduralCopper(worldX, worldZ, height);
      }
    }

    return { coal, iron, copper };
  }

  private toIndex(x: number, z: number, resolution: number): number {
    return z * resolution + x;
  }

  private sampleField(field: Float32Array, x: number, z: number): number {
    const worldMin = this.config.worldMin;
    const sampleX = Scalar.Clamp(
      (x - worldMin) / this.analysisStep,
      0,
      this.analysisResolution - 1
    );
    const sampleZ = Scalar.Clamp(
      (z - worldMin) / this.analysisStep,
      0,
      this.analysisResolution - 1
    );
    const minX = Math.floor(sampleX);
    const minZ = Math.floor(sampleZ);
    const maxX = Math.min(this.analysisResolution - 1, minX + 1);
    const maxZ = Math.min(this.analysisResolution - 1, minZ + 1);
    const tx = sampleX - minX;
    const tz = sampleZ - minZ;

    const h00 = field[this.toIndex(minX, minZ, this.analysisResolution)];
    const h10 = field[this.toIndex(maxX, minZ, this.analysisResolution)];
    const h01 = field[this.toIndex(minX, maxZ, this.analysisResolution)];
    const h11 = field[this.toIndex(maxX, maxZ, this.analysisResolution)];
    const hx0 = Scalar.Lerp(h00, h10, tx);
    const hx1 = Scalar.Lerp(h01, h11, tx);
    return Scalar.Lerp(hx0, hx1, tz);
  }

  private sampleProceduralCoal(
    x: number,
    z: number,
    height: number,
    moisture: number
  ): number {
    const basinNoise = this.fbm(x - 311.4, z + 904.7, {
      frequency: 0.0018,
      octaves: 4,
      lacunarity: 2,
      gain: 0.52
    });
    const seamNoise = this.fbm(x + 147.8, z - 512.9, {
      frequency: 0.0044,
      octaves: 3,
      lacunarity: 2.1,
      gain: 0.5
    });
    const foothillBand =
      smoothStep(this.config.waterLevel + 18, 96, height) *
      (1 - smoothStep(188, 260, height));
    const sedimentaryBias = 1 - Math.abs(moisture - 0.52) * 1.35;
    return Scalar.Clamp(
      basinNoise * 0.5 + seamNoise * 0.22 + foothillBand * 0.22 + sedimentaryBias * 0.14,
      0,
      1
    );
  }

  private sampleProceduralIron(x: number, z: number, height: number): number {
    const mountainNearness = smoothStep(62, 178, height);
    const beltNoise = this.ridgedFbm(x + 701.2, z - 233.6, {
      frequency: 0.0022,
      octaves: 4,
      lacunarity: 2.05,
      gain: 0.52
    });
    const hostRockNoise = this.fbm(x - 828.4, z + 515.3, {
      frequency: 0.0041,
      octaves: 3,
      lacunarity: 2.1,
      gain: 0.48
    });
    return Scalar.Clamp(
      mountainNearness * 0.44 + beltNoise * 0.38 + hostRockNoise * 0.22,
      0,
      1
    );
  }

  private sampleProceduralCopper(x: number, z: number, height: number): number {
    const uplandBand =
      smoothStep(this.config.waterLevel + 26, 118, height) *
      (1 - smoothStep(228, 300, height));
    const patchNoise = this.fbm(x + 1222.5, z + 804.9, {
      frequency: 0.0031,
      octaves: 4,
      lacunarity: 2.15,
      gain: 0.5
    });
    const fractureNoise = this.ridgedFbm(x - 411.7, z - 1017.2, {
      frequency: 0.0062,
      octaves: 3,
      lacunarity: 2,
      gain: 0.52
    });
    return Scalar.Clamp(
      uplandBand * 0.26 + patchNoise * 0.42 + fractureNoise * 0.34,
      0,
      1
    );
  }

  private fbm(x: number, z: number, options: FbmOptions): number {
    let amplitude = 1;
    let frequency = options.frequency;
    let total = 0;
    let amplitudeSum = 0;

    for (let octave = 0; octave < options.octaves; octave += 1) {
      total += this.valueNoise2d(x * frequency, z * frequency) * amplitude;
      amplitudeSum += amplitude;
      amplitude *= options.gain;
      frequency *= options.lacunarity;
    }

    return total / amplitudeSum;
  }

  private ridgedFbm(x: number, z: number, options: FbmOptions): number {
    let amplitude = 1;
    let frequency = options.frequency;
    let total = 0;
    let amplitudeSum = 0;

    for (let octave = 0; octave < options.octaves; octave += 1) {
      const noise = this.valueNoise2d(x * frequency, z * frequency);
      total += (1 - Math.abs(noise * 2 - 1)) * amplitude;
      amplitudeSum += amplitude;
      amplitude *= options.gain;
      frequency *= options.lacunarity;
    }

    return total / amplitudeSum;
  }

  private valueNoise2d(x: number, z: number): number {
    const minX = Math.floor(x);
    const minZ = Math.floor(z);
    const fracX = x - minX;
    const fracZ = z - minZ;

    const sx = smooth(fracX);
    const sz = smooth(fracZ);

    const n00 = this.hashToUnitFloat(minX, minZ);
    const n10 = this.hashToUnitFloat(minX + 1, minZ);
    const n01 = this.hashToUnitFloat(minX, minZ + 1);
    const n11 = this.hashToUnitFloat(minX + 1, minZ + 1);

    const nx0 = Scalar.Lerp(n00, n10, sx);
    const nx1 = Scalar.Lerp(n01, n11, sx);
    return Scalar.Lerp(nx0, nx1, sz);
  }

  private hashToUnitFloat(ix: number, iz: number): number {
    let h = this.seed ^ Math.imul(ix, 374761393) ^ Math.imul(iz, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  }
}

function cloneField(field: Float32Array | null): Float32Array | null {
  return field ? new Float32Array(field) : null;
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

function smooth(value: number): number {
  return value * value * (3 - 2 * value);
}

function remap(value: number, min: number, max: number): number {
  return (value - min) / (max - min);
}

function length2(x: number, z: number): number {
  return Math.sqrt(x * x + z * z);
}

function applyThermalErosionInPlace(
  heights: Float32Array,
  resolution: number,
  config: TerrainConfig
): void {
  const deltas = new Float32Array(heights.length);
  const { iterations, talusHeight, smoothing } = config.erosion;
  const cardinalNeighborOffsets: readonly [number, number][] = [
    [0, -1],
    [-1, 0],
    [1, 0],
    [0, 1]
  ];
  const diagonalNeighborOffsets: readonly [number, number][] = [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1]
  ];
  const allNeighborOffsets = [
    ...cardinalNeighborOffsets,
    ...diagonalNeighborOffsets
  ] as const;
  const directionalBias = 0.82;
  const diffuseShare = 0.18;
  const depositionStrength = 0.32;

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    deltas.fill(0);

    for (let z = 1; z < resolution - 1; z += 1) {
      for (let x = 1; x < resolution - 1; x += 1) {
        const index = z * resolution + x;
        const current = heights[index];
        let steepestDifference = 0;
        let steepestOffset: readonly [number, number] | null = null;
        const diffuseTransfers = new Array<number>(allNeighborOffsets.length).fill(0);
        let totalDiffuseTransfer = 0;

        allNeighborOffsets.forEach(([offsetX, offsetZ], neighborIndex) => {
          const nx = x + offsetX;
          const nz = z + offsetZ;
          const neighbor = heights[nz * resolution + nx];
          const difference = current - neighbor;
          const distance = offsetX !== 0 && offsetZ !== 0 ? Math.SQRT2 : 1;
          const adjustedDifference = difference / distance;

          if (adjustedDifference > steepestDifference) {
            steepestDifference = adjustedDifference;
            steepestOffset = [offsetX, offsetZ];
          }

          if (adjustedDifference <= talusHeight) {
            return;
          }

          const diffuseTransfer =
            (adjustedDifference - talusHeight) * smoothing * diffuseShare * 0.125;
          diffuseTransfers[neighborIndex] = diffuseTransfer;
          totalDiffuseTransfer += diffuseTransfer;
        });

        if (!steepestOffset || steepestDifference <= talusHeight) {
          continue;
        }

        const primaryTransfer =
          (steepestDifference - talusHeight) * smoothing * directionalBias;
        const totalTransfer = primaryTransfer + totalDiffuseTransfer;
        if (totalTransfer <= 0) {
          continue;
        }

        deltas[index] -= totalTransfer;

        const primaryX = x + steepestOffset[0];
        const primaryZ = z + steepestOffset[1];
        const primaryIndex = primaryZ * resolution + primaryX;
        deltas[primaryIndex] += primaryTransfer * (1 - depositionStrength);

        const downstreamX = primaryX + steepestOffset[0];
        const downstreamZ = primaryZ + steepestOffset[1];
        if (
          downstreamX > 0 &&
          downstreamX < resolution - 1 &&
          downstreamZ > 0 &&
          downstreamZ < resolution - 1
        ) {
          const downstreamIndex = downstreamZ * resolution + downstreamX;
          deltas[downstreamIndex] += primaryTransfer * depositionStrength;
        } else {
          deltas[primaryIndex] += primaryTransfer * depositionStrength;
        }

        allNeighborOffsets.forEach(([offsetX, offsetZ], neighborIndex) => {
          const transfer = diffuseTransfers[neighborIndex];
          if (transfer <= 0) {
            return;
          }

          const nx = x + offsetX;
          const nz = z + offsetZ;
          deltas[nz * resolution + nx] += transfer;
        });
      }
    }

    for (let index = 0; index < heights.length; index += 1) {
      heights[index] = Scalar.Clamp(
        heights[index] + deltas[index],
        config.baseHeight,
        config.maxHeight
      );
    }
  }
}

function buildFlowAccumulationField(
  heights: Float32Array,
  resolution: number
): Float32Array {
  const cellCount = heights.length;
  const receivers = new Int32Array(cellCount);
  receivers.fill(-1);
  const accumulation = new Float32Array(cellCount);
  accumulation.fill(1);
  const offsets: readonly [number, number][] = [
    [0, -1],
    [-1, 0],
    [1, 0],
    [0, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1]
  ];

  for (let z = 1; z < resolution - 1; z += 1) {
    for (let x = 1; x < resolution - 1; x += 1) {
      const index = z * resolution + x;
      const current = heights[index];
      let bestDrop = 0;
      let bestReceiver = -1;

      offsets.forEach(([offsetX, offsetZ]) => {
        const nx = x + offsetX;
        const nz = z + offsetZ;
        const nIndex = nz * resolution + nx;
        const neighbor = heights[nIndex];
        const distance = offsetX !== 0 && offsetZ !== 0 ? Math.SQRT2 : 1;
        const drop = (current - neighbor) / distance;

        if (drop > bestDrop) {
          bestDrop = drop;
          bestReceiver = nIndex;
        }
      });

      receivers[index] = bestReceiver;
    }
  }

  const sortedIndices = Array.from({ length: cellCount }, (_, index) => index);
  sortedIndices.sort((a, b) => heights[b] - heights[a]);

  for (const index of sortedIndices) {
    const receiver = receivers[index];
    if (receiver >= 0) {
      accumulation[receiver] += accumulation[index];
    }
  }

  let maxAccumulation = 1;
  for (let index = 0; index < cellCount; index += 1) {
    if (accumulation[index] > maxAccumulation) {
      maxAccumulation = accumulation[index];
    }
  }

  const normalized = new Float32Array(cellCount);
  const maxLog = Math.log1p(maxAccumulation);
  for (let index = 0; index < cellCount; index += 1) {
    normalized[index] = maxLog > 0 ? Math.log1p(accumulation[index]) / maxLog : 0;
  }

  return normalized;
}

interface HydrologyFields {
  readonly filledHeights: Float32Array;
  readonly receivers: Int32Array;
  readonly flow: Float32Array;
  readonly lake: Float32Array;
}

function buildHydrologyFields(
  heights: Float32Array,
  resolution: number,
  config: TerrainConfig
): HydrologyFields {
  const { filledHeights, receivers } = fillDepressionsAndRoute(heights, resolution);
  const flow = buildAccumulationFromReceivers(filledHeights, receivers);
  const lake = buildLakeField(heights, filledHeights, config);
  return { filledHeights, receivers, flow, lake };
}

function buildRiverField(
  heights: Float32Array,
  filledHeights: Float32Array,
  flow: Float32Array,
  lake: Float32Array,
  receivers: Int32Array,
  resolution: number,
  config: TerrainConfig
): Float32Array {
  const river = new Float32Array(heights.length);
  const {
    flowThreshold,
    bankStrength,
    minSlope,
    minElevation
  } = config.rivers;
  const minRiverHeight = config.waterLevel + minElevation;
  const neighborOffsets: readonly [number, number][] = [
    [0, -1],
    [-1, 0],
    [1, 0],
    [0, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1]
  ];

  for (let z = 1; z < resolution - 1; z += 1) {
    for (let x = 1; x < resolution - 1; x += 1) {
      const index = z * resolution + x;
      const height = heights[index];
      if (height <= minRiverHeight) {
        continue;
      }

      const flowMask = smoothStep(flowThreshold, 1, flow[index]);
      if (flowMask <= 0) {
        continue;
      }

      const receiver = receivers[index];
      let steepestDrop = 0;
      if (receiver >= 0) {
        steepestDrop = Math.max(0, height - heights[receiver]);
        if (steepestDrop <= 0) {
          steepestDrop = Math.max(0, filledHeights[index] - filledHeights[receiver]);
        }
      } else {
        neighborOffsets.forEach(([offsetX, offsetZ]) => {
          const neighborIndex = (z + offsetZ) * resolution + (x + offsetX);
          const distance = offsetX !== 0 && offsetZ !== 0 ? Math.SQRT2 : 1;
          const drop = (height - heights[neighborIndex]) / distance;
          if (drop > steepestDrop) {
            steepestDrop = drop;
          }
        });
      }

      const slopeMask = Math.max(
        smoothStep(minSlope, minSlope * 3, steepestDrop),
        smoothStep(flowThreshold, 1, flow[index]) * 0.28
      );
      const elevationMask = smoothStep(minRiverHeight, minRiverHeight + 18, height);
      const lakeSuppression = 1 - smoothStep(0.05, 0.35, lake[index]);
      river[index] = flowMask * slopeMask * elevationMask * lakeSuppression;
    }
  }

  const widened = new Float32Array(river.length);
  for (let z = 1; z < resolution - 1; z += 1) {
    for (let x = 1; x < resolution - 1; x += 1) {
      const index = z * resolution + x;
      let maxNeighbor = river[index];
      neighborOffsets.forEach(([offsetX, offsetZ]) => {
        const neighborIndex = (z + offsetZ) * resolution + (x + offsetX);
        if (river[neighborIndex] > maxNeighbor) {
          maxNeighbor = river[neighborIndex];
        }
      });
      const dischargeWidth = smoothStep(flowThreshold, 1, flow[index]);
      widened[index] = Math.max(
        river[index],
        maxNeighbor * (bankStrength + dischargeWidth * 0.22),
        river[index] * (1 + dischargeWidth * 0.2)
      );
    }
  }

  return widened;
}

function carveRiverChannelsInPlace(
  heights: Float32Array,
  river: Float32Array,
  flow: Float32Array,
  lake: Float32Array,
  resolution: number,
  config: TerrainConfig
): void {
  const carved = new Float32Array(heights);
  const { depth, maxDepth } = config.rivers;
  const neighborOffsets: readonly [number, number][] = [
    [0, 0],
    [0, -1],
    [-1, 0],
    [1, 0],
    [0, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1]
  ];

  for (let z = 1; z < resolution - 1; z += 1) {
    for (let x = 1; x < resolution - 1; x += 1) {
      const index = z * resolution + x;
      let bankMask = 0;
      let lakeMask = 0;
      neighborOffsets.forEach(([offsetX, offsetZ]) => {
        const neighborIndex = (z + offsetZ) * resolution + (x + offsetX);
        const weight = offsetX === 0 && offsetZ === 0 ? 1 : 0.72;
        bankMask = Math.max(bankMask, river[neighborIndex] * weight);
        lakeMask = Math.max(lakeMask, lake[neighborIndex] * weight);
      });

      if (bankMask <= 0 && lakeMask <= 0) {
        continue;
      }

      const dischargeDepth = smoothStep(
        config.rivers.flowThreshold,
        1,
        flow[index]
      );
      const channelDepth = Scalar.Lerp(
        depth,
        maxDepth,
        Math.max(bankMask * bankMask, dischargeDepth * dischargeDepth)
      );
      const lakeDepth = Scalar.Lerp(depth * 0.4, maxDepth * 0.65, lakeMask);
      const minimumRiverBed = Math.max(config.baseHeight, config.waterLevel + 0.8);
      carved[index] = Scalar.Clamp(
        heights[index] - Math.max(channelDepth, lakeDepth),
        minimumRiverBed,
        config.maxHeight
      );
    }
  }

  heights.set(carved);
}

function applyHydraulicChannelErosionInPlace(
  heights: Float32Array,
  flow: Float32Array,
  river: Float32Array,
  lake: Float32Array,
  receivers: Int32Array,
  resolution: number,
  config: TerrainConfig
): void {
  const deltas = new Float32Array(heights.length);
  const iterations = Math.max(2, Math.min(8, Math.round(config.erosion.iterations * 0.35)));
  const depositFactor = 0.62;
  const lakeDepositFactor = 0.9;
  const riverThreshold = Math.max(config.rivers.flowThreshold - 0.12, 0.4);
  const sortedIndices = Array.from({ length: heights.length }, (_, index) => index);

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    deltas.fill(0);
    sortedIndices.sort((a, b) => heights[b] - heights[a]);

    for (const index of sortedIndices) {
      const receiver = receivers[index];
      if (receiver < 0) {
        continue;
      }

      const discharge = smoothStep(riverThreshold, 1, flow[index]);
      const riverMask = Math.max(river[index], lake[index] * 0.45);
      if (discharge <= 0 && riverMask <= 0) {
        continue;
      }

      const currentHeight = heights[index];
      const downstreamHeight = heights[receiver];
      const slope = Math.max(0, currentHeight - downstreamHeight);
      if (slope <= 0.001 && lake[index] < 0.05) {
        continue;
      }

      const erosionStrength =
        config.rivers.depth * 0.018 +
        config.rivers.maxDepth * 0.006 +
        config.erosion.smoothing * 0.05;
      const erodedMaterial =
        (discharge * 0.7 + riverMask * 0.9) *
        (0.15 + Math.min(slope, 6) * 0.12) *
        erosionStrength;

      if (erodedMaterial <= 0) {
        continue;
      }

      deltas[index] -= erodedMaterial;

      const downstreamLake = lake[receiver];
      const depositToReceiver = erodedMaterial * (downstreamLake > 0.08 ? lakeDepositFactor : depositFactor);
      deltas[receiver] += depositToReceiver;

      const overspill = erodedMaterial - depositToReceiver;
      if (overspill > 0) {
        const secondReceiver = receivers[receiver];
        if (secondReceiver >= 0) {
          deltas[secondReceiver] += overspill;
        } else {
          deltas[receiver] += overspill;
        }
      }
    }

    for (let index = 0; index < heights.length; index += 1) {
      heights[index] = Scalar.Clamp(
        heights[index] + deltas[index],
        config.baseHeight,
        config.maxHeight
      );
    }
  }
}

function smoothStep(min: number, max: number, value: number): number {
  if (max <= min) {
    return value >= max ? 1 : 0;
  }

  const t = Scalar.Clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
}

function fillDepressionsAndRoute(
  heights: Float32Array,
  resolution: number
): { filledHeights: Float32Array; receivers: Int32Array } {
  const cellCount = heights.length;
  const filledHeights = new Float32Array(cellCount);
  filledHeights.fill(Number.POSITIVE_INFINITY);
  const receivers = new Int32Array(cellCount);
  receivers.fill(-1);
  const visited = new Uint8Array(cellCount);
  const heap = new MinHeap();

  for (let z = 0; z < resolution; z += 1) {
    for (let x = 0; x < resolution; x += 1) {
      if (x !== 0 && z !== 0 && x !== resolution - 1 && z !== resolution - 1) {
        continue;
      }

      const index = z * resolution + x;
      visited[index] = 1;
      filledHeights[index] = heights[index];
      heap.push(index, filledHeights[index]);
    }
  }

  const offsets: readonly [number, number][] = [
    [0, -1],
    [-1, 0],
    [1, 0],
    [0, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1]
  ];

  while (heap.size > 0) {
    const current = heap.pop()!;
    const x = current.index % resolution;
    const z = Math.floor(current.index / resolution);

    offsets.forEach(([offsetX, offsetZ]) => {
      const nx = x + offsetX;
      const nz = z + offsetZ;
      if (nx < 0 || nz < 0 || nx >= resolution || nz >= resolution) {
        return;
      }

      const neighborIndex = nz * resolution + nx;
      if (visited[neighborIndex]) {
        return;
      }

      visited[neighborIndex] = 1;
      filledHeights[neighborIndex] = Math.max(heights[neighborIndex], current.priority);
      receivers[neighborIndex] = current.index;
      heap.push(neighborIndex, filledHeights[neighborIndex]);
    });
  }

  return { filledHeights, receivers };
}

function buildAccumulationFromReceivers(
  filledHeights: Float32Array,
  receivers: Int32Array
): Float32Array {
  const accumulation = new Float32Array(filledHeights.length);
  accumulation.fill(1);
  const sortedIndices = Array.from({ length: filledHeights.length }, (_, index) => index);
  sortedIndices.sort((a, b) => filledHeights[b] - filledHeights[a]);

  for (const index of sortedIndices) {
    const receiver = receivers[index];
    if (receiver >= 0) {
      accumulation[receiver] += accumulation[index];
    }
  }

  let maxAccumulation = 1;
  for (let index = 0; index < accumulation.length; index += 1) {
    if (accumulation[index] > maxAccumulation) {
      maxAccumulation = accumulation[index];
    }
  }

  const normalized = new Float32Array(accumulation.length);
  const maxLog = Math.log1p(maxAccumulation);
  for (let index = 0; index < accumulation.length; index += 1) {
    normalized[index] = maxLog > 0 ? Math.log1p(accumulation[index]) / maxLog : 0;
  }

  return normalized;
}

function buildLakeField(
  heights: Float32Array,
  filledHeights: Float32Array,
  config: TerrainConfig
): Float32Array {
  const lake = new Float32Array(heights.length);
  const maxLakeDepth = Math.max(config.rivers.maxDepth, 1);
  const lakeThreshold = Math.max(0.05, config.rivers.lakeThreshold);

  for (let index = 0; index < heights.length; index += 1) {
    const lakeDepth = Math.max(0, filledHeights[index] - heights[index]);
    lake[index] = smoothStep(lakeThreshold, maxLakeDepth, lakeDepth);
  }

  return lake;
}

function buildSedimentField(
  heights: Float32Array,
  flow: Float32Array,
  river: Float32Array,
  lake: Float32Array,
  receivers: Int32Array,
  resolution: number,
  config: TerrainConfig
): Float32Array {
  const sediment = new Float32Array(heights.length);
  const transport = new Float32Array(heights.length);
  const sortedIndices = Array.from({ length: heights.length }, (_, index) => index);
  const neighborOffsets: readonly [number, number][] = [
    [0, -1],
    [-1, 0],
    [1, 0],
    [0, 1]
  ];
  sortedIndices.sort((a, b) => heights[b] - heights[a]);

  for (const index of sortedIndices) {
    const receiver = receivers[index];
    const discharge = smoothStep(Math.max(config.rivers.flowThreshold - 0.14, 0.35), 1, flow[index]);
    const channel = Math.max(river[index], lake[index] * 0.6);
    const source = channel * 0.55 + discharge * 0.4;
    if (source <= 0) {
      continue;
    }

    const carried = transport[index] + source;
    if (receiver < 0) {
      sediment[index] += carried;
      continue;
    }

    const slope = Math.max(0, heights[index] - heights[receiver]);
    const flatness = 1 - smoothStep(config.rivers.minSlope, config.rivers.minSlope * 4 + 0.001, slope);
    const lakeDeposit = lake[receiver];
    const riverDeposit = smoothStep(0.08, 0.45, river[receiver]) * flatness;
    const depositRatio = Math.min(
      0.92,
      0.12 + flatness * 0.42 + lakeDeposit * 0.36 + riverDeposit * 0.18
    );
    const deposited = carried * depositRatio;
    const receiverX = receiver % resolution;
    const receiverZ = Math.floor(receiver / resolution);
    const centerDeposit = deposited * 0.62;
    sediment[receiver] += centerDeposit;

    const fringeDeposit = deposited - centerDeposit;
    if (fringeDeposit > 0.0001) {
      let totalNeighborWeight = 0;
      const weights = new Float32Array(neighborOffsets.length);

      neighborOffsets.forEach(([offsetX, offsetZ], neighborIndex) => {
        const nx = receiverX + offsetX;
        const nz = receiverZ + offsetZ;
        if (nx < 0 || nz < 0 || nx >= resolution || nz >= resolution) {
          return;
        }

        const index = nz * resolution + nx;
        const neighborLake = lake[index];
        const neighborRiver = river[index];
        const neighborFlow = flow[index];
        const weight =
          0.35 +
          neighborLake * 0.4 +
          neighborRiver * 0.25 +
          neighborFlow * 0.18;
        weights[neighborIndex] = weight;
        totalNeighborWeight += weight;
      });

      if (totalNeighborWeight > 0.0001) {
        neighborOffsets.forEach(([offsetX, offsetZ], neighborIndex) => {
          const weight = weights[neighborIndex];
          if (weight <= 0) {
            return;
          }

          const nx = receiverX + offsetX;
          const nz = receiverZ + offsetZ;
          const index = nz * resolution + nx;
          sediment[index] += fringeDeposit * (weight / totalNeighborWeight);
        });
      } else {
        sediment[receiver] += fringeDeposit;
      }
    }

    transport[receiver] += carried - deposited;
  }

  let maxSediment = 0;
  for (let index = 0; index < sediment.length; index += 1) {
    if (sediment[index] > maxSediment) {
      maxSediment = sediment[index];
    }
  }

  if (maxSediment <= 0.0001) {
    return sediment;
  }

  const normalized = new Float32Array(sediment.length);
  const maxLog = Math.log1p(maxSediment);
  for (let index = 0; index < sediment.length; index += 1) {
    const base = Math.log1p(sediment[index]) / maxLog;
    const channelBias = Math.max(river[index] * 0.35, lake[index] * 0.5);
    normalized[index] = Scalar.Clamp(base * 0.85 + channelBias, 0, 1);
  }

  smoothScalarFieldInPlace(normalized, resolution, 2, 0.58);
  return normalized;
}

function smoothScalarFieldInPlace(
  field: Float32Array,
  resolution: number,
  passes: number,
  centerWeight: number
): void {
  const offsets: readonly [number, number, number][] = [
    [0, 0, centerWeight],
    [0, -1, 0.12],
    [-1, 0, 0.12],
    [1, 0, 0.12],
    [0, 1, 0.12],
    [-1, -1, 0.015],
    [1, -1, 0.015],
    [-1, 1, 0.015],
    [1, 1, 0.015]
  ];

  for (let pass = 0; pass < passes; pass += 1) {
    const next = new Float32Array(field.length);

    for (let z = 0; z < resolution; z += 1) {
      for (let x = 0; x < resolution; x += 1) {
        let totalWeight = 0;
        let total = 0;

        offsets.forEach(([offsetX, offsetZ, weight]) => {
          const nx = x + offsetX;
          const nz = z + offsetZ;
          if (nx < 0 || nz < 0 || nx >= resolution || nz >= resolution) {
            return;
          }

          total += field[nz * resolution + nx] * weight;
          totalWeight += weight;
        });

        next[z * resolution + x] = total / Math.max(totalWeight, 0.0001);
      }
    }

    field.set(next);
  }
}

class MinHeap {
  private readonly entries: { index: number; priority: number }[] = [];

  get size(): number {
    return this.entries.length;
  }

  push(index: number, priority: number): void {
    const entry = { index, priority };
    this.entries.push(entry);
    this.bubbleUp(this.entries.length - 1);
  }

  pop(): { index: number; priority: number } | null {
    if (this.entries.length === 0) {
      return null;
    }

    const first = this.entries[0];
    const last = this.entries.pop()!;
    if (this.entries.length > 0) {
      this.entries[0] = last;
      this.bubbleDown(0);
    }
    return first;
  }

  private bubbleUp(index: number): void {
    let current = index;
    while (current > 0) {
      const parent = Math.floor((current - 1) / 2);
      if (this.entries[parent].priority <= this.entries[current].priority) {
        break;
      }
      [this.entries[parent], this.entries[current]] = [
        this.entries[current],
        this.entries[parent]
      ];
      current = parent;
    }
  }

  private bubbleDown(index: number): void {
    let current = index;
    while (true) {
      const left = current * 2 + 1;
      const right = left + 1;
      let smallest = current;

      if (
        left < this.entries.length &&
        this.entries[left].priority < this.entries[smallest].priority
      ) {
        smallest = left;
      }

      if (
        right < this.entries.length &&
        this.entries[right].priority < this.entries[smallest].priority
      ) {
        smallest = right;
      }

      if (smallest === current) {
        break;
      }

      [this.entries[current], this.entries[smallest]] = [
        this.entries[smallest],
        this.entries[current]
      ];
      current = smallest;
    }
  }
}
