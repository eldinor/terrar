import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Scene } from "@babylonjs/core/scene";
import {
  BuiltTerrain,
  BuiltTerrainPoi,
  BuiltTerrainRoad
} from "../builder";
import { ProceduralGenerator } from "./ProceduralGenerator";
import { TerrainConfig } from "./TerrainConfig";
import { TerrainPoi, TerrainPoiKind, TerrainPoiPlanner } from "./TerrainPoiPlanner";
import {
  TerrainPoiDebugConfig,
  TerrainPoiMeshStats,
  TerrainPoiPresenter,
  TerrainPoiStats,
  TerrainPresentationFactories,
  TerrainRoadPresenter
} from "./TerrainPresentation";
import { TerrainPoiFootprintSystem } from "./TerrainPoiFootprintSystem";
import { TerrainRoad, TerrainRoadPlanner } from "./TerrainRoadPlanner";
import { TerrainRoadStats, TerrainRoadSystem } from "./TerrainRoadSystem";

export class TerrainFeatureRuntime {
  private readonly poiPlanner: TerrainPoiPlanner | null;
  private readonly poiPresenter: TerrainPoiPresenter | null;
  private readonly poiFootprintSystem: TerrainPoiFootprintSystem | null;
  private readonly roadPlanner: TerrainRoadPlanner | null;
  private readonly roadPresenter: TerrainRoadPresenter | null;
  private poiVisible = false;
  private poiMarkerMeshesVisible = true;
  private poiLabelsVisible = true;
  private poiFootprintsVisible = true;
  private roadVisible = false;
  private poiDebugConfig: TerrainPoiDebugConfig = createDefaultPoiDebugConfig();

  constructor(
    private readonly scene: Scene,
    private readonly config: TerrainConfig,
    private readonly generator: ProceduralGenerator,
    prebuiltWorld: BuiltTerrain | null,
    presentationFactories: TerrainPresentationFactories = {}
  ) {
    const prebuiltPoiSites = prebuiltWorld
      ? prebuiltWorld.poiSites.map(toTerrainPoi)
      : [];
    const prebuiltRoads = prebuiltWorld
      ? prebuiltWorld.roads.map(toTerrainRoad)
      : [];
    this.poiPlanner = this.config.features.poi
      ? new TerrainPoiPlanner(this.config, this.generator)
      : null;
    this.poiPresenter = this.poiPlanner && presentationFactories.createPoiPresenter
      ? presentationFactories.createPoiPresenter(
          this.scene,
          this.poiPlanner,
          prebuiltPoiSites
        )
      : null;
    this.poiFootprintSystem = this.poiPlanner
      ? new TerrainPoiFootprintSystem(
          this.scene,
          this.generator,
          prebuiltPoiSites
        )
      : null;
    this.roadPlanner =
      this.config.features.poi && this.config.features.roads
        ? new TerrainRoadPlanner(this.config, this.generator)
        : null;
    this.roadPresenter = this.roadPlanner
      ? new TerrainRoadSystem(
          this.scene,
          this.roadPlanner,
          this.config,
          prebuiltRoads
        )
      : null;
  }

  initialize(): void {
    if (this.poiPresenter) {
      this.poiPresenter.initialize();
      this.poiPresenter.setDebugConfig(this.poiDebugConfig);
      this.poiPresenter.setMarkerMeshesVisible(this.poiMarkerMeshesVisible);
      this.poiPresenter.setLabelsVisible(this.poiLabelsVisible);
      this.poiVisible = true;
    }
    if (this.poiFootprintSystem) {
      this.poiFootprintSystem.initialize();
      this.poiFootprintSystem.setVisible(this.poiFootprintsVisible);
    }
    if (this.poiPresenter && this.roadPresenter) {
      this.roadPresenter.initialize(this.poiPresenter.getSites());
      this.roadVisible = true;
    }
  }

  update(): void {
    this.poiPresenter?.setVisible(this.poiVisible);
    this.roadPresenter?.setVisible(this.roadVisible);
    this.poiPresenter?.update();
  }

  dispose(): void {
    this.poiPresenter?.dispose();
    this.poiFootprintSystem?.dispose();
    this.roadPresenter?.dispose();
  }

  getPoiSites(): readonly TerrainPoi[] {
    return this.poiPresenter?.getSites() ?? [];
  }

  getRoads(): readonly TerrainRoad[] {
    return this.roadPresenter?.getRoads() ?? [];
  }

  getRoadMaskTexture(): DynamicTexture | null {
    return this.roadPresenter?.getRoadMaskTexture() ?? null;
  }

  setShowPoi(enabled: boolean): void {
    this.poiVisible = enabled && this.config.features.poi;
    this.poiPresenter?.setVisible(this.poiVisible);
  }

  getShowPoi(): boolean {
    return this.poiVisible;
  }

  setPoiMarkerMeshesVisible(enabled: boolean): void {
    this.poiMarkerMeshesVisible = enabled;
    this.poiPresenter?.setMarkerMeshesVisible(enabled);
  }

  getPoiMarkerMeshesVisible(): boolean {
    return this.poiMarkerMeshesVisible;
  }

  setPoiLabelsVisible(enabled: boolean): void {
    this.poiLabelsVisible = enabled;
    this.poiPresenter?.setLabelsVisible(enabled);
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
    this.roadPresenter?.setVisible(this.roadVisible);
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
    this.poiPresenter?.setDebugConfig(this.poiDebugConfig);
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
      this.poiPresenter?.getStats() ?? {
        total: 0,
        villages: 0,
        outposts: 0,
        mines: 0
      }
    );
  }

  getPoiMeshStats(): TerrainPoiMeshStats {
    return (
      this.poiPresenter?.getMeshStats() ?? {
        total: 0,
        enabled: 0
      }
    );
  }

  getRoadStats(): TerrainRoadStats {
    return this.roadPresenter?.getStats() ?? {
      totalRoads: 0,
      totalPoints: 0
    };
  }
}

function createDefaultPoiDebugConfig(): TerrainPoiDebugConfig {
  return {
    showScores: false,
    showRadii: false,
    showTags: true,
    kinds: {
      [TerrainPoiKind.Village]: true,
      [TerrainPoiKind.Outpost]: true,
      [TerrainPoiKind.Mine]: true
    },
    mineResources: {
      coal: true,
      iron: true,
      copper: true
    }
  };
}

function toTerrainPoi(site: BuiltTerrainPoi): TerrainPoi {
  return {
    id: site.id,
    kind: toTerrainPoiKind(site.kind),
    x: site.x,
    y: site.y,
    z: site.z,
    score: site.score,
    radius: site.radius,
    tags: [...site.tags]
  };
}

function toTerrainRoad(road: BuiltTerrainRoad): TerrainRoad {
  return {
    id: road.id,
    fromPoiId: road.fromPoiId,
    toPoiId: road.toPoiId,
    cost: road.cost,
    points: road.points.map((point) => ({
      x: point.x,
      y: point.y,
      z: point.z
    }))
  };
}

function toTerrainPoiKind(kind: BuiltTerrainPoi["kind"]): TerrainPoiKind {
  switch (kind) {
    case "village":
      return TerrainPoiKind.Village;
    case "outpost":
      return TerrainPoiKind.Outpost;
    case "mine":
      return TerrainPoiKind.Mine;
  }
}
