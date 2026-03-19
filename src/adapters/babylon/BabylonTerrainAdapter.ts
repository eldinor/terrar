import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { Scene } from "@babylonjs/core/scene";
import { BuiltTerrain, BuiltTerrainPoi, BuiltTerrainRoad } from "../../builder";
import { TerrainPoiSystem } from "./TerrainPoiSystem";
import { TerrainDebugOverlayRuntime } from "./TerrainDebugOverlayRuntime";
import { TerrainSystem, TerrainSystemBuildOptions } from "../../terrain/TerrainSystem";
import {
  TerrainDebugViewMode as BabylonTerrainDebugViewMode,
  TerrainLayerThresholds as BabylonTerrainLayerThresholds,
  TerrainMaterialConfig as BabylonTerrainMaterialConfig
} from "../../terrain/materials";
import { TerrainWaterConfig as BabylonTerrainWaterConfig } from "../../terrain/TerrainWaterSystem";
import {
  BabylonTerrainAdapter,
  BabylonTerrainAdapterOptions,
  BabylonTerrainPoiDebugConfig
} from "./types";

export function renderBuiltTerrain(
  scene: Scene,
  terrain: BuiltTerrain,
  options: BabylonTerrainAdapterOptions = {}
): BabylonTerrainAdapter {
  return new BabylonTerrainSystemAdapter(scene, terrain, options);
}

class BabylonTerrainSystemAdapter implements BabylonTerrainAdapter {
  readonly scene: Scene;
  readonly terrain: BuiltTerrain;
  private readonly terrainSystem: TerrainSystem;

  constructor(
    scene: Scene,
    terrain: BuiltTerrain,
    options: BabylonTerrainAdapterOptions
  ) {
    this.scene = scene;
    this.terrain = terrain;
    this.terrainSystem = new TerrainSystem(
      scene,
      terrain.config,
      options.textureOptions,
      terrain,
      mapBuildOptions(options.buildOptions)
    );
  }

  initialize(): void {
    this.terrainSystem.initialize();
  }

  update(cameraPosition: Vector3): void {
    this.terrainSystem.update(cameraPosition);
  }

  updateDebugOverlay(): void {
    this.terrainSystem.updateDebugOverlay();
  }

  dispose(): void {
    this.terrainSystem.dispose();
  }

  whenChunkMeshesReady(): Promise<void> {
    return this.terrainSystem.whenChunkMeshesReady();
  }

  whenFoliageReady(): Promise<void> {
    return this.terrainSystem.whenFoliageReady();
  }

  toggleDebugOverlay(): Promise<boolean> {
    return this.terrainSystem.toggleDebugOverlay();
  }

  setWireframe(enabled: boolean): void {
    this.terrainSystem.setWireframe(enabled);
  }

  getWireframe(): boolean {
    return this.terrainSystem.getWireframe();
  }

  setWaterLevel(level: number): void {
    this.terrainSystem.setWaterLevel(level);
  }

  getWaterLevel(): number {
    return this.terrainSystem.getWaterLevel();
  }

  setWaterConfig(config: BabylonTerrainWaterConfig): void {
    this.terrainSystem.setWaterConfig(config);
  }

  getWaterConfig() {
    return this.terrainSystem.getWaterConfig();
  }

  setCollisionRadius(radius: number): void {
    this.terrainSystem.setCollisionRadius(radius);
  }

  getCollisionRadius(): number {
    return this.terrainSystem.getCollisionRadius();
  }

  setFoliageRadius(radius: number): void {
    this.terrainSystem.setFoliageRadius(radius);
  }

  getFoliageRadius(): number {
    return this.terrainSystem.getFoliageRadius();
  }

  setShowFoliage(enabled: boolean): void {
    this.terrainSystem.setShowFoliage(enabled);
  }

  getShowFoliage(): boolean {
    return this.terrainSystem.getShowFoliage();
  }

  setShowPoi(enabled: boolean): void {
    this.terrainSystem.setShowPoi(enabled);
  }

  getShowPoi(): boolean {
    return this.terrainSystem.getShowPoi();
  }

  setPoiMarkerMeshesVisible(enabled: boolean): void {
    this.terrainSystem.setPoiMarkerMeshesVisible(enabled);
  }

  getPoiMarkerMeshesVisible(): boolean {
    return this.terrainSystem.getPoiMarkerMeshesVisible();
  }

  setPoiLabelsVisible(enabled: boolean): void {
    this.terrainSystem.setPoiLabelsVisible(enabled);
  }

  getPoiLabelsVisible(): boolean {
    return this.terrainSystem.getPoiLabelsVisible();
  }

  setShowPoiFootprints(enabled: boolean): void {
    this.terrainSystem.setShowPoiFootprints(enabled);
  }

  getShowPoiFootprints(): boolean {
    return this.terrainSystem.getShowPoiFootprints();
  }

  setShowRoads(enabled: boolean): void {
    this.terrainSystem.setShowRoads(enabled);
  }

  getShowRoads(): boolean {
    return this.terrainSystem.getShowRoads();
  }

  setLodDistances(distances: readonly [number, number, number]): void {
    this.terrainSystem.setLodDistances(distances);
  }

  getLodDistances(): readonly [number, number, number] {
    return this.terrainSystem.getLodDistances();
  }

  getConfig() {
    return this.terrainSystem.getConfig();
  }

  getTextureOptions() {
    return this.terrainSystem.getTextureOptions();
  }

  getFoliageStats() {
    return this.terrainSystem.getFoliageStats();
  }

  getPoiSites(): readonly BuiltTerrainPoi[] {
    return this.terrainSystem.getPoiSites();
  }

  getPoiStats() {
    return this.terrainSystem.getPoiStats();
  }

  getPoiMeshStats() {
    return this.terrainSystem.getPoiMeshStats();
  }

  setPoiDebugConfig(config: BabylonTerrainPoiDebugConfig): void {
    this.terrainSystem.setPoiDebugConfig(config);
  }

  getPoiDebugConfig() {
    return this.terrainSystem.getPoiDebugConfig();
  }

  getRoads(): readonly BuiltTerrainRoad[] {
    return this.terrainSystem.getRoads();
  }

  getRoadStats() {
    return this.terrainSystem.getRoadStats();
  }

  setDebugViewMode(mode: BabylonTerrainDebugViewMode): void {
    this.terrainSystem.setDebugViewMode(mode);
  }

  getDebugViewMode() {
    return this.terrainSystem.getDebugViewMode();
  }

  setTerrainMaterialConfig(config: BabylonTerrainMaterialConfig): void {
    this.terrainSystem.setTerrainMaterialConfig(config);
  }

  getTerrainMaterialConfig() {
    return this.terrainSystem.getTerrainMaterialConfig();
  }

  setTerrainMaterialThresholds(thresholds: BabylonTerrainLayerThresholds): void {
    this.terrainSystem.setTerrainMaterialThresholds(thresholds);
  }

  getTerrainMaterialThresholds() {
    return this.terrainSystem.getTerrainMaterialThresholds();
  }

  getChunkBuildProfile() {
    return this.terrainSystem.getChunkBuildProfile();
  }

  getChunkCount(): number {
    return this.terrainSystem.getChunkCount();
  }

  getLoadedChunkMeshCount(): number {
    return this.terrainSystem.getLoadedChunkMeshCount();
  }

  getPendingChunkMeshCount(): number {
    return this.terrainSystem.getPendingChunkMeshCount();
  }

  isApplyingChunkMeshes(): boolean {
    return this.terrainSystem.isApplyingChunkMeshes();
  }
}

function mapBuildOptions(
  buildOptions: BabylonTerrainAdapterOptions["buildOptions"]
): TerrainSystemBuildOptions {
  if (!buildOptions) {
    return {};
  }

  return {
    chunkBuildCoordinator: buildOptions.chunkBuildCoordinator,
    chunkBuildVersion: buildOptions.chunkBuildVersion,
    initialCameraPosition: buildOptions.initialCameraPosition,
    onChunkBuildProgress: buildOptions.onChunkBuildProgress,
    presentation: {
      createPoiPresenter: (scene, planner, prebuiltSites) =>
        new TerrainPoiSystem(scene, planner, prebuiltSites),
      createDebugOverlayController: (scene, chunks, config) =>
        new TerrainDebugOverlayRuntime(scene, chunks, config)
    }
  };
}
