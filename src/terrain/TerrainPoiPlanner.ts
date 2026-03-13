import { Scalar } from "@babylonjs/core/Maths/math.scalar";
import { ProceduralGenerator } from "./ProceduralGenerator";
import { TerrainConfig } from "./TerrainConfig";

export enum TerrainPoiKind {
  Village = "village",
  Outpost = "outpost",
  Mine = "mine"
}

export type TerrainMineResource = "coal" | "iron" | "copper";

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
  readonly mountainFlank: number;
  readonly summitExposure: number;
  readonly lakeShore: number;
  readonly crossroadsCandidate: number;
  readonly coal: number;
  readonly iron: number;
  readonly copper: number;
}

interface TerrainPoiArchetype {
  readonly kind: TerrainPoiKind;
  readonly maxCount: number;
  readonly radius: number;
  readonly minScore: number;
}

const POI_ARCHETYPES: readonly TerrainPoiArchetype[] = [
  { kind: TerrainPoiKind.Village, maxCount: 4, radius: 156, minScore: 0.58 },
  { kind: TerrainPoiKind.Outpost, maxCount: 2, radius: 168, minScore: 0.46 },
  { kind: TerrainPoiKind.Mine, maxCount: 4, radius: 148, minScore: 0.48 }
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
          candidates.get(TerrainPoiKind.Village)!,
          context,
          this.scoreWaterVillage(context)
        );
        this.pushCandidate(
          candidates.get(TerrainPoiKind.Outpost)!,
          context,
          this.scoreOutpost(context)
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
      if (archetype.kind === TerrainPoiKind.Mine) {
        this.selectMineCandidates(selected, list, archetype.minScore, maxCount, spacingRadius);
        return;
      }

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

  private scoreWaterVillage(context: TerrainPoiContext) {
    const shore = Math.max(context.coastProximity, context.lakeShore);
    const lowSlope = context.localFlatness;
    const fertile = context.sediment * 0.45 + context.moisture * 0.55;
    const safeFloodplain = 1 - context.floodplainCore;
    const value =
      shore * 0.16 +
      lowSlope * 0.12 +
      fertile * 0.1 +
      context.lowland * 0.06 +
      safeFloodplain * 0.04;
    return {
      kind: TerrainPoiKind.Village,
      value,
      radius: 128,
      tags: buildContextTags(context, [
        ["water", Math.max(context.waterNearby, shore)],
        ["coast", context.coastProximity],
        ["lake", context.lakeShore],
        ["fertile", fertile]
      ])
    };
  }

  private scoreOutpost(context: TerrainPoiContext) {
    const buildable = context.localFlatness;
    const moderateHeight =
      smoothStep(this.config.waterLevel + 18, 72, context.height) *
      (1 - smoothStep(180, 300, context.height));
    const travelerWater = Math.max(context.waterNearby * 0.6, context.lakeShore * 0.35);
    const safeFloodplain = 1 - context.floodplainCore;
    const value =
      context.crossroadsCandidate * 0.38 +
      context.passCandidate * 0.18 +
      context.crossingCandidate * 0.16 +
      buildable * 0.14 +
      moderateHeight * 0.08 +
      travelerWater * 0.06 +
      safeFloodplain * 0.08;
    return {
      kind: TerrainPoiKind.Outpost,
      value,
      radius: 118,
      tags: buildContextTags(context, [
        ["crossroads", context.crossroadsCandidate],
        ["pass", context.passCandidate],
        ["ford", context.crossingCandidate],
        ["flat", buildable],
        ["pass", context.passCandidate]
      ])
    };
  }

  private scoreMine(context: TerrainPoiContext) {
    const rocky =
      smoothStep(0.06, 0.2, context.slope) * 0.58 +
      context.highland * 0.42;
    const dry = 1 - (context.waterNearby * 0.42 + context.sediment * 0.12);
    const moderateSlope =
      smoothStep(0.05, 0.12, context.slope) *
      (1 - smoothStep(0.2, 0.3, context.slope));
    const steepPenalty = 1 - smoothStep(0.22, 0.34, context.slope);
    const accessibleBench =
      context.localFlatness * 0.38 +
      context.passCandidate * 0.22 +
      context.crossroadsCandidate * 0.08 +
      (1 - context.floodplainCore) * 0.22 +
      moderateSlope * 0.1;
    const resource = selectMineResource(context);
    const value =
      (resource.score * 0.34 +
        rocky * 0.22 +
        context.mountainFlank * 0.38 +
        dry * 0.1 +
        accessibleBench * 0.18) *
      steepPenalty *
      (1 - context.summitExposure * 0.68);
    return {
      kind: TerrainPoiKind.Mine,
      value,
      radius: 120,
      tags: buildContextTags(context, [
        [resource.kind, resource.score],
        ["rock", rocky],
        ["dry", dry],
        ["foothill", context.mountainFlank],
        ["bench", accessibleBench],
        ["summit", context.summitExposure],
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
    const crossroadsCandidate = this.computeCrossroadsCandidate(
      x,
      z,
      center.height,
      slope,
      crossingCandidate,
      passCandidate
    );
    const mountainFlank = Scalar.Clamp(
      highland *
        smoothStep(0.08, 0.24, slope) *
        (1 - smoothStep(0.34, 0.74, prominence)),
      0,
      1
    );
    const summitExposure = Scalar.Clamp(
      highland *
        smoothStep(0.26, 0.72, prominence) *
        smoothStep(0.08, 0.24, slope),
      0,
      1
    );
    const lakeShore = Scalar.Clamp(
      Math.max(center.lake, waterNearby * 0.55) * (1 - coastProximity),
      0,
      1
    );
    const coal = center.coal;
    const iron = center.iron;
    const copper = center.copper;

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
      passCandidate,
      mountainFlank,
      summitExposure,
      lakeShore,
      crossroadsCandidate,
      coal,
      iron,
      copper
    };
  }

  private computeCoastProximity(height: number): number {
    return 1 - smoothStep(6, 28, Math.abs(height - this.config.waterLevel));
  }

  private selectMineCandidates(
    selected: TerrainPoiCandidate[],
    list: readonly TerrainPoiCandidate[],
    minScore: number,
    maxCount: number,
    spacingRadius: number
  ): void {
    const remaining = [...list];

    while (
      selected.filter((site) => site.kind === TerrainPoiKind.Mine).length < maxCount &&
      remaining.length > 0
    ) {
      let bestIndex = -1;
      let bestAdjustedScore = minScore;

      for (let index = 0; index < remaining.length; index += 1) {
        const candidate = remaining[index];
        if (candidate.score < minScore) {
          break;
        }
        if (!this.canPlaceCandidate(selected, candidate, spacingRadius)) {
          continue;
        }

        const adjustedScore =
          candidate.score + computeMineDiversityBonus(selected, candidate);
        if (adjustedScore > bestAdjustedScore) {
          bestAdjustedScore = adjustedScore;
          bestIndex = index;
        }
      }

      if (bestIndex < 0) {
        break;
      }

      selected.push(remaining[bestIndex]);
      remaining.splice(bestIndex, 1);
    }
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

  private computeCrossroadsCandidate(
    x: number,
    z: number,
    height: number,
    slope: number,
    crossingCandidate: number,
    passCandidate: number
  ): number {
    const span = 36;
    const directions: readonly [number, number][] = [
      [span, 0],
      [-span, 0],
      [0, span],
      [0, -span]
    ];
    let accessibleDirections = 0;
    directions.forEach(([dx, dz]) => {
      const sample = this.generator.sample(x + dx, z + dz);
      const grade = Math.abs(sample.height - height) / span;
      if (grade < 0.22) {
        accessibleDirections += 1;
      }
    });

    const openness = smoothStep(2, 4, accessibleDirections);
    const buildable = 1 - smoothStep(0.08, 0.24, slope);
    const moderateHeight =
      smoothStep(this.config.waterLevel + 18, 70, height) *
      (1 - smoothStep(180, 300, height));
    return Scalar.Clamp(
      openness * 0.46 +
        crossingCandidate * 0.22 +
        passCandidate * 0.16 +
        buildable * 0.1 +
        moderateHeight * 0.06,
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
  if (context.crossroadsCandidate > 0.62 && !tags.includes("crossroads")) {
    tags.push("crossroads");
  }
  return tags;
}

function localSlopeToFlatness(slope: number): number {
  return 1 - smoothStep(0.05, 0.24, slope);
}

function selectMineResource(
  context: TerrainPoiContext
): { kind: TerrainMineResource; score: number } {
  const iron =
    context.iron * (0.82 + context.highland * 0.2 + context.mountainFlank * 0.26);
  const copper =
    context.copper * (0.8 + smoothStep(0.08, 0.18, context.slope) * 0.2 + context.highland * 0.18);
  const coal =
    context.coal *
    (0.46 + (1 - context.highland) * 0.08 + context.localFlatness * 0.04);

  if (iron >= copper && iron >= coal) {
    return { kind: "iron", score: iron };
  }
  if (copper >= coal) {
    return { kind: "copper", score: copper };
  }
  return { kind: "coal", score: coal };
}

export function getMineResourceKind(
  site: Pick<TerrainPoi, "kind" | "tags">
): TerrainMineResource | null {
  if (site.kind !== TerrainPoiKind.Mine) {
    return null;
  }

  if (site.tags.includes("iron")) {
    return "iron";
  }
  if (site.tags.includes("copper")) {
    return "copper";
  }
  if (site.tags.includes("coal")) {
    return "coal";
  }

  return null;
}

function computeMineDiversityBonus(
  selected: readonly TerrainPoiCandidate[],
  candidate: TerrainPoiCandidate
): number {
  const resource = getMineResourceKind(candidate);
  if (!resource) {
    return 0;
  }

  let matchingCount = 0;
  selected.forEach((site) => {
    if (site.kind === TerrainPoiKind.Mine && getMineResourceKind(site) === resource) {
      matchingCount += 1;
    }
  });

  return matchingCount === 0 ? 0.18 : -matchingCount * 0.12;
}
