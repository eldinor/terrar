import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import { TerrainChunk } from "./TerrainChunk";
import { TerrainConfig } from "./TerrainConfig";
import {
  TerrainFoliageCandidate,
  TerrainFoliageKind,
  TerrainFoliagePlanner
} from "./TerrainFoliagePlanner";

type FoliageLODLevel = 0 | 1 | 2;

interface TerrainFoliageChunk {
  readonly lodMeshes: Record<FoliageLODLevel, Mesh[]>;
  readonly center: Vector3;
  readonly instanceCount: number;
  readonly kindCounts: Record<TerrainFoliageKind, number>;
}

export class TerrainFoliageSystem {
  private readonly chunkFoliage = new Map<string, TerrainFoliageChunk>();
  private readonly prototypeMaterials: StandardMaterial[] = [];
  private totalInstanceCount = 0;
  private visibleChunkCount = 0;
  private visibleInstanceCount = 0;
  private totalKindCounts: Record<TerrainFoliageKind, number> = createKindCounts();
  private visibleKindCounts: Record<TerrainFoliageKind, number> = createKindCounts();

  constructor(
    private readonly scene: Scene,
    private readonly planner: TerrainFoliagePlanner,
    private readonly config: TerrainConfig
  ) {}

  initialize(chunks: readonly TerrainChunk[]): void {
    if (this.prototypeMaterials.length > 0) {
      return;
    }
    this.createPrototypeMaterials();

    for (const chunk of chunks) {
      const candidates = this.planner.generateCandidates(chunk.data);
      const kindCounts = createKindCounts();
      const lodMeshes = createLodMeshes();

      for (const candidate of candidates) {
        kindCounts[candidate.kind] += 1;
        this.createMeshesForLods(candidate, lodMeshes);
      }

      this.chunkFoliage.set(this.getChunkKey(chunk.chunkX, chunk.chunkZ), {
        lodMeshes,
        center: chunk.center.clone(),
        instanceCount: candidates.length,
        kindCounts
      });
      this.totalInstanceCount += candidates.length;
      this.totalKindCounts[TerrainFoliageKind.Tree] += kindCounts[TerrainFoliageKind.Tree];
      this.totalKindCounts[TerrainFoliageKind.Bush] += kindCounts[TerrainFoliageKind.Bush];
      this.totalKindCounts[TerrainFoliageKind.Rock] += kindCounts[TerrainFoliageKind.Rock];
    }
  }

  update(cameraPosition: Vector3, visibleRadius: number): void {
    this.visibleChunkCount = 0;
    this.visibleInstanceCount = 0;
    this.visibleKindCounts = createKindCounts();

    for (const foliageChunk of this.chunkFoliage.values()) {
      const dx = cameraPosition.x - foliageChunk.center.x;
      const dz = cameraPosition.z - foliageChunk.center.z;
      const distance = Math.sqrt(dx * dx + dz * dz);
      const enabled = distance < visibleRadius;
      const lod = this.getDesiredLod(distance);
      ([0, 1, 2] as FoliageLODLevel[]).forEach((meshLod) => {
        const lodEnabled = enabled && lod === meshLod;
        foliageChunk.lodMeshes[meshLod].forEach((mesh) => mesh.setEnabled(lodEnabled));
      });

      if (enabled) {
        this.visibleChunkCount += 1;
        this.visibleInstanceCount += foliageChunk.instanceCount;
        this.visibleKindCounts[TerrainFoliageKind.Tree] +=
          foliageChunk.kindCounts[TerrainFoliageKind.Tree];
        this.visibleKindCounts[TerrainFoliageKind.Bush] +=
          foliageChunk.kindCounts[TerrainFoliageKind.Bush];
        this.visibleKindCounts[TerrainFoliageKind.Rock] +=
          foliageChunk.kindCounts[TerrainFoliageKind.Rock];
      }
    }
  }

  dispose(): void {
    this.chunkFoliage.forEach(({ lodMeshes }) => {
      lodMeshes[0].forEach((mesh) => mesh.dispose(false, true));
      lodMeshes[1].forEach((mesh) => mesh.dispose(false, true));
      lodMeshes[2].forEach((mesh) => mesh.dispose(false, true));
    });
    this.chunkFoliage.clear();
    this.totalInstanceCount = 0;
    this.visibleChunkCount = 0;
    this.visibleInstanceCount = 0;
    this.totalKindCounts = createKindCounts();
    this.visibleKindCounts = createKindCounts();

    this.prototypeMaterials.forEach((material) => material.dispose(false, true));
    this.prototypeMaterials.length = 0;
  }

  private createMeshesForLods(
    candidate: TerrainFoliageCandidate,
    lodMeshes: Record<FoliageLODLevel, Mesh[]>
  ): void {
    ([0, 1, 2] as FoliageLODLevel[]).forEach((lod) => {
      const mesh = createFoliageMesh(
        this.scene,
        candidate.kind,
        lod,
        `${getFoliageMeshName(candidate.kind, lod)}-${Math.round(candidate.x)}-${Math.round(candidate.z)}`
      );
      mesh.material = this.prototypeMaterials[candidate.kind];
      mesh.position.set(
        candidate.x,
        candidate.y + getFoliageHeightOffset(candidate.kind, lod) * candidate.scale,
        candidate.z
      );
      mesh.rotation.y = candidate.yaw;
      mesh.scaling.setAll(candidate.scale * getLodScaleMultiplier(lod));
      mesh.alwaysSelectAsActiveMesh = true;
      mesh.isPickable = false;
      mesh.receiveShadows = false;
      mesh.setEnabled(false);
      lodMeshes[lod].push(mesh);
    });
  }

  private createPrototypeMaterials(): void {
    const treeMaterial = new StandardMaterial("foliage-tree-material", this.scene);
    treeMaterial.diffuseColor = new Color3(0.18, 0.4, 0.18);
    treeMaterial.emissiveColor = new Color3(0.16, 0.28, 0.1);
    treeMaterial.specularColor = Color3.Black();

    const bushMaterial = new StandardMaterial("foliage-bush-material", this.scene);
    bushMaterial.diffuseColor = new Color3(0.56, 0.68, 0.18);
    bushMaterial.emissiveColor = new Color3(0.28, 0.32, 0.08);
    bushMaterial.specularColor = Color3.Black();

    const rockMaterial = new StandardMaterial("foliage-rock-material", this.scene);
    rockMaterial.diffuseColor = new Color3(0.82, 0.56, 0.26);
    rockMaterial.emissiveColor = new Color3(0.34, 0.16, 0.04);
    rockMaterial.specularColor = Color3.Black();

    this.prototypeMaterials.push(treeMaterial, bushMaterial, rockMaterial);
  }

  private getChunkKey(chunkX: number, chunkZ: number): string {
    return `${chunkX}:${chunkZ}`;
  }

  getStats(): TerrainFoliageStats {
    return {
      totalChunks: this.chunkFoliage.size,
      totalInstances: this.totalInstanceCount,
      visibleChunks: this.visibleChunkCount,
      visibleInstances: this.visibleInstanceCount,
      totalTrees: this.totalKindCounts[TerrainFoliageKind.Tree],
      totalBushes: this.totalKindCounts[TerrainFoliageKind.Bush],
      totalRocks: this.totalKindCounts[TerrainFoliageKind.Rock],
      visibleTrees: this.visibleKindCounts[TerrainFoliageKind.Tree],
      visibleBushes: this.visibleKindCounts[TerrainFoliageKind.Bush],
      visibleRocks: this.visibleKindCounts[TerrainFoliageKind.Rock]
    };
  }

  private getDesiredLod(distance: number): FoliageLODLevel {
    const [lod0Distance, lod1Distance] = this.config.foliageLodDistances;

    if (distance < lod0Distance) {
      return 0;
    }

    if (distance < lod1Distance) {
      return 1;
    }

    return 2;
  }
}

function getFoliageHeightOffset(
  kind: TerrainFoliageKind,
  lod: FoliageLODLevel
): number {
  switch (kind) {
    case TerrainFoliageKind.Tree:
      return lod === 2 ? 1.8 : lod === 1 ? 2.4 : 3;
    case TerrainFoliageKind.Bush:
      return lod === 2 ? 0.45 : lod === 1 ? 0.6 : 1;
    case TerrainFoliageKind.Rock:
      return lod === 2 ? 0.15 : lod === 1 ? 0.2 : 0.3;
  }
}

export interface TerrainFoliageStats {
  readonly totalChunks: number;
  readonly totalInstances: number;
  readonly visibleChunks: number;
  readonly visibleInstances: number;
  readonly totalTrees: number;
  readonly totalBushes: number;
  readonly totalRocks: number;
  readonly visibleTrees: number;
  readonly visibleBushes: number;
  readonly visibleRocks: number;
}

function createKindCounts(): Record<TerrainFoliageKind, number> {
  return {
    [TerrainFoliageKind.Tree]: 0,
    [TerrainFoliageKind.Bush]: 0,
    [TerrainFoliageKind.Rock]: 0
  };
}

function createLodMeshes(): Record<FoliageLODLevel, Mesh[]> {
  return {
    0: [],
    1: [],
    2: []
  };
}

function getLodScaleMultiplier(lod: FoliageLODLevel): number {
  switch (lod) {
    case 0:
      return 1;
    case 1:
      return 0.88;
    case 2:
      return 0.76;
  }
}

function createFoliageMesh(
  scene: Scene,
  kind: TerrainFoliageKind,
  lod: FoliageLODLevel,
  name: string
): Mesh {
  switch (kind) {
    case TerrainFoliageKind.Tree:
      return MeshBuilder.CreateCylinder(
        name,
        {
          height: lod === 0 ? 6 : lod === 1 ? 4.8 : 3.6,
          diameterTop: lod === 0 ? 0.2 : lod === 1 ? 0.16 : 0.14,
          diameterBottom: lod === 0 ? 1.8 : lod === 1 ? 1.4 : 1.1,
          tessellation: lod === 0 ? 6 : lod === 1 ? 5 : 4
        },
        scene
      );
    case TerrainFoliageKind.Bush:
      if (lod === 2) {
        return MeshBuilder.CreateBox(name, { size: 1.1 }, scene);
      }
      return MeshBuilder.CreateSphere(
        name,
        { diameter: lod === 0 ? 2 : 1.6, segments: lod === 0 ? 4 : 3 },
        scene
      );
    case TerrainFoliageKind.Rock:
      if (lod === 2) {
        return MeshBuilder.CreateBox(name, { size: 0.6 }, scene);
      }
      return MeshBuilder.CreatePolyhedron(
        name,
        { type: lod === 0 ? 1 : 2, size: lod === 0 ? 1 : 0.8 },
        scene
      );
  }
}

function getFoliageMeshName(
  kind: TerrainFoliageKind,
  lod: FoliageLODLevel
): string {
  switch (kind) {
    case TerrainFoliageKind.Tree:
      return `foliage-tree-lod${lod}`;
    case TerrainFoliageKind.Bush:
      return `foliage-bush-lod${lod}`;
    case TerrainFoliageKind.Rock:
      return `foliage-rock-lod${lod}`;
  }
}
