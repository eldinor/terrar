import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { TerrainAsset } from "./types";
import { createTerrainExportZipBytes as createArchiveZipBytes } from "./terrainExportArchive";
import {
  createTerrainExportBundle,
  encodeTerrainExportFiles,
  type EncodedTerrainExportFiles,
  type TerrainExportBundle,
} from "./terrainExportBundle";

export interface TerrainExportFolderLayout {
  readonly rootDir: string;
  readonly mapsDir: string;
  readonly portableGraymapsDir: string;
  readonly manifestFile: string;
  readonly terrainAssetFile: string;
  readonly poiFile: string;
  readonly roadFile: string;
}

export interface WrittenTerrainExportFiles {
  readonly layout: TerrainExportFolderLayout;
  readonly mapFiles: readonly string[];
  readonly portableGraymapFiles: readonly string[];
}

export interface WrittenTerrainExportZip {
  readonly zipFile: string;
  readonly byteLength: number;
}

export async function writeTerrainExportBundleToFolder(
  bundle: TerrainExportBundle,
  outputDir: string,
): Promise<WrittenTerrainExportFiles> {
  const encoded = encodeTerrainExportFiles(bundle);
  return writeEncodedTerrainExportFilesToFolder(encoded, outputDir);
}

export async function exportTerrainAssetToFolder(
  terrain: TerrainAsset,
  outputDir: string,
): Promise<WrittenTerrainExportFiles> {
  const bundle = createTerrainExportBundle(terrain);
  return writeTerrainExportBundleToFolder(bundle, outputDir);
}

export async function writeTerrainExportBundleToZip(
  bundle: TerrainExportBundle,
  outputFile: string,
): Promise<WrittenTerrainExportZip> {
  const encoded = encodeTerrainExportFiles(bundle);
  return writeEncodedTerrainExportFilesToZip(encoded, outputFile);
}

export async function exportTerrainAssetToZip(
  terrain: TerrainAsset,
  outputFile: string,
): Promise<WrittenTerrainExportZip> {
  const bundle = createTerrainExportBundle(terrain);
  return writeTerrainExportBundleToZip(bundle, outputFile);
}

export async function writeEncodedTerrainExportFilesToFolder(
  encoded: EncodedTerrainExportFiles,
  outputDir: string,
): Promise<WrittenTerrainExportFiles> {
  const layout: TerrainExportFolderLayout = {
    rootDir: outputDir,
    mapsDir: join(outputDir, "maps"),
    portableGraymapsDir: join(outputDir, "maps-pgm"),
    manifestFile: join(outputDir, "manifest.json"),
    terrainAssetFile: join(outputDir, "terrain.asset.json"),
    poiFile: join(outputDir, "poi.json"),
    roadFile: join(outputDir, "roads.json"),
  };

  await mkdir(layout.mapsDir, { recursive: true });
  await mkdir(layout.portableGraymapsDir, { recursive: true });

  await Promise.all([
    writeFile(layout.manifestFile, encoded.manifestJson, "utf8"),
    writeFile(layout.terrainAssetFile, encoded.terrainAssetJson, "utf8"),
    writeFile(layout.poiFile, encoded.poiDataJson, "utf8"),
    writeFile(layout.roadFile, encoded.roadDataJson, "utf8"),
    ...writeBinaryFileMap(layout.mapsDir, encoded.mapFiles),
    ...writeBinaryFileMap(layout.portableGraymapsDir, encoded.portableGraymapFiles),
  ]);

  return {
    layout,
    mapFiles: Object.keys(encoded.mapFiles).map((fileName) => join(layout.mapsDir, fileName)),
    portableGraymapFiles: Object.keys(encoded.portableGraymapFiles).map((fileName) =>
      join(layout.portableGraymapsDir, fileName),
    ),
  };
}

export async function writeEncodedTerrainExportFilesToZip(
  encoded: EncodedTerrainExportFiles,
  outputFile: string,
): Promise<WrittenTerrainExportZip> {
  const zipBytes = createTerrainExportZipBytes(encoded);
  await writeFile(outputFile, zipBytes);
  return {
    zipFile: outputFile,
    byteLength: zipBytes.length,
  };
}

export function createTerrainExportZipBytes(
  encoded: EncodedTerrainExportFiles,
): Uint8Array {
  return createArchiveZipBytes(encoded, {
    includePortableGraymaps: true,
  });
}

function writeBinaryFileMap(
  directory: string,
  files: Record<string, Uint8Array>,
): Promise<void>[] {
  return Object.entries(files).map(([fileName, bytes]) =>
    writeFile(join(directory, fileName), bytes),
  );
}
