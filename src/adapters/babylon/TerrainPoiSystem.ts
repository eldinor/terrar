import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import {
  getMineResourceKind,
  TerrainMineResource,
  TerrainPoi,
  TerrainPoiKind,
  TerrainPoiPlanner
} from "../../terrain/TerrainPoiPlanner";
import type { TerrainPoiPresenter } from "../../terrain/TerrainPresentation";

export interface TerrainPoiStats {
  readonly total: number;
  readonly villages: number;
  readonly outposts: number;
  readonly mines: number;
}

export interface TerrainPoiMeshStats {
  readonly total: number;
  readonly enabled: number;
}

export interface TerrainPoiDebugConfig {
  readonly showScores: boolean;
  readonly showRadii: boolean;
  readonly showTags: boolean;
  readonly kinds: Readonly<Record<TerrainPoiKind, boolean>>;
  readonly mineResources: Readonly<Record<TerrainMineResource, boolean>>;
}

export const DEFAULT_TERRAIN_POI_DEBUG_CONFIG: TerrainPoiDebugConfig = Object.freeze({
  showScores: false,
  showRadii: false,
  showTags: true,
  kinds: Object.freeze({
    [TerrainPoiKind.Village]: true,
    [TerrainPoiKind.Outpost]: true,
    [TerrainPoiKind.Mine]: true
  }),
  mineResources: Object.freeze({
    coal: true,
    iron: true,
    copper: true
  })
});

export class TerrainPoiSystem implements TerrainPoiPresenter {
  private static readonly LABEL_UPDATE_INTERVAL_FRAMES = 3;
  private static readonly LABEL_CAMERA_MOVE_EPSILON_SQUARED = 1;
  private static readonly LABEL_CAMERA_TARGET_MOVE_EPSILON_SQUARED = 1;
  private readonly meshes: Mesh[] = [];
  private readonly labels: HTMLDivElement[] = [];
  private readonly root: HTMLDivElement;
  private sites: TerrainPoi[] = [];
  private visible = true;
  private markerMeshesVisible = true;
  private labelsVisible = true;
  private labelUpdateFrame = 0;
  private lastLabelCameraPosition: Vector3 | null = null;
  private lastLabelCameraTarget: Vector3 | null = null;
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

    this.labelUpdateFrame += 1;
    const cameraTarget = getCameraTarget(camera);
    if (!this.shouldRefreshLabels(camera.position, cameraTarget)) {
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
        this.visible &&
        this.labelsVisible &&
        siteMatchesDebugConfig(site, this.debugConfig) &&
        inFrontOfCamera;
      label.style.display = siteVisible ? "block" : "none";
      label.style.transform = `translate(${projected.x}px, ${projected.y}px) translate(-50%, -100%)`;
    });

    this.lastLabelCameraPosition = camera.position.clone();
    this.lastLabelCameraTarget = cameraTarget?.clone() ?? null;
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
      outposts: 0,
      mines: 0
    };

    this.sites.forEach((site) => {
      switch (site.kind) {
        case TerrainPoiKind.Village:
          stats.villages += 1;
          break;
        case TerrainPoiKind.Outpost:
          stats.outposts += 1;
          break;
        case TerrainPoiKind.Mine:
          stats.mines += 1;
          break;
      }
    });

    return stats;
  }

  getMeshStats(): TerrainPoiMeshStats {
    let enabled = 0;
    this.meshes.forEach((mesh) => {
      if (mesh.isEnabled()) {
        enabled += 1;
      }
    });

    return {
      total: this.meshes.length,
      enabled
    };
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

  setMarkerMeshesVisible(visible: boolean): void {
    this.markerMeshesVisible = visible;
    this.applyDebugConfig();
  }

  getMarkerMeshesVisible(): boolean {
    return this.markerMeshesVisible;
  }

  setLabelsVisible(visible: boolean): void {
    this.labelsVisible = visible;
    this.applyDebugConfig();
  }

  getLabelsVisible(): boolean {
    return this.labelsVisible;
  }

  private createMarker(site: TerrainPoi): Mesh {
    const marker = createMarkerMesh(this.scene, site);
    const markerHeight = getPoiMarkerHeight(site);
    marker.position.set(site.x, site.y + markerHeight + 10, site.z);
    marker.isPickable = false;
    marker.renderingGroupId = 3;
    marker.billboardMode = AbstractMesh.BILLBOARDMODE_ALL;
    marker.renderOutline = true;
    marker.outlineColor = Color3.Black();
    marker.outlineWidth = 0.03;
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
      const visible = enabled && siteMatchesDebugConfig(site, this.debugConfig);
      this.meshes[index]?.setEnabled(visible && this.markerMeshesVisible);
      const label = this.labels[index];
      if (label) {
        label.textContent = buildPoiLabel(site, this.debugConfig);
        applyLabelStyle(label, site);
        if (!(visible && this.labelsVisible)) {
          label.style.display = "none";
        }
      }
    });
    this.lastLabelCameraPosition = null;
    this.lastLabelCameraTarget = null;
  }

  private shouldRefreshLabels(
    cameraPosition: Vector3,
    cameraTarget: Vector3 | null
  ): boolean {
    if (!this.visible || !this.labelsVisible) {
      return false;
    }

    if (
      !this.lastLabelCameraPosition ||
      !this.lastLabelCameraTarget ||
      !cameraTarget
    ) {
      return true;
    }

    const positionMoved =
      Vector3.DistanceSquared(cameraPosition, this.lastLabelCameraPosition) >=
      TerrainPoiSystem.LABEL_CAMERA_MOVE_EPSILON_SQUARED;
    const targetMoved =
      Vector3.DistanceSquared(cameraTarget, this.lastLabelCameraTarget) >=
      TerrainPoiSystem.LABEL_CAMERA_TARGET_MOVE_EPSILON_SQUARED;

    if (positionMoved || targetMoved) {
      return true;
    }

    return (
      this.labelUpdateFrame % TerrainPoiSystem.LABEL_UPDATE_INTERVAL_FRAMES === 0
    );
  }
}

function getCameraTarget(camera: Scene["activeCamera"]): Vector3 | null {
  if (!camera || typeof (camera as { getTarget?: unknown }).getTarget !== "function") {
    return null;
  }

  return (camera as unknown as { getTarget: () => Vector3 }).getTarget();
}

function createMarkerMesh(scene: Scene, site: TerrainPoi): Mesh {
  const color = getPoiColor(site);
  const markerHeight = getPoiMarkerHeight(site);
  const markerWidth = getPoiMarkerWidth(site);
  const marker = MeshBuilder.CreatePlane(
    `poi-${site.id}`,
    { width: markerWidth, height: markerHeight },
    scene
  );

  const material = new StandardMaterial(`poi-${site.id}-material`, scene);
  material.emissiveColor = color;
  material.diffuseColor = color.scale(0.45);
  material.specularColor = Color3.Black();
  material.disableLighting = true;
  material.backFaceCulling = false;
  material.disableDepthWrite = true;
  material.alpha = 0.96;
  marker.material = material;
  return marker;
}

function getPoiMarkerHeight(site: TerrainPoi): number {
  return Math.max(22, Math.min(42, site.radius * 0.2));
}

function getPoiMarkerWidth(site: TerrainPoi): number {
  return Math.max(14, Math.min(28, site.radius * 0.12));
}

function getPoiColor(site: TerrainPoi): Color3 {
  switch (site.kind) {
    case TerrainPoiKind.Village:
      return new Color3(0.98, 0.82, 0.42);
    case TerrainPoiKind.Outpost:
      return new Color3(0.96, 0.5, 0.26);
    case TerrainPoiKind.Mine:
      return getMineResourceColor(getMineResourceKind(site));
  }
}

function getPoiLabel(site: TerrainPoi): string {
  switch (site.kind) {
    case TerrainPoiKind.Village:
      return "Village";
    case TerrainPoiKind.Outpost:
      return "Outpost";
    case TerrainPoiKind.Mine:
      return `${capitalizeWord(getMineResourceKind(site) ?? "mine")} Mine`;
  }
}

function buildPoiLabel(
  site: TerrainPoi,
  config: TerrainPoiDebugConfig
): string {
  const lines = [getPoiLabel(site)];
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
    kinds: { ...config.kinds },
    mineResources: { ...config.mineResources }
  };
}

function siteMatchesDebugConfig(
  site: TerrainPoi,
  config: TerrainPoiDebugConfig
): boolean {
  if (!config.kinds[site.kind]) {
    return false;
  }

  if (site.kind !== TerrainPoiKind.Mine) {
    return true;
  }

  const resource = getMineResourceKind(site);
  return resource ? config.mineResources[resource] : true;
}

function getMineResourceColor(resource: TerrainMineResource | null): Color3 {
  switch (resource) {
    case "iron":
      return new Color3(0.82, 0.46, 0.28);
    case "copper":
      return new Color3(0.24, 0.74, 0.6);
    case "coal":
    default:
      return new Color3(0.62, 0.64, 0.7);
  }
}

function applyLabelStyle(label: HTMLDivElement, site: TerrainPoi): void {
  const color = getPoiColor(site).toHexString();
  label.style.color = color;
  label.style.border = `1px solid ${hexWithAlpha(color, "38")}`;
  label.style.background =
    `linear-gradient(180deg, rgba(8, 13, 19, 0.82), rgba(8, 13, 19, 0.6))`;
}

function hexWithAlpha(color: string, alpha: string): string {
  return `${color}${alpha}`;
}

function capitalizeWord(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
