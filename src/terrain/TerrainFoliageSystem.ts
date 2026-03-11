import { Material } from "@babylonjs/core/Materials/material";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
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
  readonly lodRoots: Record<FoliageLODLevel, TransformNode>;
  readonly center: Vector3;
  readonly instanceCount: number;
  readonly kindCounts: Record<TerrainFoliageKind, number>;
}

export class TerrainFoliageSystem {
  private readonly chunkFoliage = new Map<string, TerrainFoliageChunk>();
  private readonly prototypeMaterials: Material[] = [];
  private prototypes: Record<TerrainFoliageKind, Record<FoliageLODLevel, Mesh>> | null = null;
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
    if (this.prototypes) {
      return;
    }

    this.prototypes = this.createPrototypes();

    for (const chunk of chunks) {
      const candidates = this.planner.generateCandidates(chunk.data);
      const kindCounts = createKindCounts();
      const lodRoots = createLodRoots(
        this.scene,
        `terrain-foliage-${chunk.chunkX}-${chunk.chunkZ}`
      );

      for (const candidate of candidates) {
        kindCounts[candidate.kind] += 1;
        this.createInstancesForLods(candidate, lodRoots);
      }

      this.chunkFoliage.set(this.getChunkKey(chunk.chunkX, chunk.chunkZ), {
        lodRoots,
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
      foliageChunk.lodRoots[0].setEnabled(enabled && lod === 0);
      foliageChunk.lodRoots[1].setEnabled(enabled && lod === 1);
      foliageChunk.lodRoots[2].setEnabled(enabled && lod === 2);

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
    this.chunkFoliage.forEach(({ lodRoots }) => {
      lodRoots[0].dispose(false, true);
      lodRoots[1].dispose(false, true);
      lodRoots[2].dispose(false, true);
    });
    this.chunkFoliage.clear();
    this.totalInstanceCount = 0;
    this.visibleChunkCount = 0;
    this.visibleInstanceCount = 0;
    this.totalKindCounts = createKindCounts();
    this.visibleKindCounts = createKindCounts();

    if (this.prototypes) {
      Object.values(this.prototypes).forEach((lodMeshes) => {
        lodMeshes[0].dispose(false, true);
        lodMeshes[1].dispose(false, true);
        lodMeshes[2].dispose(false, true);
      });
      this.prototypes = null;
    }

    this.prototypeMaterials.forEach((material) => material.dispose(false, true));
    this.prototypeMaterials.length = 0;
  }

  private createInstancesForLods(
    candidate: TerrainFoliageCandidate,
    lodRoots: Record<FoliageLODLevel, TransformNode>
  ): void {
    const prototypeSet = this.prototypes?.[candidate.kind];
    if (!prototypeSet) {
      return;
    }

    ([0, 1, 2] as FoliageLODLevel[]).forEach((lod) => {
      const prototype = prototypeSet[lod];
      const instance = prototype.createInstance(
        `${prototype.name}-instance-${Math.round(candidate.x)}-${Math.round(candidate.z)}-lod${lod}`
      );
      instance.parent = lodRoots[lod];
      instance.position.set(
        candidate.x,
        candidate.y + getFoliageHeightOffset(candidate.kind, lod) * candidate.scale,
        candidate.z
      );
      instance.rotation.y = candidate.yaw;
      instance.scaling.setAll(candidate.scale * getLodScaleMultiplier(lod));
      instance.alwaysSelectAsActiveMesh = false;
      instance.isPickable = false;
    });
  }

  private createPrototypes(): Record<TerrainFoliageKind, Record<FoliageLODLevel, Mesh>> {
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

    const tree = {
      0: createPrototypeMesh(
        MeshBuilder.CreateCylinder(
          "foliage-tree-prototype-lod0",
          { height: 6, diameterTop: 0.2, diameterBottom: 1.8, tessellation: 6 },
          this.scene
        ),
        treeMaterial
      ),
      1: createPrototypeMesh(
        MeshBuilder.CreateCylinder(
          "foliage-tree-prototype-lod1",
          { height: 4.8, diameterTop: 0.16, diameterBottom: 1.4, tessellation: 5 },
          this.scene
        ),
        treeMaterial
      ),
      2: createPrototypeMesh(
        MeshBuilder.CreateCylinder(
          "foliage-tree-prototype-lod2",
          { height: 3.6, diameterTop: 0.14, diameterBottom: 1.1, tessellation: 4 },
          this.scene
        ),
        treeMaterial
      )
    } satisfies Record<FoliageLODLevel, Mesh>;

    const bush = {
      0: createPrototypeMesh(
        MeshBuilder.CreateSphere(
          "foliage-bush-prototype-lod0",
          { diameter: 2, segments: 4 },
          this.scene
        ),
        bushMaterial
      ),
      1: createPrototypeMesh(
        MeshBuilder.CreateSphere(
          "foliage-bush-prototype-lod1",
          { diameter: 1.6, segments: 3 },
          this.scene
        ),
        bushMaterial
      ),
      2: createPrototypeMesh(
        MeshBuilder.CreateBox(
          "foliage-bush-prototype-lod2",
          { size: 1.1 },
          this.scene
        ),
        bushMaterial
      )
    } satisfies Record<FoliageLODLevel, Mesh>;

    const rock = {
      0: createPrototypeMesh(
        MeshBuilder.CreatePolyhedron(
          "foliage-rock-prototype-lod0",
          { type: 1, size: 1 },
          this.scene
        ),
        rockMaterial
      ),
      1: createPrototypeMesh(
        MeshBuilder.CreatePolyhedron(
          "foliage-rock-prototype-lod1",
          { type: 2, size: 0.8 },
          this.scene
        ),
        rockMaterial
      ),
      2: createPrototypeMesh(
        MeshBuilder.CreateBox(
          "foliage-rock-prototype-lod2",
          { size: 0.6 },
          this.scene
        ),
        rockMaterial
      )
    } satisfies Record<FoliageLODLevel, Mesh>;

    return {
      [TerrainFoliageKind.Tree]: tree,
      [TerrainFoliageKind.Bush]: bush,
      [TerrainFoliageKind.Rock]: rock
    };
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

function createPrototypeMesh(mesh: Mesh, material: Material): Mesh {
  mesh.material = material;
  mesh.position.y = -10000;
  mesh.isPickable = false;
  mesh.receiveShadows = false;
  return mesh;
}

function createLodRoots(
  scene: Scene,
  name: string
): Record<FoliageLODLevel, TransformNode> {
  return {
    0: new TransformNode(`${name}-lod0`, scene),
    1: new TransformNode(`${name}-lod1`, scene),
    2: new TransformNode(`${name}-lod2`, scene)
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
