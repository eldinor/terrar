import type {
  BuiltTerrain,
  BuiltTerrainPoi,
  BuiltTerrainRoad,
  BuiltTerrainSnapshot,
  TerrainAsset,
} from "./types";
import type { BuiltTerrainConfig } from "./config";

export const TERRAIN_ASSET_VERSION = 1 as const;

export interface SerializedTerrainAssetSnapshot {
  readonly analysisResolution: number;
  readonly analysisStep: number;
  readonly shared: boolean;
  readonly bufferBase64: string;
  readonly fields: BuiltTerrainSnapshot["fields"];
}

export interface SerializedTerrainAsset {
  readonly version: typeof TERRAIN_ASSET_VERSION;
  readonly terrain: {
    readonly config: BuiltTerrainConfig;
    readonly poiSites: readonly BuiltTerrainPoi[];
    readonly roads: readonly BuiltTerrainRoad[];
    readonly packedSnapshot: SerializedTerrainAssetSnapshot;
  };
}

export function createSerializedTerrainAsset(
  terrain: TerrainAsset,
): SerializedTerrainAsset {
  return {
    version: TERRAIN_ASSET_VERSION,
    terrain: {
      config: terrain.config,
      poiSites: terrain.poiSites.map(clonePoi),
      roads: terrain.roads.map(cloneRoad),
      packedSnapshot: serializeSnapshot(terrain.packedSnapshot),
    },
  };
}

export function serializeTerrainAsset(terrain: TerrainAsset): string {
  return JSON.stringify(createSerializedTerrainAsset(terrain));
}

export function deserializeTerrainAsset(
  serialized: string | SerializedTerrainAsset,
): TerrainAsset {
  const asset = typeof serialized === "string"
    ? (JSON.parse(serialized) as unknown)
    : serialized;

  return terrainAssetFromSerializedAsset(validateSerializedTerrainAsset(asset));
}

export function validateSerializedTerrainAsset(
  value: unknown,
): SerializedTerrainAsset {
  if (!isSerializedTerrainAsset(value)) {
    throw new Error("Invalid terrain asset payload.");
  }

  if (value.version !== TERRAIN_ASSET_VERSION) {
    throw new Error(
      `Unsupported terrain asset version ${String(value.version)}.`,
    );
  }

  return value;
}

function terrainAssetFromSerializedAsset(
  asset: SerializedTerrainAsset,
): BuiltTerrain {
  return {
    config: asset.terrain.config,
    poiSites: asset.terrain.poiSites.map(clonePoi),
    roads: asset.terrain.roads.map(cloneRoad),
    packedSnapshot: deserializeSnapshot(asset.terrain.packedSnapshot),
  };
}

function serializeSnapshot(
  snapshot: BuiltTerrainSnapshot,
): SerializedTerrainAssetSnapshot {
  return {
    analysisResolution: snapshot.analysisResolution,
    analysisStep: snapshot.analysisStep,
    shared: snapshot.shared,
    bufferBase64: encodeArrayBufferBase64(snapshot.buffer),
    fields: cloneSnapshotFields(snapshot.fields),
  };
}

function deserializeSnapshot(
  snapshot: SerializedTerrainAssetSnapshot,
): BuiltTerrainSnapshot {
  return {
    analysisResolution: snapshot.analysisResolution,
    analysisStep: snapshot.analysisStep,
    shared: snapshot.shared,
    buffer: decodeArrayBufferBase64(snapshot.bufferBase64),
    fields: cloneSnapshotFields(snapshot.fields),
  };
}

function cloneSnapshotFields(
  fields: BuiltTerrainSnapshot["fields"],
): BuiltTerrainSnapshot["fields"] {
  return {
    terrainHeightField: { ...fields.terrainHeightField },
    flowField: { ...fields.flowField },
    riverField: { ...fields.riverField },
    lakeField: { ...fields.lakeField },
    lakeSurfaceField: { ...fields.lakeSurfaceField },
    sedimentField: { ...fields.sedimentField },
    coalField: { ...fields.coalField },
    ironField: { ...fields.ironField },
    copperField: { ...fields.copperField },
  };
}

function clonePoi(poi: BuiltTerrainPoi): BuiltTerrainPoi {
  return {
    id: poi.id,
    kind: poi.kind,
    x: poi.x,
    y: poi.y,
    z: poi.z,
    score: poi.score,
    radius: poi.radius,
    tags: [...poi.tags],
  };
}

function cloneRoad(road: BuiltTerrainRoad): BuiltTerrainRoad {
  return {
    id: road.id,
    fromPoiId: road.fromPoiId,
    toPoiId: road.toPoiId,
    cost: road.cost,
    points: road.points.map((point) => ({ ...point })),
  };
}

function encodeArrayBufferBase64(buffer: ArrayBuffer | SharedArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const maybeBuffer = (globalThis as { Buffer?: { from(input: Uint8Array): { toString(encoding: string): string } } }).Buffer;
  if (maybeBuffer) {
    return maybeBuffer.from(bytes).toString("base64");
  }

  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return globalThis.btoa(binary);
}

function decodeArrayBufferBase64(encoded: string): ArrayBuffer {
  const maybeBuffer = (globalThis as { Buffer?: { from(input: string, encoding: string): { buffer: ArrayBuffer; byteOffset: number; byteLength: number } } }).Buffer;
  if (maybeBuffer) {
    const buffer = maybeBuffer.from(encoded, "base64");
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    );
  }

  const binary = globalThis.atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

function isSerializedTerrainAsset(value: unknown): value is SerializedTerrainAsset {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as {
    version?: unknown;
    terrain?: {
      config?: unknown;
      poiSites?: unknown;
      roads?: unknown;
      packedSnapshot?: {
        analysisResolution?: unknown;
        analysisStep?: unknown;
        shared?: unknown;
        bufferBase64?: unknown;
        fields?: unknown;
      };
    };
  };

  return (
    candidate.version === TERRAIN_ASSET_VERSION &&
    typeof candidate.terrain === "object" &&
    candidate.terrain !== null &&
    Array.isArray(candidate.terrain.poiSites) &&
    Array.isArray(candidate.terrain.roads) &&
    typeof candidate.terrain.packedSnapshot === "object" &&
    candidate.terrain.packedSnapshot !== null &&
    typeof candidate.terrain.packedSnapshot.analysisResolution === "number" &&
    typeof candidate.terrain.packedSnapshot.analysisStep === "number" &&
    typeof candidate.terrain.packedSnapshot.shared === "boolean" &&
    typeof candidate.terrain.packedSnapshot.bufferBase64 === "string" &&
    typeof candidate.terrain.packedSnapshot.fields === "object" &&
    candidate.terrain.packedSnapshot.fields !== null &&
    typeof candidate.terrain.config === "object" &&
    candidate.terrain.config !== null
  );
}
