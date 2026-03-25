import type { EncodedTerrainExportFiles } from "./terrainExportBundle";

export interface TerrainExportZipOptions {
  readonly includePortableGraymaps?: boolean;
}

export function createTerrainExportZipBytes(
  encoded: EncodedTerrainExportFiles,
  options: TerrainExportZipOptions = {}
): Uint8Array {
  const includePortableGraymaps = options.includePortableGraymaps ?? true;
  const entries = [
    createZipEntry("manifest.json", encodeTextFile(encoded.manifestJson)),
    createZipEntry("terrain.asset.json", encodeTextFile(encoded.terrainAssetJson)),
    createZipEntry("poi.json", encodeTextFile(encoded.poiDataJson)),
    createZipEntry("roads.json", encodeTextFile(encoded.roadDataJson)),
    ...Object.entries(encoded.mapFiles).map(([fileName, bytes]) =>
      createZipEntry(`maps/${fileName}`, bytes),
    ),
    ...(includePortableGraymaps
      ? Object.entries(encoded.portableGraymapFiles).map(([fileName, bytes]) =>
          createZipEntry(`maps-pgm/${fileName}`, bytes),
        )
      : []),
  ];

  return encodeZip(entries);
}

interface ZipEntry {
  readonly fileName: string;
  readonly fileNameBytes: Uint8Array;
  readonly data: Uint8Array;
  readonly crc32: number;
}

function createZipEntry(fileName: string, data: Uint8Array): ZipEntry {
  return {
    fileName,
    fileNameBytes: encodeTextFile(fileName),
    data,
    crc32: computeCrc32(data),
  };
}

function encodeZip(entries: readonly ZipEntry[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  entries.forEach((entry) => {
    const localHeader = createLocalFileHeader(entry);
    localParts.push(localHeader, entry.data);
    centralParts.push(createCentralDirectoryHeader(entry, offset));
    offset += localHeader.length + entry.data.length;
  });

  const centralDirectory = concatUint8Arrays(centralParts);
  const localData = concatUint8Arrays(localParts);
  const endOfCentralDirectory = createEndOfCentralDirectory(
    entries.length,
    centralDirectory.length,
    localData.length,
  );

  return concatUint8Arrays([localData, centralDirectory, endOfCentralDirectory]);
}

function createLocalFileHeader(entry: ZipEntry): Uint8Array {
  const header = new Uint8Array(30 + entry.fileNameBytes.length);
  writeUint32LittleEndian(header, 0, 0x04034b50);
  writeUint16LittleEndian(header, 4, 20);
  writeUint16LittleEndian(header, 6, 0);
  writeUint16LittleEndian(header, 8, 0);
  writeUint16LittleEndian(header, 10, 0);
  writeUint16LittleEndian(header, 12, 0);
  writeUint32LittleEndian(header, 14, entry.crc32);
  writeUint32LittleEndian(header, 18, entry.data.length);
  writeUint32LittleEndian(header, 22, entry.data.length);
  writeUint16LittleEndian(header, 26, entry.fileNameBytes.length);
  writeUint16LittleEndian(header, 28, 0);
  header.set(entry.fileNameBytes, 30);
  return header;
}

function createCentralDirectoryHeader(
  entry: ZipEntry,
  offset: number,
): Uint8Array {
  const header = new Uint8Array(46 + entry.fileNameBytes.length);
  writeUint32LittleEndian(header, 0, 0x02014b50);
  writeUint16LittleEndian(header, 4, 20);
  writeUint16LittleEndian(header, 6, 20);
  writeUint16LittleEndian(header, 8, 0);
  writeUint16LittleEndian(header, 10, 0);
  writeUint16LittleEndian(header, 12, 0);
  writeUint16LittleEndian(header, 14, 0);
  writeUint32LittleEndian(header, 16, entry.crc32);
  writeUint32LittleEndian(header, 20, entry.data.length);
  writeUint32LittleEndian(header, 24, entry.data.length);
  writeUint16LittleEndian(header, 28, entry.fileNameBytes.length);
  writeUint16LittleEndian(header, 30, 0);
  writeUint16LittleEndian(header, 32, 0);
  writeUint16LittleEndian(header, 34, 0);
  writeUint16LittleEndian(header, 36, 0);
  writeUint32LittleEndian(header, 38, 0);
  writeUint32LittleEndian(header, 42, offset);
  header.set(entry.fileNameBytes, 46);
  return header;
}

function createEndOfCentralDirectory(
  entryCount: number,
  centralDirectoryLength: number,
  centralDirectoryOffset: number,
): Uint8Array {
  const end = new Uint8Array(22);
  writeUint32LittleEndian(end, 0, 0x06054b50);
  writeUint16LittleEndian(end, 4, 0);
  writeUint16LittleEndian(end, 6, 0);
  writeUint16LittleEndian(end, 8, entryCount);
  writeUint16LittleEndian(end, 10, entryCount);
  writeUint32LittleEndian(end, 12, centralDirectoryLength);
  writeUint32LittleEndian(end, 16, centralDirectoryOffset);
  writeUint16LittleEndian(end, 20, 0);
  return end;
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

function encodeTextFile(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function writeUint16LittleEndian(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
}

function writeUint32LittleEndian(target: Uint8Array, offset: number, value: number): void {
  target[offset] = value & 0xff;
  target[offset + 1] = (value >>> 8) & 0xff;
  target[offset + 2] = (value >>> 16) & 0xff;
  target[offset + 3] = (value >>> 24) & 0xff;
}

function computeCrc32(data: Uint8Array): number {
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
