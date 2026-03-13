import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import { ProceduralGenerator } from "./ProceduralGenerator";
import { TerrainPoi, TerrainPoiKind } from "./TerrainPoiPlanner";

export class TerrainPoiFootprintSystem {
  private readonly meshes: Mesh[] = [];
  private readonly materials: StandardMaterial[] = [];
  private visible = true;

  constructor(
    private readonly scene: Scene,
    private readonly generator: ProceduralGenerator,
    private readonly sites: readonly TerrainPoi[]
  ) {}

  initialize(): void {
    if (this.meshes.length > 0) {
      return;
    }

    const materialSet = createFootprintMaterials(this.scene);
    this.materials.push(
      materialSet.village,
      materialSet.tavern,
      materialSet.mine,
      materialSet.accent
    );

    this.sites.forEach((site) => {
      switch (site.kind) {
        case TerrainPoiKind.Village:
          this.createVillage(site, materialSet.village, materialSet.accent);
          break;
        case TerrainPoiKind.Tavern:
          this.createTavern(site, materialSet.tavern, materialSet.accent);
          break;
        case TerrainPoiKind.Mine:
          this.createMine(site, materialSet.mine, materialSet.accent);
          break;
      }
    });

    this.setVisible(this.visible);
  }

  dispose(): void {
    this.meshes.forEach((mesh) => mesh.dispose(false, true));
    this.meshes.length = 0;
    this.materials.forEach((material) => material.dispose(false, true));
    this.materials.length = 0;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.meshes.forEach((mesh) => mesh.setEnabled(visible));
  }

  isVisible(): boolean {
    return this.visible;
  }

  private createVillage(
    site: TerrainPoi,
    structureMaterial: StandardMaterial,
    accentMaterial: StandardMaterial
  ): void {
    const rng = createSiteRng(site.id);
    const hutCount = 2 + Math.floor(rng() * 3);

    for (let index = 0; index < hutCount; index += 1) {
      const width = 5 + rng() * 2.5;
      const depth = 7 + rng() * 3;
      const height = 2.8 + rng() * 1.3;
      const offset = polarOffset(7 + rng() * 8, rng() * Math.PI * 2);
      const mesh = MeshBuilder.CreateBox(
        `${site.id}-hut-${index}`,
        { width, depth, height },
        this.scene
      );
      mesh.material = structureMaterial;
      mesh.rotation.y = rng() * Math.PI * 2;
      this.placeMesh(mesh, site.x + offset.x, site.z + offset.z, height * 0.5);
      this.registerMesh(mesh);
    }

    const well = MeshBuilder.CreateCylinder(
      `${site.id}-well`,
      { height: 1.2, diameter: 1.6, tessellation: 8 },
      this.scene
    );
    well.material = accentMaterial;
    this.placeMesh(well, site.x + 2.5, site.z - 1.5, 0.6);
    this.registerMesh(well);
  }

  private createTavern(
    site: TerrainPoi,
    structureMaterial: StandardMaterial,
    accentMaterial: StandardMaterial
  ): void {
    const rng = createSiteRng(site.id);

    const mainHeight = 4 + rng() * 1.2;
    const main = MeshBuilder.CreateBox(
      `${site.id}-main`,
      { width: 8 + rng() * 2, depth: 12 + rng() * 3, height: mainHeight },
      this.scene
    );
    main.material = structureMaterial;
    main.rotation.y = rng() * Math.PI * 2;
    this.placeMesh(main, site.x, site.z, mainHeight * 0.5);
    this.registerMesh(main);

    const annexHeight = 2.8 + rng() * 0.8;
    const annex = MeshBuilder.CreateBox(
      `${site.id}-annex`,
      { width: 5 + rng() * 1.5, depth: 7 + rng() * 2, height: annexHeight },
      this.scene
    );
    annex.material = structureMaterial;
    annex.rotation.y = main.rotation.y + 0.2;
    this.placeMesh(annex, site.x - 5.5, site.z + 4, annexHeight * 0.5);
    this.registerMesh(annex);

    const sign = MeshBuilder.CreateCylinder(
      `${site.id}-sign`,
      { height: 3.4, diameter: 0.35, tessellation: 6 },
      this.scene
    );
    sign.material = accentMaterial;
    this.placeMesh(sign, site.x + 6.5, site.z - 2.5, 1.7);
    this.registerMesh(sign);
  }

  private createMine(
    site: TerrainPoi,
    structureMaterial: StandardMaterial,
    accentMaterial: StandardMaterial
  ): void {
    const rng = createSiteRng(site.id);

    const shedHeight = 3 + rng() * 0.9;
    const shed = MeshBuilder.CreateBox(
      `${site.id}-shed`,
      { width: 6 + rng() * 2, depth: 8 + rng() * 2, height: shedHeight },
      this.scene
    );
    shed.material = structureMaterial;
    shed.rotation.y = rng() * Math.PI * 2;
    this.placeMesh(shed, site.x + 5, site.z + 4, shedHeight * 0.5);
    this.registerMesh(shed);

    const mound = MeshBuilder.CreateSphere(
      `${site.id}-mound`,
      { diameter: 7 + rng() * 2, segments: 10 },
      this.scene
    );
    mound.material = structureMaterial;
    mound.scaling.y = 0.45;
    this.placeMesh(mound, site.x - 5.5, site.z - 3.5, 1.4);
    this.registerMesh(mound);

    const leftPost = MeshBuilder.CreateBox(
      `${site.id}-post-left`,
      { width: 0.35, depth: 0.35, height: 2.6 },
      this.scene
    );
    leftPost.material = accentMaterial;
    this.placeMesh(leftPost, site.x - 1.2, site.z + 0.5, 1.3);
    this.registerMesh(leftPost);

    const rightPost = MeshBuilder.CreateBox(
      `${site.id}-post-right`,
      { width: 0.35, depth: 0.35, height: 2.6 },
      this.scene
    );
    rightPost.material = accentMaterial;
    this.placeMesh(rightPost, site.x + 1.2, site.z + 0.5, 1.3);
    this.registerMesh(rightPost);

    const lintel = MeshBuilder.CreateBox(
      `${site.id}-lintel`,
      { width: 2.8, depth: 0.4, height: 0.35 },
      this.scene
    );
    lintel.material = accentMaterial;
    this.placeMesh(lintel, site.x, site.z + 0.5, 2.7);
    this.registerMesh(lintel);
  }

  private placeMesh(mesh: Mesh, x: number, z: number, halfHeight: number): void {
    const height = this.generator.sample(x, z).height;
    mesh.position.set(x, height + halfHeight, z);
    mesh.isPickable = false;
    mesh.receiveShadows = false;
  }

  private registerMesh(mesh: Mesh): void {
    mesh.renderingGroupId = 1;
    this.meshes.push(mesh);
  }
}

function createFootprintMaterials(scene: Scene): {
  village: StandardMaterial;
  tavern: StandardMaterial;
  mine: StandardMaterial;
  accent: StandardMaterial;
} {
  const village = new StandardMaterial("poi-footprint-village", scene);
  village.diffuseColor = new Color3(0.63, 0.54, 0.38);
  village.specularColor = Color3.Black();

  const tavern = new StandardMaterial("poi-footprint-tavern", scene);
  tavern.diffuseColor = new Color3(0.72, 0.42, 0.24);
  tavern.specularColor = Color3.Black();

  const mine = new StandardMaterial("poi-footprint-mine", scene);
  mine.diffuseColor = new Color3(0.46, 0.38, 0.32);
  mine.specularColor = Color3.Black();

  const accent = new StandardMaterial("poi-footprint-accent", scene);
  accent.diffuseColor = new Color3(0.36, 0.28, 0.2);
  accent.specularColor = Color3.Black();

  return { village, tavern, mine, accent };
}

function createSiteRng(seed: string): () => number {
  let state = hashString(seed) || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function polarOffset(radius: number, angle: number): Vector3 {
  return new Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
}
