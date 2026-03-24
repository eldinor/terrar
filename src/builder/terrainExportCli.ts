import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildTerrain } from "./buildTerrain";
import type { BuiltTerrainConfigOverrides } from "./config";
import {
  exportTerrainAssetToFolder,
  exportTerrainAssetToZip,
  type WrittenTerrainExportFiles,
  type WrittenTerrainExportZip,
} from "./terrainExportWriter";

export interface TerrainExportCliOptions {
  readonly configPath: string;
  readonly outputPath: string;
  readonly format: "folder" | "zip";
  readonly preferSharedSnapshot: boolean;
}

export interface TerrainExportCliResult {
  readonly format: "folder" | "zip";
  readonly configPath: string;
  readonly outputPath: string;
  readonly result: WrittenTerrainExportFiles | WrittenTerrainExportZip;
}

export async function runTerrainExportCli(
  argv: readonly string[],
): Promise<TerrainExportCliResult> {
  const options = parseTerrainExportCliArgs(argv);
  const config = await loadTerrainExportConfig(options.configPath);
  const terrain = buildTerrain(config, options.preferSharedSnapshot);

  if (options.format === "zip") {
    const result = await exportTerrainAssetToZip(terrain, options.outputPath);
    return {
      format: options.format,
      configPath: options.configPath,
      outputPath: options.outputPath,
      result,
    };
  }

  const result = await exportTerrainAssetToFolder(terrain, options.outputPath);
  return {
    format: options.format,
    configPath: options.configPath,
    outputPath: options.outputPath,
    result,
  };
}

export function parseTerrainExportCliArgs(
  argv: readonly string[],
): TerrainExportCliOptions {
  let configPath = "";
  let outputPath = "";
  let format: "folder" | "zip" = "folder";
  let preferSharedSnapshot = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--config":
        configPath = requireArgValue(argv, index, "--config");
        index += 1;
        break;
      case "--out":
        outputPath = requireArgValue(argv, index, "--out");
        index += 1;
        break;
      case "--format": {
        const value = requireArgValue(argv, index, "--format");
        if (value !== "folder" && value !== "zip") {
          throw new Error(`Expected --format to be "folder" or "zip", received "${value}".`);
        }
        format = value;
        index += 1;
        break;
      }
      case "--shared":
        preferSharedSnapshot = true;
        break;
      case "--help":
      case "-h":
        throw new Error(getTerrainExportCliHelpText());
      default:
        throw new Error(`Unknown argument "${arg}".\n\n${getTerrainExportCliHelpText()}`);
    }
  }

  if (!configPath) {
    throw new Error(`Missing required --config argument.\n\n${getTerrainExportCliHelpText()}`);
  }

  if (!outputPath) {
    throw new Error(`Missing required --out argument.\n\n${getTerrainExportCliHelpText()}`);
  }

  return {
    configPath: resolve(process.cwd(), configPath),
    outputPath: resolve(process.cwd(), outputPath),
    format,
    preferSharedSnapshot,
  };
}

export async function loadTerrainExportConfig(
  configPath: string,
): Promise<BuiltTerrainConfigOverrides> {
  const raw = await readFile(configPath, "utf8");
  return JSON.parse(raw) as BuiltTerrainConfigOverrides;
}

export function getTerrainExportCliHelpText(): string {
  return [
    "Usage: terrar-export --config <file> --out <path> [--format folder|zip] [--shared]",
    "",
    "Options:",
    "  --config <file>   Path to a JSON file containing BuiltTerrainConfigOverrides.",
    "  --out <path>      Output directory for folder exports or output file for zip exports.",
    "  --format <type>   Export format: folder or zip. Defaults to folder.",
    "  --shared          Prefer shared snapshot buffers during generation.",
  ].join("\n");
}

function requireArgValue(
  argv: readonly string[],
  index: number,
  flag: string,
): string {
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`Missing value for ${flag}.`);
  }
  return value;
}
