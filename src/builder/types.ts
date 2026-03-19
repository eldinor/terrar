import type { PackedTerrainSnapshot } from "../terrain/TerrainSnapshotLayout";
import type { TerrainConfig } from "../terrain/TerrainConfig";
import type { TerrainPoiKind } from "../terrain/TerrainPoiPlanner";

export interface BuiltTerrainPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface BuiltTerrainPoi {
  readonly id: string;
  readonly kind: TerrainPoiKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly score: number;
  readonly radius: number;
  readonly tags: readonly string[];
}

export interface BuiltTerrainRoad {
  readonly id: string;
  readonly fromPoiId: string;
  readonly toPoiId: string;
  readonly points: readonly BuiltTerrainPoint[];
  readonly cost: number;
}

export interface BuiltTerrain {
  readonly config: TerrainConfig;
  readonly poiSites: readonly BuiltTerrainPoi[];
  readonly roads: readonly BuiltTerrainRoad[];
  readonly packedSnapshot: PackedTerrainSnapshot;
}
