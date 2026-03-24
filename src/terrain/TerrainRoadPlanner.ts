import { Scalar } from "@babylonjs/core/Maths/math.scalar";
import { ProceduralGenerator } from "./ProceduralGenerator";
import { TerrainConfig } from "./TerrainConfig";
import { TerrainPoi, TerrainPoiKind } from "./TerrainPoiPlanner";

export interface TerrainPoint3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface TerrainRoad {
  readonly id: string;
  readonly fromPoiId: string;
  readonly toPoiId: string;
  readonly points: readonly TerrainPoint3[];
  readonly cost: number;
}

interface RoadCandidate {
  readonly from: TerrainPoi;
  readonly to: TerrainPoi;
  readonly score: number;
}

interface GridNode {
  readonly x: number;
  readonly z: number;
  readonly index: number;
}

export class TerrainRoadPlanner {
  private readonly gridResolution: number;
  private readonly step: number;
  private readonly worldMin: number;

  constructor(
    private readonly config: TerrainConfig,
    private readonly generator: ProceduralGenerator
  ) {
    this.gridResolution = 65;
    this.step = this.config.worldSize / (this.gridResolution - 1);
    this.worldMin = this.config.worldMin;
  }

  generateRoads(pois: readonly TerrainPoi[]): TerrainRoad[] {
    if (pois.length < 2) {
      return [];
    }

    const candidates = this.buildRoadCandidates(pois);
    const roads: TerrainRoad[] = [];
    const seenPairs = new Set<string>();

    candidates.forEach((candidate) => {
      const pairKey = buildPairKey(candidate.from.id, candidate.to.id);
      if (seenPairs.has(pairKey)) {
        return;
      }

      const routed = this.routeBetweenPois(candidate.from, candidate.to);
      if (!routed) {
        return;
      }

      seenPairs.add(pairKey);
      roads.push({
        id: `road-${candidate.from.id}-${candidate.to.id}`,
        fromPoiId: candidate.from.id,
        toPoiId: candidate.to.id,
        points: routed.points,
        cost: routed.cost
      });
    });

    return roads;
  }

  private buildRoadCandidates(pois: readonly TerrainPoi[]): RoadCandidate[] {
    const candidates: RoadCandidate[] = [];

    pois.forEach((poi) => {
      const sorted = pois
        .filter((other) => other.id !== poi.id)
        .map((other) => ({
          other,
          score: this.computeConnectionScore(poi, other)
        }))
        .sort((a, b) => a.score - b.score);

      const limit = 1;
      sorted.slice(0, limit).forEach(({ other, score }) => {
        candidates.push({ from: poi, to: other, score });
      });
    });

    candidates.sort((a, b) => a.score - b.score);
    return candidates;
  }

  private computeConnectionScore(a: TerrainPoi, b: TerrainPoi): number {
    const distance = planarDistance(a, b);
    const typeBias =
      (a.kind === TerrainPoiKind.Village || b.kind === TerrainPoiKind.Village ? -22 : 0) +
      (a.kind === TerrainPoiKind.Outpost || b.kind === TerrainPoiKind.Outpost ? -16 : 0) +
      (hasTag(a, "ford") || hasTag(b, "ford") ? -14 : 0) +
      (hasTag(a, "pass") || hasTag(b, "pass") ? -10 : 0) +
      (hasTag(a, "crossroads") || hasTag(b, "crossroads") ? -12 : 0) +
      (a.kind === b.kind ? 18 : 0);
    return distance + typeBias;
  }

  private routeBetweenPois(
    from: TerrainPoi,
    to: TerrainPoi
  ): { points: TerrainPoint3[]; cost: number } | null {
    const start = this.toGridNode(from.x, from.z);
    const goal = this.toGridNode(to.x, to.z);
    const open = new MinPriorityQueue();
    const cameFrom = new Int32Array(this.gridResolution * this.gridResolution);
    cameFrom.fill(-1);
    const gScore = new Float32Array(this.gridResolution * this.gridResolution);
    gScore.fill(Number.POSITIVE_INFINITY);

    gScore[start.index] = 0;
    open.push(start.index, this.heuristic(start, goal));

    while (open.size > 0) {
      const currentIndex = open.pop()!;
      if (currentIndex === goal.index) {
        return this.reconstructPath(cameFrom, currentIndex, from, to, gScore[currentIndex]);
      }

      const current = this.indexToNode(currentIndex);
      for (const [dx, dz] of NEIGHBOR_OFFSETS) {
        const nx = current.x + dx;
        const nz = current.z + dz;
        if (nx < 0 || nz < 0 || nx >= this.gridResolution || nz >= this.gridResolution) {
          continue;
        }

        const neighbor = this.node(nx, nz);
        const stepCost = this.computeStepCost(current, neighbor);
        const tentative = gScore[currentIndex] + stepCost;
        if (tentative >= gScore[neighbor.index]) {
          continue;
        }

        cameFrom[neighbor.index] = currentIndex;
        gScore[neighbor.index] = tentative;
        open.push(neighbor.index, tentative + this.heuristic(neighbor, goal));
      }
    }

    return null;
  }

  private computeStepCost(from: GridNode, to: GridNode): number {
    const fromPos = this.toWorld(from);
    const toPos = this.toWorld(to);
    const fromSample = this.generator.sample(fromPos.x, fromPos.z);
    const toSample = this.generator.sample(toPos.x, toPos.z);
    const planar = Math.sqrt(
      (toPos.x - fromPos.x) * (toPos.x - fromPos.x) +
        (toPos.z - fromPos.z) * (toPos.z - fromPos.z)
    );
    const slope = Math.abs(toSample.height - fromSample.height) / Math.max(planar, 1);
    const riverPenalty = Scalar.Lerp(1, 3.6, Math.max(fromSample.river, toSample.river));
    const lakePenalty = Scalar.Lerp(1, 8, Math.max(fromSample.lake, toSample.lake));
    const lowlandFavor =
      1 - smoothStep(this.config.waterLevel + 42, 160, (fromSample.height + toSample.height) * 0.5);
    const flowPenalty = 1 + Math.max(fromSample.flow, toSample.flow) * 0.9;
    const crossingBonus = this.computeCrossingBonus(fromPos.x, fromPos.z, toPos.x, toPos.z);
    const passBonus = this.computePassBonus(toPos.x, toPos.z, toSample.height, slope);
    const floodplainPenalty = this.computeFloodplainPenalty(fromSample, toSample, slope);
    const steepPenalty =
      1 +
      smoothStep(0.08, 0.2, slope) * 2.8 +
      smoothStep(0.18, 0.32, slope) * 8 +
      smoothStep(0.3, 0.46, slope) * 18;
    return (
      planar *
      steepPenalty *
      riverPenalty *
      lakePenalty *
      flowPenalty *
      floodplainPenalty *
      (1 - lowlandFavor * 0.18) *
      (1 - crossingBonus * 0.45) *
      (1 - passBonus * 0.28)
    );
  }

  private reconstructPath(
    cameFrom: Int32Array,
    endIndex: number,
    fromPoi: TerrainPoi,
    toPoi: TerrainPoi,
    cost: number
  ): { points: TerrainPoint3[]; cost: number } {
    const path: GridNode[] = [];
    let currentIndex = endIndex;
    while (currentIndex >= 0) {
      path.push(this.indexToNode(currentIndex));
      currentIndex = cameFrom[currentIndex];
    }
    path.reverse();

    const points = path.map((node) => {
      const world = this.toWorld(node);
      const sample = this.generator.sample(world.x, world.z);
      return { x: world.x, y: sample.height + 3.2, z: world.z };
    });
    const approachedPoints = applyPoiApproachPoints(
      points,
      fromPoi,
      toPoi,
      this.generator
    );

    return {
      points: smoothRoadPoints(
        simplifyRoadPoints(approachedPoints),
        this.generator,
        fromPoi,
        toPoi
      ),
      cost
    };
  }

  private heuristic(a: GridNode, b: GridNode): number {
    const dx = a.x - b.x;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dz * dz) * this.step;
  }

  private toGridNode(worldX: number, worldZ: number): GridNode {
    const x = Scalar.Clamp(
      Math.round((worldX - this.worldMin) / this.step),
      0,
      this.gridResolution - 1
    );
    const z = Scalar.Clamp(
      Math.round((worldZ - this.worldMin) / this.step),
      0,
      this.gridResolution - 1
    );
    return this.node(x, z);
  }

  private toWorld(node: GridNode): { x: number; z: number } {
    return {
      x: this.worldMin + node.x * this.step,
      z: this.worldMin + node.z * this.step
    };
  }

  private node(x: number, z: number): GridNode {
    return {
      x,
      z,
      index: z * this.gridResolution + x
    };
  }

  private indexToNode(index: number): GridNode {
    return this.node(index % this.gridResolution, Math.floor(index / this.gridResolution));
  }

  private computeCrossingBonus(
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number
  ): number {
    const midX = (fromX + toX) * 0.5;
    const midZ = (fromZ + toZ) * 0.5;
    const sample = this.generator.sample(midX, midZ);
    if (sample.lake > 0.05 || sample.river < 0.04) {
      return 0;
    }

    const widthHint = estimateCrossingWidth(this.generator, midX, midZ);
    const narrowEnough = 1 - smoothStep(16, 40, widthHint);
    const flatBanks = 1 - estimateLocalSlope(this.generator, midX, midZ, 10);
    return Scalar.Clamp(
      smoothStep(0.06, 0.22, sample.river) * narrowEnough * flatBanks,
      0,
      1
    );
  }

  private computePassBonus(
    x: number,
    z: number,
    height: number,
    slope: number
  ): number {
    const span = this.step * 1.5;
    const east = this.generator.sample(x + span, z).height;
    const west = this.generator.sample(x - span, z).height;
    const north = this.generator.sample(x, z + span).height;
    const south = this.generator.sample(x, z - span).height;
    const saddleRelief = Math.max(Math.min(east, west) - height, Math.min(north, south) - height);
    const highEnough = smoothStep(72, 180, height);
    const moderateSlope = 1 - smoothStep(0.12, 0.28, slope);
    return Scalar.Clamp(
      smoothStep(4, 20, saddleRelief) * highEnough * moderateSlope,
      0,
      1
    );
  }

  private computeFloodplainPenalty(
    fromSample: ReturnType<ProceduralGenerator["sample"]>,
    toSample: ReturnType<ProceduralGenerator["sample"]>,
    slope: number
  ): number {
    const flow = Math.max(fromSample.flow, toSample.flow);
    const river = Math.max(fromSample.river, toSample.river);
    const sediment = Math.max(fromSample.sediment, toSample.sediment);
    const lowHeight = (fromSample.height + toSample.height) * 0.5;
    const floodplainCore =
      smoothStep(0.18, 0.44, flow) *
      smoothStep(0.06, 0.26, river) *
      smoothStep(0.1, 0.42, sediment) *
      (1 - smoothStep(this.config.waterLevel + 18, 128, lowHeight)) *
      (1 - smoothStep(0.05, 0.18, slope));
    return 1 + floodplainCore * 1.8;
  }
}

const NEIGHBOR_OFFSETS: readonly [number, number][] = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
  [-1, -1],
  [1, -1],
  [-1, 1],
  [1, 1]
] as const;

function planarDistance(a: TerrainPoi, b: TerrainPoi): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function buildPairKey(a: string, b: string): string {
  return [a, b].sort().join("|");
}

function hasTag(poi: TerrainPoi, tag: string): boolean {
  return poi.tags.includes(tag);
}

function smoothStep(min: number, max: number, value: number): number {
  if (max <= min) {
    return value >= max ? 1 : 0;
  }
  const t = Scalar.Clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
}

function simplifyRoadPoints(points: readonly TerrainPoint3[]): TerrainPoint3[] {
  if (points.length <= 2) {
    return [...points];
  }

  const simplified = [points[0]];
  for (let index = 1; index < points.length - 1; index += 1) {
    const prev = simplified[simplified.length - 1];
    const current = points[index];
    const next = points[index + 1];
    const dx1 = current.x - prev.x;
    const dz1 = current.z - prev.z;
    const dx2 = next.x - current.x;
    const dz2 = next.z - current.z;
    const cross = Math.abs(dx1 * dz2 - dz1 * dx2);
    if (cross > 2) {
      simplified.push(current);
    }
  }
  simplified.push(points[points.length - 1]);
  return simplified;
}

function smoothRoadPoints(
  points: readonly TerrainPoint3[],
  generator: ProceduralGenerator,
  fromPoi: TerrainPoi,
  toPoi: TerrainPoi
): TerrainPoint3[] {
  if (points.length <= 2) {
    return [...points];
  }

  let smoothed = [...points];
  const passes = Math.min(2, Math.max(1, Math.floor(points.length / 6)));

  for (let pass = 0; pass < passes; pass += 1) {
    const next: TerrainPoint3[] = [{ ...smoothed[0] }];

    for (let index = 1; index < smoothed.length - 1; index += 1) {
      const previous = smoothed[index - 1];
      const current = smoothed[index];
      const following = smoothed[index + 1];
      const before = lerpPoint(previous, current, 0.78);
      const after = lerpPoint(current, following, 0.22);

      next.push(clampRoadPointToSurface(before, generator));
      next.push(clampRoadPointToSurface(after, generator));
    }

    next.push({ ...smoothed[smoothed.length - 1] });
    smoothed = simplifyRoadPoints(next);
  }

  smoothed[0] = { x: fromPoi.x, y: fromPoi.y + 3.2, z: fromPoi.z };
  smoothed[smoothed.length - 1] = { x: toPoi.x, y: toPoi.y + 3.2, z: toPoi.z };
  return ensurePoiApproachPoints(smoothed, fromPoi, toPoi, generator);
}

function applyPoiApproachPoints(
  points: readonly TerrainPoint3[],
  fromPoi: TerrainPoi,
  toPoi: TerrainPoi,
  generator: ProceduralGenerator
): TerrainPoint3[] {
  const fromCenter = { x: fromPoi.x, y: fromPoi.y + 3.2, z: fromPoi.z };
  const toCenter = { x: toPoi.x, y: toPoi.y + 3.2, z: toPoi.z };

  if (points.length <= 1) {
    return [fromCenter, toCenter];
  }

  const approached = [...points];
  approached[0] = fromCenter;
  approached[approached.length - 1] = toCenter;

  const startApproach = createPoiApproachPoint(fromPoi, approached[1], generator);
  const endApproach = createPoiApproachPoint(
    toPoi,
    approached[Math.max(approached.length - 2, 0)],
    generator
  );

  if (startApproach) {
    approached.splice(1, 0, startApproach);
  }

  if (endApproach) {
    approached.splice(approached.length - 1, 0, endApproach);
  }

  return approached;
}

function ensurePoiApproachPoints(
  points: readonly TerrainPoint3[],
  fromPoi: TerrainPoi,
  toPoi: TerrainPoi,
  generator: ProceduralGenerator
): TerrainPoint3[] {
  if (points.length <= 1) {
    return [...points];
  }

  const ensured = [...points];
  const fromApproach = createPoiApproachPoint(
    fromPoi,
    ensured[Math.min(ensured.length - 1, 1)],
    generator
  );
  if (
    fromApproach &&
    !hasNearbyApproachPoint(ensured.slice(1, Math.min(4, ensured.length - 1)), fromPoi, 4, 14)
  ) {
    ensured.splice(1, 0, fromApproach);
  }

  const toApproach = createPoiApproachPoint(
    toPoi,
    ensured[Math.max(0, ensured.length - 2)],
    generator
  );
  if (
    toApproach &&
    !hasNearbyApproachPoint(
      ensured.slice(Math.max(1, ensured.length - 4), ensured.length - 1),
      toPoi,
      4,
      14
    )
  ) {
    ensured.splice(ensured.length - 1, 0, toApproach);
  }

  ensured[0] = { x: fromPoi.x, y: fromPoi.y + 3.2, z: fromPoi.z };
  ensured[ensured.length - 1] = { x: toPoi.x, y: toPoi.y + 3.2, z: toPoi.z };
  return ensured;
}

function createPoiApproachPoint(
  poi: TerrainPoi,
  toward: TerrainPoint3,
  generator: ProceduralGenerator
): TerrainPoint3 | null {
  const dx = toward.x - poi.x;
  const dz = toward.z - poi.z;
  const length = Math.sqrt(dx * dx + dz * dz);
  if (length < 0.001) {
    return null;
  }

  const radius = getPoiApproachRadius(poi.kind);
  const x = poi.x + (dx / length) * radius;
  const z = poi.z + (dz / length) * radius;
  const sample = generator.sample(x, z);
  return { x, y: sample.height + 3.2, z };
}

function getPoiApproachRadius(kind: TerrainPoiKind): number {
  switch (kind) {
    case TerrainPoiKind.Village:
      return 10.5;
    case TerrainPoiKind.Outpost:
      return 8.5;
    case TerrainPoiKind.Mine:
      return 9.5;
  }
}

function hasNearbyApproachPoint(
  points: readonly TerrainPoint3[],
  poi: TerrainPoi,
  minDistance: number,
  maxDistance: number
): boolean {
  return points.some((point) => {
    const distance = Math.hypot(point.x - poi.x, point.z - poi.z);
    return distance > minDistance && distance < maxDistance;
  });
}

function clampRoadPointToSurface(
  point: TerrainPoint3,
  generator: ProceduralGenerator
): TerrainPoint3 {
  const sample = generator.sample(point.x, point.z);
  return { x: point.x, y: sample.height + 3.2, z: point.z };
}

function estimateCrossingWidth(
  generator: ProceduralGenerator,
  x: number,
  z: number
): number {
  const span = 20;
  const samples = [
    generator.sample(x + span, z),
    generator.sample(x - span, z),
    generator.sample(x, z + span),
    generator.sample(x, z - span)
  ];
  return samples.reduce((sum, sample) => sum + Math.max(sample.river, sample.flow * 0.4), 0) * 10;
}

function estimateLocalSlope(
  generator: ProceduralGenerator,
  x: number,
  z: number,
  step: number
): number {
  const left = generator.sample(x - step, z).height;
  const right = generator.sample(x + step, z).height;
  const down = generator.sample(x, z - step).height;
  const up = generator.sample(x, z + step).height;
  const gradX = (right - left) / (step * 2);
  const gradZ = (up - down) / (step * 2);
  return smoothStep(0.03, 0.2, Math.sqrt(gradX * gradX + gradZ * gradZ));
}

function lerpPoint(a: TerrainPoint3, b: TerrainPoint3, t: number): TerrainPoint3 {
  return {
    x: Scalar.Lerp(a.x, b.x, t),
    y: Scalar.Lerp(a.y, b.y, t),
    z: Scalar.Lerp(a.z, b.z, t)
  };
}

class MinPriorityQueue {
  private readonly entries: { index: number; priority: number }[] = [];

  get size(): number {
    return this.entries.length;
  }

  push(index: number, priority: number): void {
    const entry = { index, priority };
    this.entries.push(entry);
    this.bubbleUp(this.entries.length - 1);
  }

  pop(): number | null {
    if (this.entries.length === 0) {
      return null;
    }
    const first = this.entries[0].index;
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
