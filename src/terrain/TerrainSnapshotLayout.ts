import { ProceduralGeneratorSnapshot } from "./ProceduralGenerator";

type SnapshotFieldName =
  | "terrainHeightField"
  | "flowField"
  | "riverField"
  | "lakeField"
  | "lakeSurfaceField"
  | "sedimentField"
  | "coalField"
  | "ironField"
  | "copperField";

const SNAPSHOT_FIELD_NAMES: readonly SnapshotFieldName[] = [
  "terrainHeightField",
  "flowField",
  "riverField",
  "lakeField",
  "lakeSurfaceField",
  "sedimentField",
  "coalField",
  "ironField",
  "copperField"
] as const;

export interface PackedTerrainSnapshotField {
  readonly byteOffset: number;
  readonly length: number;
}

export interface PackedTerrainSnapshot {
  readonly analysisResolution: number;
  readonly analysisStep: number;
  readonly buffer: ArrayBuffer | SharedArrayBuffer;
  readonly shared: boolean;
  readonly fields: Record<SnapshotFieldName, PackedTerrainSnapshotField>;
}

export function packTerrainSnapshot(
  snapshot: ProceduralGeneratorSnapshot,
  useSharedBuffer = false
): PackedTerrainSnapshot {
  const fields = {} as Record<SnapshotFieldName, PackedTerrainSnapshotField>;
  let totalBytes = 0;

  SNAPSHOT_FIELD_NAMES.forEach((name) => {
    const field = snapshot[name];
    const length = field?.length ?? 0;
    fields[name] = {
      byteOffset: totalBytes,
      length
    };
    totalBytes += length * Float32Array.BYTES_PER_ELEMENT;
  });

  const buffer = useSharedBuffer && typeof SharedArrayBuffer !== "undefined"
    ? new SharedArrayBuffer(totalBytes)
    : new ArrayBuffer(totalBytes);
  const packedBytes = new Uint8Array(buffer);

  SNAPSHOT_FIELD_NAMES.forEach((name) => {
    const field = snapshot[name];
    if (!field || field.length === 0) {
      return;
    }

    const { byteOffset } = fields[name];
    packedBytes.set(
      new Uint8Array(field.buffer, field.byteOffset, field.byteLength),
      byteOffset
    );
  });

  return {
    analysisResolution: snapshot.analysisResolution,
    analysisStep: snapshot.analysisStep,
    buffer,
    shared: buffer instanceof SharedArrayBuffer,
    fields
  };
}

export function unpackTerrainSnapshot(
  packed: PackedTerrainSnapshot
): ProceduralGeneratorSnapshot {
  return {
    analysisResolution: packed.analysisResolution,
    analysisStep: packed.analysisStep,
    terrainHeightField: unpackField(packed, "terrainHeightField"),
    flowField: unpackField(packed, "flowField"),
    riverField: unpackField(packed, "riverField"),
    lakeField: unpackField(packed, "lakeField"),
    lakeSurfaceField: unpackField(packed, "lakeSurfaceField"),
    sedimentField: unpackField(packed, "sedimentField"),
    coalField: unpackField(packed, "coalField"),
    ironField: unpackField(packed, "ironField"),
    copperField: unpackField(packed, "copperField")
  };
}

function unpackField(
  packed: PackedTerrainSnapshot,
  name: SnapshotFieldName
): Float32Array | null {
  const field = packed.fields[name];
  if (!field || field.length <= 0) {
    return null;
  }

  return new Float32Array(packed.buffer, field.byteOffset, field.length);
}
