import { DynamicTexture } from "@babylonjs/core/Materials/Textures/dynamicTexture";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { Scene } from "@babylonjs/core/scene";
import { TerrainConfig } from "./TerrainConfig";
import { TerrainPoi } from "./TerrainPoiPlanner";
import { TerrainRoad, TerrainRoadPlanner } from "./TerrainRoadPlanner";

export interface TerrainRoadStats {
  readonly totalRoads: number;
  readonly totalPoints: number;
}

export class TerrainRoadSystem {
  private readonly roadMaskTexture: DynamicTexture;
  private readonly roadMeshes: Mesh[] = [];
  private roads: TerrainRoad[] = [];
  private visible = true;

  constructor(
    private readonly scene: Scene,
    private readonly planner: TerrainRoadPlanner,
    private readonly config: TerrainConfig
  ) {
    this.roadMaskTexture = new DynamicTexture(
      "terrain-road-mask",
      { width: 512, height: 512 },
      this.scene,
      false
    );
    this.roadMaskTexture.wrapU = Texture.CLAMP_ADDRESSMODE;
    this.roadMaskTexture.wrapV = Texture.CLAMP_ADDRESSMODE;
  }

  initialize(pois: readonly TerrainPoi[]): void {
    if (this.roads.length > 0) {
      return;
    }

    this.roads = this.planner.generateRoads(pois);
    this.redrawRoadMask();
  }

  dispose(): void {
    this.roadMeshes.forEach((mesh) => mesh.dispose(false, true));
    this.roadMeshes.length = 0;
    this.roadMaskTexture.dispose();
    this.roads = [];
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.roadMeshes.forEach((mesh) => mesh.setEnabled(visible));
  }

  isVisible(): boolean {
    return this.visible;
  }

  getRoads(): readonly TerrainRoad[] {
    return this.roads;
  }

  getRoadMaskTexture(): DynamicTexture {
    return this.roadMaskTexture;
  }

  getStats(): TerrainRoadStats {
    return {
      totalRoads: this.roads.length,
      totalPoints: this.roads.reduce((sum, road) => sum + road.points.length, 0)
    };
  }

  private redrawRoadMask(): void {
    const size = this.roadMaskTexture.getSize();
    const context = this.roadMaskTexture
      .getContext() as unknown as CanvasRenderingContext2D;
    context.clearRect(0, 0, size.width, size.height);
    context.fillStyle = "black";
    context.fillRect(0, 0, size.width, size.height);
    context.lineCap = "round";
    context.lineJoin = "round";

    this.roads.forEach((road) => {
      if (road.points.length < 2) {
        return;
      }

      this.strokeRoadPath(context, road, size.width, "rgba(255,255,255,0.32)", 7);
      this.strokeRoadPath(context, road, size.width, "rgba(255,255,255,0.95)", 3.4);
    });

    this.roadMaskTexture.update(false);
  }

  private strokeRoadPath(
    context: CanvasRenderingContext2D,
    road: TerrainRoad,
    textureWidth: number,
    strokeStyle: string,
    lineWidth: number
  ): void {
    context.beginPath();
    road.points.forEach((point, index) => {
      const mapped = this.mapWorldToTexture(point.x, point.z, textureWidth);
      if (index === 0) {
        context.moveTo(mapped.x, mapped.y);
        return;
      }
      context.lineTo(mapped.x, mapped.y);
    });
    context.strokeStyle = strokeStyle;
    context.lineWidth = lineWidth;
    context.stroke();
  }

  private mapWorldToTexture(
    x: number,
    z: number,
    textureWidth: number
  ): { x: number; y: number } {
    const normalizedX = (x - this.config.worldMin) / this.config.worldSize;
    const normalizedZ = (z - this.config.worldMin) / this.config.worldSize;
    return {
      x: normalizedX * textureWidth,
      y: (1 - normalizedZ) * textureWidth
    };
  }
}
