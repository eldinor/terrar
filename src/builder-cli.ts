import { getTerrainExportCliHelpText, runTerrainExportCli } from "./builder/terrainExportCli";

void main();

async function main(): Promise<void> {
  try {
    const result = await runTerrainExportCli(process.argv.slice(2));
    process.stdout.write(
      `Exported terrain to ${result.outputPath} (${result.format}).\n`,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    if (!message.includes("Usage: terrar-export")) {
      process.stderr.write(`\n${getTerrainExportCliHelpText()}\n`);
    }
    process.exitCode = 1;
  }
}
