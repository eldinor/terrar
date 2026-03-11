import { Scalar } from "@babylonjs/core/Maths/math.scalar";
import { TerrainConfig } from "./TerrainConfig";

export interface TerrainSample {
  readonly height: number;
  readonly moisture: number;
  readonly temperature: number;
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

  constructor(private readonly config: TerrainConfig) {
    this.seed = normalizeSeed(config.seed);
    this.worldHalfExtent = config.worldSize * 0.5;
  }

  sample(x: number, z: number): TerrainSample {
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

    const height = Scalar.Clamp(
      this.config.baseHeight +
        continentNoise +
        mountainMask * mountainNoise +
        hillNoise +
        detailNoise,
      this.config.baseHeight,
      this.config.maxHeight
    );

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

    return { height, moisture, temperature };
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
