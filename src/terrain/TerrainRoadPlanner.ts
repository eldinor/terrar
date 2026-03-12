import { Scalar } from "@babylonjs/core/Maths/math.scalar";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { ProceduralGenerator } from "./ProceduralGenerator";
import { TerrainConfig } from "./TerrainConfig";
import { TerrainPoi, TerrainPoiKind } from "./TerrainPoiPlanner";

export interface TerrainRoad {
  readonly id: string;
  readonly fromPoiId: string;
  readonly toPoiId: string;
  readonly points: readonly Vector3[];
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

      const limit = poi.kind === TerrainPoiKind.Harbor ? 2 : 1;
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
      (a.kind === TerrainPoiKind.Harbor || b.kind === TerrainPoiKind.Harbor ? -12 : 0) +
      (a.kind === b.kind ? 18 : 0);
    return distance + typeBias;
  }

  private routeBetweenPois(
    from: TerrainPoi,
    to: TerrainPoi
  ): { points: Vector3[]; cost: number } | null {
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
    return (
      planar *
      (1 + slope * 5.5) *
      riverPenalty *
      lakePenalty *
      flowPenalty *
      (1 - lowlandFavor * 0.18)
    );
  }

  private reconstructPath(
    cameFrom: Int32Array,
    endIndex: number,
    fromPoi: TerrainPoi,
    toPoi: TerrainPoi,
    cost: number
  ): { points: Vector3[]; cost: number } {
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
      return new Vector3(world.x, sample.height + 3.2, world.z);
    });

    points[0] = new Vector3(fromPoi.x, fromPoi.y + 3.2, fromPoi.z);
    points[points.length - 1] = new Vector3(toPoi.x, toPoi.y + 3.2, toPoi.z);

    return {
      points: simplifyRoadPoints(points),
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

function smoothStep(min: number, max: number, value: number): number {
  if (max <= min) {
    return value >= max ? 1 : 0;
  }
  const t = Scalar.Clamp((value - min) / (max - min), 0, 1);
  return t * t * (3 - 2 * t);
}

function simplifyRoadPoints(points: readonly Vector3[]): Vector3[] {
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
