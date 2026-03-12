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
  readonly floodplainCore: number;
  readonly crossingCandidate: number;
  readonly passCandidate: number;
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
    const safeFloodplain = 1 - context.floodplainCore;
    const value =
      buildable * 0.32 +
      context.waterNearby * 0.21 +
      fertile * 0.18 +
      moderateHeight * 0.1 +
      safeFloodplain * 0.12 +
      context.crossingCandidate * 0.07;
    return {
      kind: TerrainPoiKind.Village,
      value,
      radius: 122,
      tags: buildContextTags(context, [
        ["water", context.waterNearby],
        ["fertile", fertile],
        ["flat", context.localFlatness],
        ["ford", context.crossingCandidate],
        ["flood-risk", context.floodplainCore]
      ])
    };
  }

  private scoreHarbor(context: TerrainPoiContext) {
    const shore = Math.max(context.coastProximity, context.lake * 0.78);
    const lowSlope = context.localFlatness;
    const lowland = context.lowland;
    const waterAccess = Math.max(context.waterNearby, context.lake);
    const value =
      shore * 0.42 +
      lowSlope * 0.2 +
      lowland * 0.16 +
      waterAccess * 0.12 +
      context.crossingCandidate * 0.1;
    return {
      kind: TerrainPoiKind.Harbor,
      value,
      radius: 146,
      tags: buildContextTags(context, [
        ["shore", shore],
        ["water", waterAccess],
        ["lowland", lowland],
        ["ford", context.crossingCandidate]
      ])
    };
  }

  private scoreHillfort(context: TerrainPoiContext) {
    const commandingSlope = smoothStep(0.06, 0.22, context.slope);
    const value =
      context.prominence * 0.28 +
      context.highland * 0.2 +
      commandingSlope * 0.18 +
      (1 - context.waterNearby) * 0.12 +
      context.passCandidate * 0.22;
    return {
      kind: TerrainPoiKind.Hillfort,
      value,
      radius: 154,
      tags: buildContextTags(context, [
        ["prominent", context.prominence],
        ["high", context.highland],
        ["defensive", commandingSlope],
        ["pass", context.passCandidate]
      ])
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
      tags: buildContextTags(context, [
        ["rock", rocky],
        ["dry", dry],
        ["high", context.highland],
        ["pass", context.passCandidate]
      ])
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
    const floodplainCore = Scalar.Clamp(
      smoothStep(0.14, 0.42, center.flow) *
        smoothStep(0.06, 0.32, center.river) *
        (1 - localSlopeToFlatness(slope)) *
        smoothStep(0.12, 0.48, avgSediment) *
        (1 - smoothStep(this.config.waterLevel + 18, 120, center.height)),
      0,
      1
    );
    const waterNearby = Scalar.Clamp(
      maxWater * 0.75 + Math.max(center.flow - 0.18, 0) * 0.4 + avgFlow * 0.2,
      0,
      1
    );
    const coastProximity = this.computeCoastProximity(center.height);
    const localFlatness = 1 - smoothStep(0.05, 0.24, slope);
    const lowland = 1 - smoothStep(this.config.waterLevel + 24, 112, center.height);
    const highland = smoothStep(76, 180, center.height);
    const crossingCandidate = this.computeCrossingCandidate(x, z, center, slope);
    const passCandidate = this.computePassCandidate(x, z, center.height, slope);

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
      highland,
      floodplainCore,
      crossingCandidate,
      passCandidate
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

  private computeCrossingCandidate(
    x: number,
    z: number,
    center: ReturnType<ProceduralGenerator["sample"]>,
    slope: number
  ): number {
    const riverBand = smoothStep(0.05, 0.22, center.river) * (1 - smoothStep(0.35, 0.7, center.river));
    const flatBanks = 1 - smoothStep(0.06, 0.22, slope);
    const notLake = 1 - smoothStep(0.05, 0.2, center.lake);
    const widthHint = this.estimateLocalRiverWidth(x, z);
    const narrowEnough = 1 - smoothStep(18, 42, widthHint);
    return Scalar.Clamp(riverBand * flatBanks * notLake * narrowEnough, 0, 1);
  }

  private computePassCandidate(x: number, z: number, height: number, slope: number): number {
    const span = 28;
    const east = this.generator.sample(x + span, z).height;
    const west = this.generator.sample(x - span, z).height;
    const north = this.generator.sample(x, z + span).height;
    const south = this.generator.sample(x, z - span).height;
    const eastWestRelief = Math.min(east, west) - height;
    const northSouthRelief = Math.min(north, south) - height;
    const saddleRelief = Math.max(eastWestRelief, northSouthRelief);
    const highland = smoothStep(82, 190, height);
    const moderateSlope = 1 - smoothStep(0.2, 0.46, slope);
    return Scalar.Clamp(
      smoothStep(6, 28, saddleRelief) * highland * moderateSlope,
      0,
      1
    );
  }

  private estimateLocalRiverWidth(x: number, z: number): number {
    const span = 24;
    let support = 0;
    const offsets: readonly [number, number][] = [
      [span, 0],
      [-span, 0],
      [0, span],
      [0, -span]
    ];
    offsets.forEach(([dx, dz]) => {
      const sample = this.generator.sample(x + dx, z + dz);
      support += Math.max(sample.river, sample.flow * 0.45);
    });
    return support * 10;
  }
}

function smoothStep(min: number, max: number, value: number): number {
  if (max <= min) {
    return value >= max ? 1 : 0;
  }
  const t = Scalar.Clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
}

function buildContextTags(
  context: TerrainPoiContext,
  entries: readonly [string, number][]
): readonly string[] {
  const tags: string[] = [];
  entries.forEach(([label, value]) => {
    if (label === "flood-risk") {
      if (value > 0.6) {
        tags.push(label);
      }
      return;
    }
    if (value > 0.55) {
      tags.push(label);
    }
  });
  if (context.crossingCandidate > 0.68 && !tags.includes("ford")) {
    tags.push("ford");
  }
  if (context.passCandidate > 0.68 && !tags.includes("pass")) {
    tags.push("pass");
  }
  return tags;
}

function localSlopeToFlatness(slope: number): number {
  return 1 - smoothStep(0.05, 0.24, slope);
}
