import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Scene } from "@babylonjs/core/scene";
import { ProceduralGenerator } from "./ProceduralGenerator";
import { TerrainConfig } from "./TerrainConfig";
import { TerrainPoi, TerrainPoiPlanner } from "./TerrainPoiPlanner";
import {
  DEFAULT_TERRAIN_POI_DEBUG_CONFIG,
  TerrainPoiDebugConfig,
  TerrainPoiMeshStats,
  TerrainPoiStats,
  TerrainPoiSystem
} from "./TerrainPoiSystem";
import { TerrainPoiFootprintSystem } from "./TerrainPoiFootprintSystem";
import { TerrainRoad, TerrainRoadPlanner } from "./TerrainRoadPlanner";
import { TerrainRoadStats, TerrainRoadSystem } from "./TerrainRoadSystem";
import type { BuiltTerrain } from "../builder";

export class TerrainFeatureRuntime {
  private readonly poiPlanner: TerrainPoiPlanner | null;
  private readonly poiSystem: TerrainPoiSystem | null;
  private readonly poiFootprintSystem: TerrainPoiFootprintSystem | null;
  private readonly roadPlanner: TerrainRoadPlanner | null;
  private readonly roadSystem: TerrainRoadSystem | null;
  private poiVisible = false;
  private poiMarkerMeshesVisible = true;
  private poiLabelsVisible = true;
  private poiFootprintsVisible = true;
  private roadVisible = false;
  private poiDebugConfig: TerrainPoiDebugConfig = {
    ...DEFAULT_TERRAIN_POI_DEBUG_CONFIG,
    kinds: { ...DEFAULT_TERRAIN_POI_DEBUG_CONFIG.kinds },
    mineResources: { ...DEFAULT_TERRAIN_POI_DEBUG_CONFIG.mineResources }
  };

  constructor(
    private readonly scene: Scene,
    private readonly config: TerrainConfig,
    private readonly generator: ProceduralGenerator,
    prebuiltWorld: BuiltTerrain | null
  ) {
    this.poiPlanner = this.config.features.poi
      ? new TerrainPoiPlanner(this.config, this.generator)
      : null;
    this.poiSystem = this.poiPlanner
      ? new TerrainPoiSystem(
          this.scene,
          this.poiPlanner,
          prebuiltWorld?.poiSites ?? []
        )
      : null;
    this.poiFootprintSystem = this.poiPlanner
      ? new TerrainPoiFootprintSystem(
          this.scene,
          this.generator,
          prebuiltWorld?.poiSites ?? []
        )
      : null;
    this.roadPlanner =
      this.config.features.poi && this.config.features.roads
        ? new TerrainRoadPlanner(this.config, this.generator)
        : null;
    this.roadSystem = this.roadPlanner
      ? new TerrainRoadSystem(
          this.scene,
          this.roadPlanner,
          this.config,
          prebuiltWorld?.roads ?? []
        )
      : null;
  }

  initialize(): void {
    if (this.poiSystem) {
      this.poiSystem.initialize();
      this.poiSystem.setDebugConfig(this.poiDebugConfig);
      this.poiSystem.setMarkerMeshesVisible(this.poiMarkerMeshesVisible);
      this.poiSystem.setLabelsVisible(this.poiLabelsVisible);
      this.poiVisible = true;
    }
    if (this.poiFootprintSystem) {
      this.poiFootprintSystem.initialize();
      this.poiFootprintSystem.setVisible(this.poiFootprintsVisible);
    }
    if (this.poiSystem && this.roadSystem) {
      this.roadSystem.initialize(this.poiSystem.getSites());
      this.roadVisible = true;
    }
  }

  update(): void {
    this.poiSystem?.setVisible(this.poiVisible);
    this.roadSystem?.setVisible(this.roadVisible);
    this.poiSystem?.update();
  }

  dispose(): void {
    this.poiSystem?.dispose();
    this.poiFootprintSystem?.dispose();
    this.roadSystem?.dispose();
  }

  getPoiSites(): readonly TerrainPoi[] {
    return this.poiSystem?.getSites() ?? [];
  }

  getRoads(): readonly TerrainRoad[] {
    return this.roadSystem?.getRoads() ?? [];
  }

  getRoadMaskTexture(): DynamicTexture | null {
    return this.roadSystem?.getRoadMaskTexture() ?? null;
  }

  setShowPoi(enabled: boolean): void {
    this.poiVisible = enabled && this.config.features.poi;
    this.poiSystem?.setVisible(this.poiVisible);
  }

  getShowPoi(): boolean {
    return this.poiVisible;
  }

  setPoiMarkerMeshesVisible(enabled: boolean): void {
    this.poiMarkerMeshesVisible = enabled;
    this.poiSystem?.setMarkerMeshesVisible(enabled);
  }

  getPoiMarkerMeshesVisible(): boolean {
    return this.poiMarkerMeshesVisible;
  }

  setPoiLabelsVisible(enabled: boolean): void {
    this.poiLabelsVisible = enabled;
    this.poiSystem?.setLabelsVisible(enabled);
  }

  getPoiLabelsVisible(): boolean {
    return this.poiLabelsVisible;
  }

  setShowPoiFootprints(enabled: boolean): void {
    this.poiFootprintsVisible = enabled && this.config.features.poi;
    this.poiFootprintSystem?.setVisible(this.poiFootprintsVisible);
  }

  getShowPoiFootprints(): boolean {
    return this.poiFootprintsVisible;
  }

  setShowRoads(enabled: boolean): void {
    this.roadVisible = enabled && this.config.features.roads;
    this.roadSystem?.setVisible(this.roadVisible);
  }

  getShowRoads(): boolean {
    return this.roadVisible;
  }

  setPoiDebugConfig(config: TerrainPoiDebugConfig): void {
    this.poiDebugConfig = {
      ...config,
      kinds: { ...config.kinds },
      mineResources: { ...config.mineResources }
    };
    this.poiSystem?.setDebugConfig(this.poiDebugConfig);
  }

  getPoiDebugConfig(): TerrainPoiDebugConfig {
    return {
      ...this.poiDebugConfig,
      kinds: { ...this.poiDebugConfig.kinds },
      mineResources: { ...this.poiDebugConfig.mineResources }
    };
  }

  getPoiStats(): TerrainPoiStats {
    return (
      this.poiSystem?.getStats() ?? {
        total: 0,
        villages: 0,
        outposts: 0,
        mines: 0
      }
    );
  }

  getPoiMeshStats(): TerrainPoiMeshStats {
    return (
      this.poiSystem?.getMeshStats() ?? {
        total: 0,
        enabled: 0
      }
    );
  }

  getRoadStats(): TerrainRoadStats {
    return this.roadSystem?.getStats() ?? {
      totalRoads: 0,
      totalPoints: 0
    };
  }
}
