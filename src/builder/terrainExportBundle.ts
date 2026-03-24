import type { TerrainAsset } from "./types";
import {
  createSerializedTerrainAsset,
  serializeTerrainAsset,
  type SerializedTerrainAsset,
} from "./terrainAsset";
import {
  exportTerrainMaps,
  exportTerrainPoiData,
  exportTerrainRoadData,
  type ExportedTerrainPoiCollection,
  type ExportedTerrainRoadCollection,
  type TerrainMapBundle,
  type TerrainByteMap,
  type TerrainRgbaMap,
} from "./terrainMaps";

export const TERRAIN_EXPORT_BUNDLE_VERSION = 1 as const;

export interface TerrainExportManifest {
  readonly version: typeof TERRAIN_EXPORT_BUNDLE_VERSION;
  readonly terrainAssetVersion: number;
  readonly mapNames: readonly string[];
  readonly includes: {
    readonly terrainAsset: true;
    readonly maps: true;
    readonly poiData: true;
    readonly roadData: true;
  };
}

export interface TerrainExportBundle {
  readonly manifest: TerrainExportManifest;
  readonly terrainAsset: SerializedTerrainAsset;
  readonly terrainAssetJson: string;
  readonly maps: TerrainMapBundle;
  readonly poiData: ExportedTerrainPoiCollection;
  readonly poiDataJson: string;
  readonly roadData: ExportedTerrainRoadCollection;
  readonly roadDataJson: string;
}

export interface EncodedTerrainExportFiles {
  readonly manifestJson: string;
  readonly terrainAssetJson: string;
  readonly poiDataJson: string;
  readonly roadDataJson: string;
  readonly mapFiles: Record<string, Uint8Array>;
  readonly portableGraymapFiles: Record<string, Uint8Array>;
}

export function createTerrainExportBundle(
  terrain: TerrainAsset,
): TerrainExportBundle {
  const terrainAsset = createSerializedTerrainAsset(terrain);
  const terrainAssetJson = serializeTerrainAsset(terrain);
  const maps = exportTerrainMaps(terrain);
  const poiData = exportTerrainPoiData(terrain);
  const poiDataJson = JSON.stringify(poiData);
  const roadData = exportTerrainRoadData(terrain);
  const roadDataJson = JSON.stringify(roadData);

  return {
    manifest: {
      version: TERRAIN_EXPORT_BUNDLE_VERSION,
      terrainAssetVersion: terrainAsset.version,
      mapNames: [
        "heightmap",
        "flowMap",
        "riverMap",
        "lakeMap",
        "sedimentMap",
        "resourceMaps.coal",
        "resourceMaps.iron",
        "resourceMaps.copper",
        "combinedMaps.water",
        "combinedMaps.resources",
      ],
      includes: {
        terrainAsset: true,
        maps: true,
        poiData: true,
        roadData: true,
      },
    },
    terrainAsset,
    terrainAssetJson,
    maps,
    poiData,
    poiDataJson,
    roadData,
    roadDataJson,
  };
}

export function encodeTerrainExportFiles(
  bundle: TerrainExportBundle,
): EncodedTerrainExportFiles {
  return {
    manifestJson: JSON.stringify(bundle.manifest),
    terrainAssetJson: bundle.terrainAssetJson,
    poiDataJson: bundle.poiDataJson,
    roadDataJson: bundle.roadDataJson,
    mapFiles: {
      "heightmap.png": encodeGrayscalePng(bundle.maps.heightmap),
      "flow.png": encodeGrayscalePng(bundle.maps.flowMap),
      "river.png": encodeGrayscalePng(bundle.maps.riverMap),
      "lake.png": encodeGrayscalePng(bundle.maps.lakeMap),
      "sediment.png": encodeGrayscalePng(bundle.maps.sedimentMap),
      "resource-coal.png": encodeGrayscalePng(bundle.maps.resourceMaps.coal),
      "resource-iron.png": encodeGrayscalePng(bundle.maps.resourceMaps.iron),
      "resource-copper.png": encodeGrayscalePng(bundle.maps.resourceMaps.copper),
      "water-combined.png": encodeRgbaPng(bundle.maps.combinedMaps.water),
      "resources-combined.png": encodeRgbaPng(bundle.maps.combinedMaps.resources),
    },
    portableGraymapFiles: {
      "heightmap.pgm": encodePortableGraymap(bundle.maps.heightmap),
      "flow.pgm": encodePortableGraymap(bundle.maps.flowMap),
      "river.pgm": encodePortableGraymap(bundle.maps.riverMap),
      "lake.pgm": encodePortableGraymap(bundle.maps.lakeMap),
      "sediment.pgm": encodePortableGraymap(bundle.maps.sedimentMap),
      "resource-coal.pgm": encodePortableGraymap(bundle.maps.resourceMaps.coal),
      "resource-iron.pgm": encodePortableGraymap(bundle.maps.resourceMaps.iron),
      "resource-copper.pgm": encodePortableGraymap(bundle.maps.resourceMaps.copper),
    },
  };
}

export function encodePortableGraymap(map: TerrainByteMap): Uint8Array {
  const header = `P5\n${map.width} ${map.height}\n255\n`;
  const headerBytes = new TextEncoder().encode(header);
  const bytes = new Uint8Array(headerBytes.length + map.pixels.length);
  bytes.set(headerBytes, 0);
  bytes.set(map.pixels, headerBytes.length);
  return bytes;
}

export function encodeGrayscalePng(map: TerrainByteMap): Uint8Array {
  return encodePng(
    map.width,
    map.height,
    0,
    createPngScanlines(map.height, map.width, 1, map.pixels),
  );
}

export function encodeRgbaPng(map: TerrainRgbaMap): Uint8Array {
  return encodePng(
    map.width,
    map.height,
    6,
    createPngScanlines(map.height, map.width, 4, map.pixels),
  );
}

function encodePng(
  width: number,
  height: number,
  colorType: 0 | 6,
  rawImageData: Uint8Array,
): Uint8Array {
  const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdrData = new Uint8Array(13);
  writeUint32(ihdrData, 0, width);
  writeUint32(ihdrData, 4, height);
  ihdrData[8] = 8;
  ihdrData[9] = colorType;
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const idatData = encodeZlibStore(rawImageData);
  const ihdrChunk = createPngChunk("IHDR", ihdrData);
  const idatChunk = createPngChunk("IDAT", idatData);
  const iendChunk = createPngChunk("IEND", new Uint8Array(0));

  return concatUint8Arrays([signature, ihdrChunk, idatChunk, iendChunk]);
}

function createPngScanlines(
  height: number,
  width: number,
  bytesPerPixel: number,
  pixels: Uint8Array,
): Uint8Array {
  const rowBytes = width * bytesPerPixel;
  const scanlineLength = rowBytes + 1;
  const rawImageData = new Uint8Array(scanlineLength * height);

  for (let row = 0; row < height; row += 1) {
    const rowStart = row * scanlineLength;
    rawImageData[rowStart] = 0;
    rawImageData.set(
      pixels.subarray(row * rowBytes, (row + 1) * rowBytes),
      rowStart + 1,
    );
  }

  return rawImageData;
}

function encodeZlibStore(data: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [Uint8Array.from([0x78, 0x01])];
  let offset = 0;

  while (offset < data.length) {
    const remaining = data.length - offset;
    const blockLength = Math.min(65535, remaining);
    const isFinalBlock = offset + blockLength >= data.length;
    const block = new Uint8Array(5 + blockLength);
    block[0] = isFinalBlock ? 0x01 : 0x00;
    block[1] = blockLength & 0xff;
    block[2] = (blockLength >>> 8) & 0xff;
    const nlen = (~blockLength) & 0xffff;
    block[3] = nlen & 0xff;
    block[4] = (nlen >>> 8) & 0xff;
    block.set(data.subarray(offset, offset + blockLength), 5);
    chunks.push(block);
    offset += blockLength;
  }

  const adler = adler32(data);
  const trailer = new Uint8Array(4);
  writeUint32(trailer, 0, adler);
  chunks.push(trailer);
  return concatUint8Arrays(chunks);
}

function createPngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const lengthBytes = new Uint8Array(4);
  writeUint32(lengthBytes, 0, data.length);
  const crcInput = concatUint8Arrays([typeBytes, data]);
  const crcBytes = new Uint8Array(4);
  writeUint32(crcBytes, 0, crc32(crcInput));
  return concatUint8Arrays([lengthBytes, typeBytes, data, crcBytes]);
}

function concatUint8Arrays(parts: readonly Uint8Array[]): Uint8Array {
  const totalLength = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  parts.forEach((part) => {
    result.set(part, offset);
    offset += part.length;
  });

  return result;
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  const mod = 65521;

  for (let index = 0; index < data.length; index += 1) {
    a = (a + data[index]) % mod;
    b = (b + a) % mod;
  }

  return ((b << 16) | a) >>> 0;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;

  for (let index = 0; index < data.length; index += 1) {
    crc ^= data[index];
    for (let bit = 0; bit < 8; bit += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}
