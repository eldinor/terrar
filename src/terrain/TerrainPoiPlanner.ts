import { Scalar } from "@babylonjs/core/Maths/math.scalar";
import { ProceduralGenerator } from "./ProceduralGenerator";
import { TerrainConfig } from "./TerrainConfig";

export enum TerrainPoiKind {
  Village = "village",
  Hillfort = "hillfort",
  Harbor = "harbor",
  Mine = "mine"
}

export interface TerrainPoi {
  readonly id: string;
  readonly kind: TerrainPoiKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly score: number;
  readonly radius: number;
  readonly tags: readonly string[];
}

interface TerrainPoiCandidate extends TerrainPoi {}

interface TerrainPoiContext {
  readonly x: number;
  readonly z: number;
  readonly height: number;
  readonly slope: number;
  readonly prominence: number;
  readonly moisture: number;
  readonly temperature: number;
  readonly flow: number;
  readonly river: number;
  readonly lake: number;
  readonly sediment: number;
  readonly waterNearby: number;
  readonly coastProximity: number;
  readonly localFlatness: number;
  readonly lowland: number;
  readonly highland: number;
}

interface TerrainPoiArchetype {
  readonly kind: TerrainPoiKind;
  readonly maxCount: number;
  readonly radius: number;
  readonly minScore: number;
}

const POI_ARCHETYPES: readonly TerrainPoiArchetype[] = [
  { kind: TerrainPoiKind.Village, maxCount: 4, radius: 156, minScore: 0.58 },
  { kind: TerrainPoiKind.Harbor, maxCount: 2, radius: 184, minScore: 0.62 },
  { kind: TerrainPoiKind.Hillfort, maxCount: 3, radius: 186, minScore: 0.59 },
  { kind: TerrainPoiKind.Mine, maxCount: 3, radius: 164, minScore: 0.56 }
] as const;

export class TerrainPoiPlanner {
  constructor(
    private readonly config: TerrainConfig,
    private readonly generator: ProceduralGenerator
  ) {}

  generateSites(): TerrainPoi[] {
    const candidates = new Map<TerrainPoiKind, TerrainPoiCandidate[]>();
    POI_ARCHETYPES.forEach((archetype) => candidates.set(archetype.kind, []));

    const scanStep = 32;
    const margin = 36;
    for (
      let z = this.config.worldMin + margin;
      z <= this.config.worldMax - margin;
      z += scanStep
    ) {
      for (
        let x = this.config.worldMin + margin;
        x <= this.config.worldMax - margin;
        x += scanStep
      ) {
        const context = this.sampleContext(x, z);
        if (context.height <= this.config.waterLevel + 2) {
          continue;
        }

        this.pushCandidate(
          candidates.get(TerrainPoiKind.Village)!,
          context,
          this.scoreVillage(context)
        );
        this.pushCandidate(
          candidates.get(TerrainPoiKind.Harbor)!,
          context,
          this.scoreHarbor(context)
        );
        this.pushCandidate(
          candidates.get(TerrainPoiKind.Hillfort)!,
          context,
          this.scoreHillfort(context)
        );
        this.pushCandidate(
          candidates.get(TerrainPoiKind.Mine)!,
          context,
          this.scoreMine(context)
        );
      }
    }

    const selected: TerrainPoiCandidate[] = [];
    POI_ARCHETYPES.forEach((archetype) => {
      const list = candidates.get(archetype.kind)!;
      list.sort((a, b) => b.score - a.score);
      const maxCount = Math.max(
        archetype.kind === TerrainPoiKind.Village ? 2 : 1,
        Math.round(archetype.maxCount * this.config.poi.density)
      );
      const spacingRadius = archetype.radius * this.config.poi.spacing;

      for (const candidate of list) {
        if (candidate.score < archetype.minScore) {
          break;
        }
        if (
          selected.filter((site) => site.kind === archetype.kind).length >=
          maxCount
        ) {
          break;
        }
        if (!this.canPlaceCandidate(selected, candidate, spacingRadius)) {
          continue;
        }
        selected.push(candidate);
      }
    });

    return selected.sort((a, b) => a.kind.localeCompare(b.kind) || b.score - a.score);
  }

  private pushCandidate(
    candidates: TerrainPoiCandidate[],
    context: TerrainPoiContext,
    score: {
      kind: TerrainPoiKind;
      value: number;
      radius: number;
      tags: readonly string[];
    }
  ): void {
    if (score.value <= 0) {
      return;
    }
    candidates.push({
      id: `${score.kind}-${Math.round(context.x)}-${Math.round(context.z)}`,
      kind: score.kind,
      x: context.x,
      y: context.height,
      z: context.z,
      score: score.value,
      radius: score.radius,
      tags: score.tags
    });
  }

  private scoreVillage(context: TerrainPoiContext) {
    const buildable =
      context.localFlatness *
      (1 - smoothStep(0.18, 0.65, context.river)) *
      (1 - smoothStep(0.18, 0.8, context.lake));
    const fertile = context.sediment * 0.7 + context.moisture * 0.3;
    const moderateHeight = 1 - smoothStep(70, 170, context.height);
    const value =
      buildable * 0.38 +
      context.waterNearby * 0.28 +
      fertile * 0.2 +
      moderateHeight * 0.14;
    return {
      kind: TerrainPoiKind.Village,
      value,
      radius: 122,
      tags: buildTags("water", context.waterNearby, "fertile", fertile, "flat", context.localFlatness)
    };
  }

  private scoreHarbor(context: TerrainPoiContext) {
    const shore = Math.max(context.coastProximity, context.lake * 0.78);
    const lowSlope = context.localFlatness;
    const lowland = context.lowland;
    const waterAccess = Math.max(context.waterNearby, context.lake);
    const value = shore * 0.42 + lowSlope * 0.24 + lowland * 0.18 + waterAccess * 0.16;
    return {
      kind: TerrainPoiKind.Harbor,
      value,
      radius: 146,
      tags: buildTags("shore", shore, "water", waterAccess, "lowland", lowland)
    };
  }

  private scoreHillfort(context: TerrainPoiContext) {
    const commandingSlope = smoothStep(0.06, 0.22, context.slope);
    const value =
      context.prominence * 0.38 +
      context.highland * 0.24 +
      commandingSlope * 0.22 +
      (1 - context.waterNearby) * 0.16;
    return {
      kind: TerrainPoiKind.Hillfort,
      value,
      radius: 154,
      tags: buildTags(
        "prominent",
        context.prominence,
        "high",
        context.highland,
        "defensive",
        commandingSlope
      )
    };
  }

  private scoreMine(context: TerrainPoiContext) {
    const rocky =
      smoothStep(0.12, 0.3, context.slope) * 0.55 +
      context.highland * 0.45;
    const dry = 1 - (context.waterNearby * 0.55 + context.sediment * 0.2);
    const value = rocky * 0.48 + context.prominence * 0.24 + dry * 0.16 + context.highland * 0.12;
    return {
      kind: TerrainPoiKind.Mine,
      value,
      radius: 128,
      tags: buildTags("rock", rocky, "dry", dry, "high", context.highland)
    };
  }

  private sampleContext(x: number, z: number): TerrainPoiContext {
    const center = this.generator.sample(x, z);
    const step = 12;
    const left = this.generator.sample(x - step, z).height;
    const right = this.generator.sample(x + step, z).height;
    const down = this.generator.sample(x, z - step).height;
    const up = this.generator.sample(x, z + step).height;
    const gradX = (right - left) / (step * 2);
    const gradZ = (up - down) / (step * 2);
    const slope = Math.sqrt(gradX * gradX + gradZ * gradZ);

    let avgHeight = 0;
    let maxWater = 0;
    let avgSediment = 0;
    let avgFlow = 0;
    const neighborhoodRadius = 24;
    let samples = 0;
    for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        const sample = this.generator.sample(
          x + offsetX * neighborhoodRadius,
          z + offsetZ * neighborhoodRadius
        );
        avgHeight += sample.height;
        avgSediment += sample.sediment;
        avgFlow += sample.flow;
        maxWater = Math.max(
          maxWater,
          sample.river,
          sample.lake,
          this.computeCoastProximity(sample.height)
        );
        samples += 1;
      }
    }

    avgHeight /= samples;
    avgSediment /= samples;
    avgFlow /= samples;
    const prominence = Scalar.Clamp((center.height - avgHeight + 10) / 55, 0, 1);
    const waterNearby = Scalar.Clamp(
      maxWater * 0.75 + Math.max(center.flow - 0.18, 0) * 0.4 + avgFlow * 0.2,
      0,
      1
    );
    const coastProximity = this.computeCoastProximity(center.height);
    const localFlatness = 1 - smoothStep(0.05, 0.24, slope);
    const lowland = 1 - smoothStep(this.config.waterLevel + 24, 112, center.height);
    const highland = smoothStep(76, 180, center.height);

    return {
      x,
      z,
      height: center.height,
      slope,
      prominence,
      moisture: center.moisture,
      temperature: center.temperature,
      flow: center.flow,
      river: center.river,
      lake: center.lake,
      sediment: avgSediment,
      waterNearby,
      coastProximity,
      localFlatness,
      lowland,
      highland
    };
  }

  private computeCoastProximity(height: number): number {
    return 1 - smoothStep(6, 28, Math.abs(height - this.config.waterLevel));
  }

  private canPlaceCandidate(
    sites: readonly TerrainPoiCandidate[],
    candidate: TerrainPoiCandidate,
    sameKindRadius: number
  ): boolean {
    for (const site of sites) {
      const dx = site.x - candidate.x;
      const dz = site.z - candidate.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      const requiredRadius =
        site.kind === candidate.kind
          ? Math.max(site.radius, sameKindRadius)
          : Math.min(site.radius, candidate.radius) * 0.72;
      if (distance < requiredRadius) {
        return false;
      }
    }
    return true;
  }
}

function smoothStep(min: number, max: number, value: number): number {
  if (max <= min) {
    return value >= max ? 1 : 0;
  }
  const t = Scalar.Clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
}

function buildTags(
  aLabel: string,
  a: number,
  bLabel: string,
  b: number,
  cLabel: string,
  c: number
): readonly string[] {
  const tags: string[] = [];
  if (a > 0.55) {
    tags.push(aLabel);
  }
  if (b > 0.55) {
    tags.push(bLabel);
  }
  if (c > 0.55) {
    tags.push(cLabel);
  }
  return tags;
}
