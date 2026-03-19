import type { Scene } from "@babylonjs/core/scene";
import type { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import type { TerrainChunk } from "./TerrainChunk";
import type { TerrainConfig } from "./TerrainConfig";
import type { TerrainPoi, TerrainPoiPlanner } from "./TerrainPoiPlanner";
import type { TerrainRoad } from "./TerrainRoadPlanner";

export interface TerrainPoiDebugConfig {
  readonly showScores: boolean;
  readonly showRadii: boolean;
  readonly showTags: boolean;
  readonly kinds: Readonly<Record<string, boolean>>;
  readonly mineResources: Readonly<Record<string, boolean>>;
}

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

export interface TerrainRoadStats {
  readonly totalRoads: number;
  readonly totalPoints: number;
}

export interface TerrainPoiPresenter {
  initialize(): void;
  update(): void;
  dispose(): void;
  getSites(): readonly TerrainPoi[];
  getStats(): TerrainPoiStats;
  getMeshStats(): TerrainPoiMeshStats;
  setVisible(visible: boolean): void;
  isVisible(): boolean;
  setDebugConfig(config: TerrainPoiDebugConfig): void;
  getDebugConfig(): TerrainPoiDebugConfig;
  setMarkerMeshesVisible(visible: boolean): void;
  getMarkerMeshesVisible(): boolean;
  setLabelsVisible(visible: boolean): void;
  getLabelsVisible(): boolean;
}

export interface TerrainRoadPresenter {
  initialize(pois: readonly TerrainPoi[]): void;
  dispose(): void;
  setVisible(visible: boolean): void;
  isVisible(): boolean;
  getRoads(): readonly TerrainRoad[];
  getRoadMaskTexture(): DynamicTexture;
  getStats(): TerrainRoadStats;
}

export interface TerrainDebugOverlayController {
  create(): Promise<void>;
  update(): void;
  toggle(): Promise<boolean>;
  dispose(): void;
}

export interface TerrainPresentationFactories {
  readonly createPoiPresenter?: (
    scene: Scene,
    planner: TerrainPoiPlanner,
    prebuiltSites: readonly TerrainPoi[]
  ) => TerrainPoiPresenter;
  readonly createDebugOverlayController?: (
    scene: Scene,
    chunks: readonly TerrainChunk[],
    config: TerrainConfig
  ) => TerrainDebugOverlayController;
}
