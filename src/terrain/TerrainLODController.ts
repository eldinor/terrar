import { TerrainConfig, TerrainLODLevel } from "./TerrainConfig";

export class TerrainLODController {
  constructor(private readonly config: TerrainConfig) {}

  getDesiredLod(distance: number): TerrainLODLevel {
    const [lod0Distance, lod1Distance, lod2Distance] = this.config.lodDistances;

    if (distance < lod0Distance) {
      return 0;
    }

    if (distance < lod1Distance) {
      return 1;
    }

    if (distance < lod2Distance) {
      return 2;
    }

    return 3;
  }

  stabilizeLodGrid(desiredLods: TerrainLODLevel[][]): TerrainLODLevel[][] {
    const stabilized = desiredLods.map((row) => row.slice()) as TerrainLODLevel[][];
    let changed = true;

    while (changed) {
      changed = false;

      for (let z = 0; z < this.config.chunksPerAxis; z += 1) {
        for (let x = 0; x < this.config.chunksPerAxis; x += 1) {
          const current = stabilized[z][x];
          const neighbors = this.getNeighborValues(stabilized, x, z);
          const maxAllowed = Math.min(...neighbors.map((neighbor) => neighbor + 1), 3);

          if (current > maxAllowed) {
            stabilized[z][x] = maxAllowed as TerrainLODLevel;
            changed = true;
          }
        }
      }
    }

    return stabilized;
  }

  private getNeighborValues(
    lods: TerrainLODLevel[][],
    x: number,
    z: number
  ): TerrainLODLevel[] {
    const values: TerrainLODLevel[] = [];
    const directions = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0]
    ] as const;

    directions.forEach(([dx, dz]) => {
      const nextX = x + dx;
      const nextZ = z + dz;

      if (
        nextX >= 0 &&
        nextX < this.config.chunksPerAxis &&
        nextZ >= 0 &&
        nextZ < this.config.chunksPerAxis
      ) {
        values.push(lods[nextZ][nextX]);
      }
    });

    return values.length > 0 ? values : [lods[z][x]];
  }
}
