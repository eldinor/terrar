import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import { TerrainPoi, TerrainPoiKind, TerrainPoiPlanner } from "./TerrainPoiPlanner";

export interface TerrainPoiStats {
  readonly total: number;
  readonly villages: number;
  readonly harbors: number;
  readonly hillforts: number;
  readonly mines: number;
}

export interface TerrainPoiDebugConfig {
  readonly showScores: boolean;
  readonly showRadii: boolean;
  readonly showTags: boolean;
  readonly kinds: Readonly<Record<TerrainPoiKind, boolean>>;
}

export const DEFAULT_TERRAIN_POI_DEBUG_CONFIG: TerrainPoiDebugConfig = Object.freeze({
  showScores: false,
  showRadii: false,
  showTags: true,
  kinds: Object.freeze({
    [TerrainPoiKind.Village]: true,
    [TerrainPoiKind.Harbor]: true,
    [TerrainPoiKind.Hillfort]: true,
    [TerrainPoiKind.Mine]: true
  })
});

export class TerrainPoiSystem {
  private readonly meshes: Mesh[] = [];
  private readonly labels: HTMLDivElement[] = [];
  private readonly root: HTMLDivElement;
  private sites: TerrainPoi[] = [];
  private visible = true;
  private debugConfig: TerrainPoiDebugConfig = clonePoiDebugConfig(
    DEFAULT_TERRAIN_POI_DEBUG_CONFIG
  );

  constructor(
    private readonly scene: Scene,
    private readonly planner: TerrainPoiPlanner,
    private readonly prebuiltSites: readonly TerrainPoi[] = []
  ) {
    this.root = this.createRootElement();
  }

  initialize(): void {
    if (this.sites.length > 0) {
      return;
    }

    this.sites =
      this.prebuiltSites.length > 0
        ? [...this.prebuiltSites]
        : this.planner.generateSites();
    this.sites.forEach((site) => {
      this.meshes.push(this.createMarker(site));
      this.labels.push(this.createLabel(site));
    });
    this.applyDebugConfig();
  }

  update(): void {
    const camera = this.scene.activeCamera;
    const engine = this.scene.getEngine();
    const canvas = engine.getRenderingCanvas();
    if (!camera || !canvas) {
      return;
    }

    const viewport = camera.viewport.toGlobal(
      engine.getRenderWidth(),
      engine.getRenderHeight()
    );
    const transform = this.scene.getTransformMatrix();

    this.sites.forEach((site, index) => {
      const anchor = new Vector3(site.x, site.y + 22, site.z);
      const projected = Vector3.Project(
        anchor,
        Matrix.IdentityReadOnly,
        transform,
        viewport
      );
      const inFrontOfCamera = projected.z >= 0 && projected.z <= 1;
      const label = this.labels[index];
      const siteVisible =
        this.visible && this.debugConfig.kinds[site.kind] && inFrontOfCamera;
      label.style.display = siteVisible ? "block" : "none";
      label.style.transform = `translate(${projected.x}px, ${projected.y}px) translate(-50%, -100%)`;
    });
  }

  dispose(): void {
    this.meshes.forEach((mesh) => mesh.dispose(false, true));
    this.meshes.length = 0;
    this.labels.forEach((label) => label.remove());
    this.labels.length = 0;
    this.root.remove();
    this.sites = [];
  }

  getSites(): readonly TerrainPoi[] {
    return this.sites;
  }

  getStats(): TerrainPoiStats {
    const stats = {
      total: this.sites.length,
      villages: 0,
      harbors: 0,
      hillforts: 0,
      mines: 0
    };

    this.sites.forEach((site) => {
      switch (site.kind) {
        case TerrainPoiKind.Village:
          stats.villages += 1;
          break;
        case TerrainPoiKind.Harbor:
          stats.harbors += 1;
          break;
        case TerrainPoiKind.Hillfort:
          stats.hillforts += 1;
          break;
        case TerrainPoiKind.Mine:
          stats.mines += 1;
          break;
      }
    });

    return stats;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.applyDebugConfig();
  }

  isVisible(): boolean {
    return this.visible;
  }

  setDebugConfig(config: TerrainPoiDebugConfig): void {
    this.debugConfig = clonePoiDebugConfig(config);
    this.applyDebugConfig();
  }

  getDebugConfig(): TerrainPoiDebugConfig {
    return clonePoiDebugConfig(this.debugConfig);
  }

  private createMarker(site: TerrainPoi): Mesh {
    const marker = createMarkerMesh(this.scene, site);
    marker.position.set(site.x, site.y + 10, site.z);
    marker.alwaysSelectAsActiveMesh = true;
    marker.isPickable = false;
    return marker;
  }

  private createLabel(site: TerrainPoi): HTMLDivElement {
    const label = document.createElement("div");
    label.style.position = "fixed";
    label.style.left = "0";
    label.style.top = "0";
    label.style.pointerEvents = "none";
    label.style.whiteSpace = "pre";
    label.style.color = "#f3f0d4";
    label.style.font = "11px/1.25 Consolas, 'Courier New', monospace";
    label.style.textShadow = "0 0 8px rgba(0, 0, 0, 0.85)";
    label.style.padding = "2px 6px";
    label.style.borderRadius = "6px";
    label.style.background = "rgba(8, 13, 19, 0.6)";
    label.style.border = "1px solid rgba(243, 240, 212, 0.16)";
    label.textContent = buildPoiLabel(site, this.debugConfig);
    this.root.appendChild(label);
    return label;
  }

  private createRootElement(): HTMLDivElement {
    const root = document.createElement("div");
    root.id = "terrain-poi-overlay";
    root.style.position = "fixed";
    root.style.inset = "0";
    root.style.pointerEvents = "none";
    root.style.zIndex = "8";
    document.body.appendChild(root);
    return root;
  }

  private applyDebugConfig(): void {
    this.sites.forEach((site, index) => {
      const enabled = this.visible && this.debugConfig.kinds[site.kind];
      this.meshes[index]?.setEnabled(enabled);
      const label = this.labels[index];
      if (label) {
        label.textContent = buildPoiLabel(site, this.debugConfig);
        if (!enabled) {
          label.style.display = "none";
        }
      }
    });
  }
}

function createMarkerMesh(scene: Scene, site: TerrainPoi): Mesh {
  const color = getPoiColor(site.kind);
  let marker: Mesh;

  switch (site.kind) {
    case TerrainPoiKind.Village:
      marker = MeshBuilder.CreateCylinder(
        `poi-${site.id}`,
        { height: 18, diameterTop: 0, diameterBottom: 8, tessellation: 4 },
        scene
      );
      break;
    case TerrainPoiKind.Harbor:
      marker = MeshBuilder.CreateBox(
        `poi-${site.id}`,
        { width: 10, height: 12, depth: 10 },
        scene
      );
      break;
    case TerrainPoiKind.Hillfort:
      marker = MeshBuilder.CreateCylinder(
        `poi-${site.id}`,
        { height: 14, diameterTop: 7, diameterBottom: 11, tessellation: 6 },
        scene
      );
      break;
    case TerrainPoiKind.Mine:
      marker = MeshBuilder.CreatePolyhedron(
        `poi-${site.id}`,
        { type: 2, size: 7 },
        scene
      );
      break;
  }

  const material = new StandardMaterial(`poi-${site.id}-material`, scene);
  material.emissiveColor = color;
  material.diffuseColor = color.scale(0.25);
  material.specularColor = Color3.Black();
  marker.material = material;
  return marker;
}

function getPoiColor(kind: TerrainPoiKind): Color3 {
  switch (kind) {
    case TerrainPoiKind.Village:
      return new Color3(0.98, 0.82, 0.42);
    case TerrainPoiKind.Harbor:
      return new Color3(0.34, 0.78, 1.0);
    case TerrainPoiKind.Hillfort:
      return new Color3(1.0, 0.42, 0.3);
    case TerrainPoiKind.Mine:
      return new Color3(0.82, 0.62, 0.44);
  }
}

function getPoiLabel(kind: TerrainPoiKind): string {
  switch (kind) {
    case TerrainPoiKind.Village:
      return "Village";
    case TerrainPoiKind.Harbor:
      return "Harbor";
    case TerrainPoiKind.Hillfort:
      return "Hillfort";
    case TerrainPoiKind.Mine:
      return "Mine";
  }
}

function buildPoiLabel(
  site: TerrainPoi,
  config: TerrainPoiDebugConfig
): string {
  const lines = [getPoiLabel(site.kind)];
  if (config.showScores) {
    lines.push(`score ${site.score.toFixed(2)}`);
  }
  if (config.showRadii) {
    lines.push(`r ${Math.round(site.radius)}`);
  }
  if (config.showTags) {
    lines.push(site.tags.slice(0, 3).join(" | ") || "site");
  }
  return lines.join("\n");
}

function clonePoiDebugConfig(
  config: TerrainPoiDebugConfig
): TerrainPoiDebugConfig {
  return {
    showScores: config.showScores,
    showRadii: config.showRadii,
    showTags: config.showTags,
    kinds: { ...config.kinds }
  };
}
