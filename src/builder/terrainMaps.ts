import type { TerrainAsset, TerrainAssetSnapshot } from "./types";

export type TerrainAssetMapField =
  | "terrainHeight"
  | "flow"
  | "river"
  | "lake"
  | "lakeSurface"
  | "sediment"
  | "coal"
  | "iron"
  | "copper";

export interface TerrainRasterMap {
  readonly field: TerrainAssetMapField;
  readonly width: number;
  readonly height: number;
  readonly minValue: number;
  readonly maxValue: number;
  readonly values: Float32Array;
}

export interface TerrainByteMap {
  readonly field: TerrainAssetMapField;
  readonly width: number;
  readonly height: number;
  readonly minValue: number;
  readonly maxValue: number;
  readonly pixels: Uint8Array;
}

export interface TerrainRgbaMap {
  readonly name: string;
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
}

export interface TerrainMapBundle {
  readonly heightmap: TerrainByteMap;
  readonly flowMap: TerrainByteMap;
  readonly riverMap: TerrainByteMap;
  readonly lakeMap: TerrainByteMap;
  readonly sedimentMap: TerrainByteMap;
  readonly resourceMaps: {
    readonly coal: TerrainByteMap;
    readonly iron: TerrainByteMap;
    readonly copper: TerrainByteMap;
  };
  readonly combinedMaps: {
    readonly water: TerrainRgbaMap;
    readonly resources: TerrainRgbaMap;
  };
}

export interface ExportedTerrainPoiCollection {
  readonly version: 1;
  readonly poiSites: TerrainAsset["poiSites"];
}

export interface ExportedTerrainRoadCollection {
  readonly version: 1;
  readonly roads: TerrainAsset["roads"];
}

export function extractTerrainRasterMap(
  terrain: TerrainAsset,
  field: TerrainAssetMapField,
): TerrainRasterMap {
  const values = readSnapshotField(terrain.packedSnapshot, field);
  const resolution = terrain.packedSnapshot.analysisResolution;
  const { minValue, maxValue } = findRange(values);

  return {
    field,
    width: resolution,
    height: resolution,
    minValue,
    maxValue,
    values,
  };
}

export function createTerrainHeightmap(
  terrain: TerrainAsset,
): TerrainByteMap {
  return createTerrainByteMap(terrain, "terrainHeight", {
    minValue: terrain.config.baseHeight,
    maxValue: terrain.config.maxHeight,
  });
}

export function createTerrainByteMap(
  terrain: TerrainAsset,
  field: TerrainAssetMapField,
  range: { readonly minValue?: number; readonly maxValue?: number } = {},
): TerrainByteMap {
  const raster = extractTerrainRasterMap(terrain, field);
  const minValue = range.minValue ?? raster.minValue;
  const maxValue = range.maxValue ?? raster.maxValue;
  const pixels = new Uint8Array(raster.values.length);
  const denominator = Math.max(maxValue - minValue, 0.000001);

  for (let index = 0; index < raster.values.length; index += 1) {
    const normalized = (raster.values[index] - minValue) / denominator;
    pixels[index] = Math.round(clamp01(normalized) * 255);
  }

  return {
    field,
    width: raster.width,
    height: raster.height,
    minValue,
    maxValue,
    pixels,
  };
}

export function createCombinedWaterMap(
  terrain: TerrainAsset,
): TerrainRgbaMap {
  const riverMap = createTerrainByteMap(terrain, "river", {
    minValue: 0,
    maxValue: 1,
  });
  const lakeMap = createTerrainByteMap(terrain, "lake", {
    minValue: 0,
    maxValue: 1,
  });
  const sedimentMap = createTerrainByteMap(terrain, "sediment", {
    minValue: 0,
    maxValue: 1,
  });

  return createCombinedRgbaMap("water", riverMap.width, riverMap.height, [
    riverMap.pixels,
    lakeMap.pixels,
    sedimentMap.pixels,
  ]);
}

export function createCombinedResourceMap(
  terrain: TerrainAsset,
): TerrainRgbaMap {
  const coalMap = createTerrainByteMap(terrain, "coal", {
    minValue: 0,
    maxValue: 1,
  });
  const ironMap = createTerrainByteMap(terrain, "iron", {
    minValue: 0,
    maxValue: 1,
  });
  const copperMap = createTerrainByteMap(terrain, "copper", {
    minValue: 0,
    maxValue: 1,
  });

  return createCombinedRgbaMap("resources", coalMap.width, coalMap.height, [
    coalMap.pixels,
    ironMap.pixels,
    copperMap.pixels,
  ]);
}

export function exportTerrainMaps(
  terrain: TerrainAsset,
): TerrainMapBundle {
  const heightmap = createTerrainHeightmap(terrain);
  const flowMap = createTerrainByteMap(terrain, "flow", {
    minValue: 0,
    maxValue: 1,
  });
  const riverMap = createTerrainByteMap(terrain, "river", {
    minValue: 0,
    maxValue: 1,
  });
  const lakeMap = createTerrainByteMap(terrain, "lake", {
    minValue: 0,
    maxValue: 1,
  });
  const sedimentMap = createTerrainByteMap(terrain, "sediment", {
    minValue: 0,
    maxValue: 1,
  });
  const coalMap = createTerrainByteMap(terrain, "coal", {
    minValue: 0,
    maxValue: 1,
  });
  const ironMap = createTerrainByteMap(terrain, "iron", {
    minValue: 0,
    maxValue: 1,
  });
  const copperMap = createTerrainByteMap(terrain, "copper", {
    minValue: 0,
    maxValue: 1,
  });

  return {
    heightmap,
    flowMap,
    riverMap,
    lakeMap,
    sedimentMap,
    resourceMaps: {
      coal: coalMap,
      iron: ironMap,
      copper: copperMap,
    },
    combinedMaps: {
      water: createCombinedRgbaMap("water", riverMap.width, riverMap.height, [
        riverMap.pixels,
        lakeMap.pixels,
        sedimentMap.pixels,
      ]),
      resources: createCombinedRgbaMap(
        "resources",
        coalMap.width,
        coalMap.height,
        [
        coalMap.pixels,
        ironMap.pixels,
        copperMap.pixels,
        ],
      ),
    },
  };
}

export function exportTerrainPoiData(
  terrain: TerrainAsset,
): ExportedTerrainPoiCollection {
  return {
    version: 1,
    poiSites: terrain.poiSites.map((poi) => ({
      ...poi,
      tags: [...poi.tags],
    })),
  };
}

export function exportTerrainRoadData(
  terrain: TerrainAsset,
): ExportedTerrainRoadCollection {
  return {
    version: 1,
    roads: terrain.roads.map((road) => ({
      ...road,
      points: road.points.map((point) => ({ ...point })),
    })),
  };
}

function readSnapshotField(
  snapshot: TerrainAssetSnapshot,
  field: TerrainAssetMapField,
): Float32Array {
  const packedField = snapshot.fields[toSnapshotFieldName(field)];
  return new Float32Array(
    snapshot.buffer.slice(
      packedField.byteOffset,
      packedField.byteOffset + packedField.length * Float32Array.BYTES_PER_ELEMENT,
    ),
  );
}

function toSnapshotFieldName(
  field: TerrainAssetMapField,
): keyof TerrainAssetSnapshot["fields"] {
  switch (field) {
    case "terrainHeight":
      return "terrainHeightField";
    case "flow":
      return "flowField";
    case "river":
      return "riverField";
    case "lake":
      return "lakeField";
    case "lakeSurface":
      return "lakeSurfaceField";
    case "sediment":
      return "sedimentField";
    case "coal":
      return "coalField";
    case "iron":
      return "ironField";
    case "copper":
      return "copperField";
  }
}

function findRange(values: Float32Array): {
  readonly minValue: number;
  readonly maxValue: number;
} {
  let minValue = Number.POSITIVE_INFINITY;
  let maxValue = Number.NEGATIVE_INFINITY;

  for (let index = 0; index < values.length; index += 1) {
    minValue = Math.min(minValue, values[index]);
    maxValue = Math.max(maxValue, values[index]);
  }

  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) {
    return {
      minValue: 0,
      maxValue: 0,
    };
  }

  return {
    minValue,
    maxValue,
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function createCombinedRgbaMap(
  name: string,
  width: number,
  height: number,
  channels: readonly [Uint8Array, Uint8Array, Uint8Array],
): TerrainRgbaMap {
  const [red, green, blue] = channels;
  const pixelCount = red.length;
  const pixels = new Uint8Array(pixelCount * 4);

  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    pixels[offset] = red[index];
    pixels[offset + 1] = green[index];
    pixels[offset + 2] = blue[index];
    pixels[offset + 3] = 255;
  }

  return {
    name,
    width,
    height,
    pixels,
  };
}
