import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { TerrainChunk } from "./TerrainChunk";
import { TerrainConfig, TerrainLODLevel } from "./TerrainConfig";
import { TerrainLODController } from "./TerrainLODController";

export class TerrainChunkVisibilityRuntime {
  private lodDistances: [number, number, number];
  private collisionRadius: number;
  private forceLod0 = false;

  constructor(
    private readonly scene: Scene,
    private readonly config: TerrainConfig,
    private readonly chunkGrid: readonly TerrainChunk[][],
    private readonly lodController: TerrainLODController
  ) {
    this.lodDistances = [...this.config.lodDistances];
    this.collisionRadius = this.config.collisionRadius;
  }

  update(cameraPosition: Vector3): void {
    const frustumPlanes = this.scene.frustumPlanes;
    const offscreenLodDistance = this.lodDistances[1] + this.config.chunkSize;
    const desiredLods: TerrainLODLevel[][] = [];
    const chunkDistances: number[][] = [];
    const chunkFrustumStates: boolean[][] = [];

    for (let chunkZ = 0; chunkZ < this.config.chunksPerAxis; chunkZ += 1) {
      const row: TerrainLODLevel[] = [];
      const distanceRow: number[] = [];
      const frustumRow: boolean[] = [];

      for (let chunkX = 0; chunkX < this.config.chunksPerAxis; chunkX += 1) {
        const chunk = this.chunkGrid[chunkZ][chunkX];
        const distance = chunk.distanceTo(cameraPosition);
        const lodDistance = this.getLodDistance(distance, cameraPosition);
        const isInFrustum =
          !frustumPlanes ||
          frustumPlanes.length === 0 ||
          chunk.isInFrustum(frustumPlanes);
        distanceRow.push(distance);
        frustumRow.push(isInFrustum);
        row.push(
          this.forceLod0
            ? 0
            : isInFrustum || lodDistance < offscreenLodDistance
              ? this.getDesiredLod(lodDistance)
              : 3
        );
      }

      desiredLods.push(row);
      chunkDistances.push(distanceRow);
      chunkFrustumStates.push(frustumRow);
    }

    const stabilized = this.lodController.stabilizeLodGrid(desiredLods);

    for (let chunkZ = 0; chunkZ < this.config.chunksPerAxis; chunkZ += 1) {
      for (let chunkX = 0; chunkX < this.config.chunksPerAxis; chunkX += 1) {
        const chunk = this.chunkGrid[chunkZ][chunkX];
        const distance = chunkDistances[chunkZ][chunkX];
        const isInFrustum = chunkFrustumStates[chunkZ][chunkX];
        chunk.setLOD(
          this.forceLod0 || isInFrustum || distance < offscreenLodDistance
            ? stabilized[chunkZ][chunkX]
            : 3
        );
        chunk.setCollision(distance < this.collisionRadius);
      }
    }
  }

  setCollisionRadius(radius: number): void {
    this.collisionRadius = radius;
  }

  getCollisionRadius(): number {
    return this.collisionRadius;
  }

  setLodDistances(distances: readonly [number, number, number]): void {
    this.lodDistances = [...distances];
  }

  getLodDistances(): readonly [number, number, number] {
    return this.lodDistances;
  }

  setForceLod0(enabled: boolean): void {
    this.forceLod0 = enabled;
  }

  getForceLod0(): boolean {
    return this.forceLod0;
  }

  private getDesiredLod(distance: number): TerrainLODLevel {
    const [lod0Distance, lod1Distance, lod2Distance] = this.lodDistances;

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

  private getLodDistance(distance: number, cameraPosition: Vector3): number {
    const altitude = Math.max(0, cameraPosition.y - this.config.waterLevel);
    const overviewBlend = smoothStep(
      this.config.chunkSize * 1.2,
      this.config.worldSize * 0.75,
      altitude
    );
    return distance * (1 - overviewBlend * 0.62);
  }
}

function smoothStep(min: number, max: number, value: number): number {
  if (max <= min) {
    return value >= max ? 1 : 0;
  }
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return t * t * (3 - 2 * t);
}
