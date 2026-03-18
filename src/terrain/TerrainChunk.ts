import { ShaderMaterial } from "@babylonjs/core/Materials/shaderMaterial";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import { TerrainChunkData } from "./TerrainChunkData";
import { TerrainConfig, TerrainLODLevel } from "./TerrainConfig";
import { TerrainMeshBuilder } from "./TerrainMeshBuilder";

export class TerrainChunk {
  readonly center: Vector3;
  readonly chunkX: number;
  readonly chunkZ: number;
  readonly centerHeight: number;
  private readonly meshes = new Map<TerrainLODLevel, Mesh>();
  private activeLod: TerrainLODLevel | null = null;
  private collisionsEnabled = false;

  constructor(
    private readonly scene: Scene,
    readonly data: TerrainChunkData,
    private readonly material: ShaderMaterial,
    private readonly config: TerrainConfig
  ) {
    this.center = new Vector3(data.centerX, 0, data.centerZ);
    this.centerHeight = data.centerHeight;
    this.chunkX = data.chunkX;
    this.chunkZ = data.chunkZ;
  }

  initializeMeshes(): void {
    this.config.lodResolutions.forEach((_, index) => {
      const lod = index as TerrainLODLevel;
      const mesh = TerrainMeshBuilder.buildChunkMesh(
        this.scene,
        this.data,
        lod,
        this.material,
        this.config
      );
      this.setMesh(lod, mesh);
    });

    this.setLOD(this.getLOD());
  }

  setMesh(lod: TerrainLODLevel, mesh: Mesh): void {
    this.meshes.get(lod)?.dispose(false, true);
    this.meshes.set(lod, mesh);
    const enabled = lod === this.getLOD();
    mesh.setEnabled(enabled);
    mesh.checkCollisions = enabled && this.collisionsEnabled;
  }

  getLOD(): TerrainLODLevel {
    return this.activeLod ?? 3;
  }

  getCollisionEnabled(): boolean {
    return this.collisionsEnabled;
  }

  distanceTo(cameraPosition: Vector3): number {
    const dx = cameraPosition.x - this.center.x;
    const dz = cameraPosition.z - this.center.z;
    return Math.sqrt(dx * dx + dz * dz);
  }

  isInFrustum(frustumPlanes: Parameters<Mesh["isInFrustum"]>[0]): boolean {
    const activeMesh =
      this.meshes.get(this.getLOD()) ??
      this.meshes.get(0) ??
      this.meshes.get(1) ??
      this.meshes.get(2) ??
      this.meshes.get(3);
    if (!activeMesh) {
      return true;
    }

    return activeMesh.isInFrustum(frustumPlanes);
  }

  setLOD(lod: TerrainLODLevel): void {
    if (lod === this.activeLod && this.meshes.size > 0) {
      return;
    }

    this.meshes.forEach((mesh, meshLod) => {
      const enabled = meshLod === lod;
      mesh.setEnabled(enabled);
      mesh.checkCollisions = enabled && this.collisionsEnabled;
    });

    this.activeLod = lod;
  }

  setCollision(enabled: boolean): void {
    this.collisionsEnabled = enabled;
    this.meshes.forEach((mesh, lod) => {
      mesh.checkCollisions = enabled && lod === this.activeLod;
    });
  }

  getMeshCount(): number {
    return this.meshes.size;
  }

  dispose(): void {
    this.meshes.forEach((mesh) => mesh.dispose(false, true));
    this.meshes.clear();
  }
}
