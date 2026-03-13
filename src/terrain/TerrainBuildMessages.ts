import type { TerrainConfig, TerrainLODLevel } from "./TerrainConfig";
import type { TerrainPoiKind } from "./TerrainPoiPlanner";
export interface SerializedPoint3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface SerializedTerrainPoi {
  readonly id: string;
  readonly kind: TerrainPoiKind;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly score: number;
  readonly radius: number;
  readonly tags: readonly string[];
}

export interface SerializedTerrainRoad {
  readonly id: string;
  readonly fromPoiId: string;
  readonly toPoiId: string;
  readonly points: readonly SerializedPoint3[];
  readonly cost: number;
}

export interface SerializedWorldBuildData {
  readonly poiSites: readonly SerializedTerrainPoi[];
  readonly roads: readonly SerializedTerrainRoad[];
  readonly snapshot: PackedTerrainSnapshotMessage;
}

export interface PackedTerrainSnapshotFieldMessage {
  readonly byteOffset: number;
  readonly length: number;
}

export interface PackedTerrainSnapshotMessage {
  readonly analysisResolution: number;
  readonly analysisStep: number;
  readonly buffer: ArrayBuffer | SharedArrayBuffer;
  readonly shared: boolean;
  readonly fields: {
    readonly terrainHeightField: PackedTerrainSnapshotFieldMessage;
    readonly flowField: PackedTerrainSnapshotFieldMessage;
    readonly riverField: PackedTerrainSnapshotFieldMessage;
    readonly lakeField: PackedTerrainSnapshotFieldMessage;
    readonly lakeSurfaceField: PackedTerrainSnapshotFieldMessage;
    readonly sedimentField: PackedTerrainSnapshotFieldMessage;
    readonly coalField: PackedTerrainSnapshotFieldMessage;
    readonly ironField: PackedTerrainSnapshotFieldMessage;
    readonly copperField: PackedTerrainSnapshotFieldMessage;
  };
}

export interface BuildWorldRequest {
  readonly type: "buildWorld";
  readonly buildVersion: number;
  readonly config: TerrainConfig;
  readonly preferSharedSnapshot: boolean;
}

export interface BuildWorldSuccessResponse {
  readonly type: "worldBuilt";
  readonly buildVersion: number;
  readonly data: SerializedWorldBuildData;
}

export interface BuildWorldErrorResponse {
  readonly type: "worldBuildError";
  readonly buildVersion: number;
  readonly message: string;
}

export interface PrepareChunkBuildRequest {
  readonly type: "prepareChunkBuild";
  readonly buildVersion: number;
  readonly config: TerrainConfig;
  readonly poiSites: readonly SerializedTerrainPoi[];
  readonly roads: readonly SerializedTerrainRoad[];
  readonly snapshot: PackedTerrainSnapshotMessage;
}

export interface ChunkBuildReadyResponse {
  readonly type: "chunkBuildReady";
  readonly buildVersion: number;
}

export interface BuildChunkRequest {
  readonly type: "buildChunk";
  readonly buildVersion: number;
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly lods: readonly TerrainLODLevel[];
}

export interface SerializedChunkMeshData {
  readonly lod: TerrainLODLevel;
  readonly positions: ArrayBuffer;
  readonly indices: ArrayBuffer;
  readonly normals: ArrayBuffer;
  readonly uvs: ArrayBuffer;
  readonly uvs2: ArrayBuffer;
  readonly uvs3: ArrayBuffer;
  readonly uvs4: ArrayBuffer;
  readonly colors: ArrayBuffer;
}

export interface BuildChunkSuccessResponse {
  readonly type: "chunkBuilt";
  readonly buildVersion: number;
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly meshes: readonly SerializedChunkMeshData[];
}

export interface ChunkBuildErrorResponse {
  readonly type: "chunkBuildError";
  readonly buildVersion: number;
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly message: string;
}

export type WorldBuildWorkerRequest = BuildWorldRequest;

export type WorldBuildWorkerResponse =
  | BuildWorldSuccessResponse
  | BuildWorldErrorResponse;

export type ChunkBuildWorkerRequest =
  | PrepareChunkBuildRequest
  | BuildChunkRequest;

export type ChunkBuildWorkerResponse =
  | ChunkBuildReadyResponse
  | BuildChunkSuccessResponse
  | ChunkBuildErrorResponse;
