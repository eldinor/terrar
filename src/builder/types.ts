import type { BuiltTerrainConfig } from "./config";

export type BuiltTerrainPoiKind = "village" | "outpost" | "mine";

export interface BuiltTerrainSnapshotField {
  readonly byteOffset: number;
  readonly length: number;
}

export interface BuiltTerrainSnapshotFields {
  readonly terrainHeightField: BuiltTerrainSnapshotField;
  readonly flowField: BuiltTerrainSnapshotField;
  readonly riverField: BuiltTerrainSnapshotField;
  readonly lakeField: BuiltTerrainSnapshotField;
  readonly lakeSurfaceField: BuiltTerrainSnapshotField;
  readonly sedimentField: BuiltTerrainSnapshotField;
  readonly coalField: BuiltTerrainSnapshotField;
  readonly ironField: BuiltTerrainSnapshotField;
  readonly copperField: BuiltTerrainSnapshotField;
}

export interface BuiltTerrainSnapshot {
  readonly analysisResolution: number;
  readonly analysisStep: number;
  readonly buffer: ArrayBuffer | SharedArrayBuffer;
  readonly shared: boolean;
  readonly fields: BuiltTerrainSnapshotFields;
}

export interface BuiltTerrainPoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface BuiltTerrainPoi {
  readonly id: string;
  readonly kind: BuiltTerrainPoiKind;
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
  readonly config: BuiltTerrainConfig;
  readonly poiSites: readonly BuiltTerrainPoi[];
  readonly roads: readonly BuiltTerrainRoad[];
  readonly packedSnapshot: BuiltTerrainSnapshot;
}
