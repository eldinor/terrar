import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import packageJson from "../package.json";
import {
  DEFAULT_BUILT_TERRAIN_CONFIG,
  type BuiltTerrainConfig,
} from "../src/builder/config";
import {
  DEFAULT_TERRAIN_MATERIAL_CONFIG,
  TerrainDebugViewMode,
} from "../src/terrain/materials";
import { DEFAULT_TERRAIN_WATER_CONFIG } from "../src/terrain/TerrainWaterSystem";
import type {
  FeaturePanelState,
} from "../src/demo/demoSnapshots";
import type {
  TerrainDemo,
  TerrainBuildStatus,
  TerrainPerformanceStats,
} from "../src/demo/createTerrainDemo";
import type { RenderSuspendToken } from "../src/adapters/babylon";

class FakeElement {
  id = "";
  href = "";
  download = "";
  readonly style: Record<string, string> = {};
  readonly children: FakeElement[] = [];

  constructor(
    private readonly documentRef: FakeDocument,
    readonly tagName: string,
  ) {}

  appendChild<T extends FakeElement>(child: T): T {
    this.children.push(child);
    this.documentRef.registerTree(child);
    return child;
  }

  replaceChildren(...children: FakeElement[]): void {
    this.children.length = 0;
    children.forEach((child) => {
      this.appendChild(child);
    });
  }

  click(): void {}
}

class FakeDocument {
  readonly body = new FakeElement(this, "body");
  private readonly elementsById = new Map<string, FakeElement>();

  constructor() {
    const app = new FakeElement(this, "div");
    app.id = "app";
    this.registerTree(app);
    this.body.appendChild(app);
  }

  createElement(tagName: string): FakeElement {
    return new FakeElement(this, tagName);
  }

  getElementById(id: string): FakeElement | null {
    return this.elementsById.get(id) ?? null;
  }

  registerTree(element: FakeElement): void {
    if (element.id) {
      this.elementsById.set(element.id, element);
    }
    element.children.forEach((child) => this.registerTree(child));
  }
}

interface DemoStub extends TerrainDemo {
  emitBuildStatus(status: TerrainBuildStatus): void;
}

const defaultPoiDebug = {
  showScores: false,
  showRadii: false,
  showTags: false,
  kinds: {
    village: true,
    outpost: true,
    mine: true,
  },
  mineResources: {
    coal: true,
    iron: true,
    copper: true,
  },
} as const;

const defaultPoiStats = {
  total: 3,
  villages: 1,
  outposts: 1,
  mines: 1,
} as const;

const defaultPoiMeshStats = {
  total: 3,
  enabled: 3,
} as const;

const defaultRoadStats = {
  totalRoads: 2,
  totalPoints: 12,
} as const;

const defaultFoliageStats = {
  totalChunks: 1,
  readyChunks: 1,
  visibleChunks: 1,
  totalInstances: 12,
  visibleInstances: 8,
  totalTrees: 4,
  visibleTrees: 3,
  totalBushes: 4,
  visibleBushes: 3,
  totalRocks: 4,
  visibleRocks: 2,
} as const;

const defaultWorkerStatus = {
  workersEnabled: true,
  sharedSnapshotsEnabled: false,
  crossOriginIsolated: false,
  sharedArrayBufferDefined: false,
  snapshotMode: "copied" as const,
  liveTerrainSystems: 1,
  chunkCount: 64,
  loadedChunkMeshes: 10,
  pendingChunkMeshes: 2,
  applyingChunkMeshes: false,
} as const;

const defaultBuildProfile = {
  lastWorldBuildMs: 12,
  lastTerrainSwapMs: 8,
  lastChunkWorkerBuildMs: 5,
  lastMeshApplyMs: 3,
  lastTotalRebuildMs: 28,
} as const;

const defaultPerformanceStats: TerrainPerformanceStats = {
  fps: 118,
  drawCalls: 142,
  meshes: 318,
  activeMeshes: 96,
  activeVertices: 1384200,
  totalVertices: 2412300,
};

const noopSuspendToken: RenderSuspendToken = {
  dispose(): void {},
};

function createTerrainDemoStub(): DemoStub {
  let config: BuiltTerrainConfig = {
    ...DEFAULT_BUILT_TERRAIN_CONFIG,
    features: { poi: true, roads: true },
    buildFoliage: true,
  };
  let waterLevel = config.waterLevel;
  let waterConfig = { ...DEFAULT_TERRAIN_WATER_CONFIG };
  let collisionRadius = config.collisionRadius;
  let foliageRadius = config.foliageRadius;
  let showFoliage = true;
  let showPoi = true;
  let poiMarkerMeshesVisible = true;
  let poiLabelsVisible = true;
  let showPoiFootprints = false;
  let showRoads = true;
  let lodDistances: readonly [number, number, number] = [...config.lodDistances] as [number, number, number];
  let debugViewMode = TerrainDebugViewMode.off;
  let terrainMaterialConfig = {
    ...DEFAULT_TERRAIN_MATERIAL_CONFIG,
    thresholds: { ...DEFAULT_TERRAIN_MATERIAL_CONFIG.thresholds },
    scales: { ...DEFAULT_TERRAIN_MATERIAL_CONFIG.scales },
  };
  let useGeneratedTextures = false;
  let poiDebugConfig = {
    ...defaultPoiDebug,
    kinds: { ...defaultPoiDebug.kinds },
    mineResources: { ...defaultPoiDebug.mineResources },
  };
  let buildStatus: TerrainBuildStatus = {
    phase: "idle",
    message: "",
    completed: 0,
    total: 0,
  };
  const listeners = new Set<(status: TerrainBuildStatus) => void>();

  return {
    engine: {} as TerrainDemo["engine"],
    scene: {} as TerrainDemo["scene"],
    camera: {} as TerrainDemo["camera"],
    getTerrainAsset: vi.fn(() => ({
      config,
      packedSnapshot: {
        width: 1,
        height: 1,
        fields: {},
      },
      poiSites: [],
      roads: [],
    } as unknown as ReturnType<TerrainDemo["getTerrainAsset"]>)),
    importTerrainAsset: vi.fn(async () => {}),
    beginRendering: vi.fn(),
    stopRendering: vi.fn(),
    suspendRendering: vi.fn(() => noopSuspendToken),
    markSceneMutated: vi.fn(),
    setWireframe: vi.fn(),
    toggleDebugOverlay: vi.fn(async () => true),
    setWaterLevel: vi.fn((level: number) => {
      waterLevel = level;
    }),
    getWaterLevel: () => waterLevel,
    setWaterConfig: vi.fn((nextConfig) => {
      waterConfig = { ...nextConfig };
    }),
    getWaterConfig: () => ({ ...waterConfig }),
    setCollisionRadius: vi.fn((radius: number) => {
      collisionRadius = radius;
    }),
    getCollisionRadius: () => collisionRadius,
    setFoliageRadius: vi.fn((radius: number) => {
      foliageRadius = radius;
    }),
    getFoliageRadius: () => foliageRadius,
    setShowFoliage: vi.fn((enabled: boolean) => {
      showFoliage = enabled;
    }),
    getShowFoliage: () => showFoliage,
    setShowPoi: vi.fn((enabled: boolean) => {
      showPoi = enabled;
    }),
    getShowPoi: () => showPoi,
    setPoiMarkerMeshesVisible: vi.fn((enabled: boolean) => {
      poiMarkerMeshesVisible = enabled;
    }),
    getPoiMarkerMeshesVisible: () => poiMarkerMeshesVisible,
    setPoiLabelsVisible: vi.fn((enabled: boolean) => {
      poiLabelsVisible = enabled;
    }),
    getPoiLabelsVisible: () => poiLabelsVisible,
    setShowPoiFootprints: vi.fn((enabled: boolean) => {
      showPoiFootprints = enabled;
    }),
    getShowPoiFootprints: () => showPoiFootprints,
    setShowRoads: vi.fn((enabled: boolean) => {
      showRoads = enabled;
    }),
    getShowRoads: () => showRoads,
    setLodDistances: vi.fn((distances: readonly [number, number, number]) => {
      lodDistances = [...distances] as [number, number, number];
    }),
    getLodDistances: () => lodDistances,
    setDebugViewMode: vi.fn((mode) => {
      debugViewMode = mode;
    }),
    getDebugViewMode: () => debugViewMode,
    setTerrainMaterialConfig: vi.fn((nextConfig) => {
      terrainMaterialConfig = {
        ...nextConfig,
        thresholds: { ...nextConfig.thresholds },
        scales: { ...nextConfig.scales },
      };
    }),
    getTerrainMaterialConfig: () => ({
      ...terrainMaterialConfig,
      thresholds: { ...terrainMaterialConfig.thresholds },
      scales: { ...terrainMaterialConfig.scales },
    }),
    setTerrainMaterialThresholds: vi.fn((thresholds) => {
      terrainMaterialConfig = {
        ...terrainMaterialConfig,
        thresholds: { ...thresholds },
      };
    }),
    getTerrainMaterialThresholds: () => ({ ...terrainMaterialConfig.thresholds }),
    setUseGeneratedTextures: vi.fn(async (enabled: boolean) => {
      useGeneratedTextures = enabled;
    }),
    getUseGeneratedTextures: () => useGeneratedTextures,
    rebuildTerrain: vi.fn(async () => {}),
    getTerrainConfig: () => config,
    getFoliageStats: () => ({ ...defaultFoliageStats }),
    getPoiSites: () => [],
    getPoiStats: () => ({ ...defaultPoiStats }),
    getPoiMeshStats: () => ({ ...defaultPoiMeshStats }),
    setPoiDebugConfig: vi.fn((nextConfig) => {
      poiDebugConfig = {
        ...nextConfig,
        kinds: { ...nextConfig.kinds },
        mineResources: { ...nextConfig.mineResources },
      };
    }),
    getPoiDebugConfig: () => ({
      ...poiDebugConfig,
      kinds: { ...poiDebugConfig.kinds },
      mineResources: { ...poiDebugConfig.mineResources },
    }),
    getRoads: () => [],
    getRoadStats: () => ({ ...defaultRoadStats }),
    getBuildStatus: () => buildStatus,
    subscribeBuildStatus: (listener) => {
      listeners.add(listener);
      listener(buildStatus);
      return () => {
        listeners.delete(listener);
      };
    },
    getPerformanceStats: () => ({ ...defaultPerformanceStats }),
    getWorkerStatus: () => ({ ...defaultWorkerStatus }),
    getBuildProfile: () => ({ ...defaultBuildProfile }),
    emitBuildStatus: (status: TerrainBuildStatus) => {
      buildStatus = status;
      listeners.forEach((listener) => listener(status));
    },
  };
}

function installDom(): { document: FakeDocument } {
  const document = new FakeDocument();
  const windowStub = {
    addEventListener: vi.fn(),
    setInterval: vi.fn(() => 1),
    setTimeout: vi.fn(() => 1),
    clearInterval: vi.fn(),
    clearTimeout: vi.fn(),
    localStorage: {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    },
    URL: {
      createObjectURL: vi.fn(() => "blob:test"),
      revokeObjectURL: vi.fn(),
    },
  };

  vi.stubGlobal("document", document);
  vi.stubGlobal("window", windowStub);
  return { document };
}

async function importBridgeModule(): Promise<typeof import("../src/demo/demoBridge")> {
  vi.resetModules();
  return import("../src/demo/demoBridge");
}

describe("demo bridge", () => {
  beforeEach(() => {
    installDom();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("publishes snapshots and updates the active tab", async () => {
    const bridgeModule = await importBridgeModule();
    const demo = createTerrainDemoStub();
    const headerActions = document.createElement("div") as unknown as HTMLDivElement;
    const headerTrailingActions = document.createElement("div") as unknown as HTMLDivElement;
    const footer = document.createElement("div") as unknown as HTMLDivElement;
    const panel = document.createElement("div") as unknown as HTMLDivElement;
    const featurePanel = document.createElement("div") as unknown as HTMLDivElement;

    bridgeModule.initializeDemoBridge({ demo, headerActions, headerTrailingActions, footer, panel, featurePanel });

    let notifications = 0;
    const unsubscribe = bridgeModule.subscribe(() => {
      notifications += 1;
    });

    const initial = bridgeModule.getSnapshot();
    expect(initial.activePanelTab).toBe("runtime");
    expect(initial.leftPanelMount?.id).toBe("react-left-panel");
    expect(initial.featurePanelMount?.id).toBe("react-feature-panel");
    expect(initial.footerPerformanceMount?.id).toBe("react-footer-performance");
    expect(initial.performanceText).toContain("FPS 118");
    expect(initial.performanceText).toContain("A-Vert 1.4M");

    bridgeModule.setActivePanelTab("material");

    const updated = bridgeModule.getSnapshot();
    expect(updated.activePanelTab).toBe("material");
    expect(notifications).toBeGreaterThan(0);

    unsubscribe();
  });

  it("updates feature state through the bridge without leaking Babylon state into React", async () => {
    const bridgeModule = await importBridgeModule();
    const demo = createTerrainDemoStub();
    const headerActions = document.createElement("div") as unknown as HTMLDivElement;
    const headerTrailingActions = document.createElement("div") as unknown as HTMLDivElement;
    const footer = document.createElement("div") as unknown as HTMLDivElement;
    const panel = document.createElement("div") as unknown as HTMLDivElement;
    const featurePanel = document.createElement("div") as unknown as HTMLDivElement;

    bridgeModule.initializeDemoBridge({ demo, headerActions, headerTrailingActions, footer, panel, featurePanel });

    const nextState: FeaturePanelState = {
      ...bridgeModule.getFeaturePanelState(),
      features: {
        poi: false,
        roads: true,
      },
      hidePoiMarkerMeshes: true,
      hidePoiLabels: true,
      showPoiFootprints: true,
      poiDebug: {
        ...bridgeModule.getFeaturePanelState().poiDebug,
        showScores: true,
      },
    };

    bridgeModule.setFeaturePanelState(nextState);

    const snapshot = bridgeModule.getSnapshot();
    expect(snapshot.featurePanelState?.features.poi).toBe(false);
    expect(snapshot.featurePanelState?.features.roads).toBe(false);
    expect(demo.setPoiMarkerMeshesVisible).toHaveBeenCalledWith(false);
    expect(demo.setPoiLabelsVisible).toHaveBeenCalledWith(false);
    expect(demo.setShowPoiFootprints).toHaveBeenCalledWith(true);
    expect(demo.setPoiDebugConfig).toHaveBeenCalled();
  });

  it("reflects build status changes in the bridge snapshot", async () => {
    const bridgeModule = await importBridgeModule();
    const demo = createTerrainDemoStub();
    const headerActions = document.createElement("div") as unknown as HTMLDivElement;
    const headerTrailingActions = document.createElement("div") as unknown as HTMLDivElement;
    const footer = document.createElement("div") as unknown as HTMLDivElement;
    const panel = document.createElement("div") as unknown as HTMLDivElement;
    const featurePanel = document.createElement("div") as unknown as HTMLDivElement;

    bridgeModule.initializeDemoBridge({ demo, headerActions, headerTrailingActions, footer, panel, featurePanel });

    demo.emitBuildStatus({
      phase: "chunks",
      message: "Building chunks 3/8",
      completed: 3,
      total: 8,
    });

    const snapshot = bridgeModule.getSnapshot();
    expect(snapshot.hudText).toContain("build: Building chunks 3/8");
    expect(snapshot.featureStatusText).toContain("Building chunks 3/8");
  });

  it("returns the same snapshot reference until the bridge publishes a new one", async () => {
    const bridgeModule = await importBridgeModule();
    const demo = createTerrainDemoStub();
    const headerActions = document.createElement("div") as unknown as HTMLDivElement;
    const headerTrailingActions = document.createElement("div") as unknown as HTMLDivElement;
    const footer = document.createElement("div") as unknown as HTMLDivElement;
    const panel = document.createElement("div") as unknown as HTMLDivElement;
    const featurePanel = document.createElement("div") as unknown as HTMLDivElement;

    bridgeModule.initializeDemoBridge({ demo, headerActions, headerTrailingActions, footer, panel, featurePanel });

    const firstSnapshot = bridgeModule.getSnapshot();
    const secondSnapshot = bridgeModule.getSnapshot();

    expect(secondSnapshot).toBe(firstSnapshot);

    bridgeModule.setActivePanelTab("material");

    const thirdSnapshot = bridgeModule.getSnapshot();
    expect(thirdSnapshot).not.toBe(firstSnapshot);
    expect(thirdSnapshot.activePanelTab).toBe("material");
  });

  it("shows a transient HUD message after browser terrain export", async () => {
    vi.doMock("../src/builder", async () => {
      const actual = await vi.importActual<typeof import("../src/builder")>("../src/builder");
      return {
        ...actual,
        createTerrainExportBundle: vi.fn(() => ({
          manifest: {},
          terrainAsset: {},
          terrainAssetJson: "{}",
          maps: {},
          poiData: {},
          poiDataJson: "{}",
          roadData: {},
          roadDataJson: "{}",
        })),
        encodeTerrainExportFiles: vi.fn(() => ({
          manifestJson: "{}",
          terrainAssetJson: "{}",
          poiDataJson: "{}",
          roadDataJson: "{}",
          mapFiles: {},
          portableGraymapFiles: {},
        })),
        createTerrainExportZipBytes: vi.fn(() => new Uint8Array([1, 2, 3])),
      };
    });

    const bridgeModule = await importBridgeModule();
    const demo = createTerrainDemoStub();
    const headerActions = document.createElement("div") as unknown as HTMLDivElement;
    const headerTrailingActions = document.createElement("div") as unknown as HTMLDivElement;
    const footer = document.createElement("div") as unknown as HTMLDivElement;
    const panel = document.createElement("div") as unknown as HTMLDivElement;
    const featurePanel = document.createElement("div") as unknown as HTMLDivElement;

    bridgeModule.initializeDemoBridge({ demo, headerActions, headerTrailingActions, footer, panel, featurePanel });
    bridgeModule.exportTerrainBundle();

    expect(window.URL.createObjectURL).toHaveBeenCalled();
    expect(bridgeModule.getSnapshot().hudText).toContain("terrain zip downloaded");
  });

  it("imports a serialized terrain asset from text", async () => {
    const importedTerrain = {
      config: { ...DEFAULT_BUILT_TERRAIN_CONFIG },
      packedSnapshot: {
        analysisResolution: 1,
        analysisStep: 1,
        shared: false,
        buffer: new ArrayBuffer(0),
        fields: {
          terrainHeightField: { byteOffset: 0, length: 0 },
          flowField: { byteOffset: 0, length: 0 },
          riverField: { byteOffset: 0, length: 0 },
          lakeField: { byteOffset: 0, length: 0 },
          lakeSurfaceField: { byteOffset: 0, length: 0 },
          sedimentField: { byteOffset: 0, length: 0 },
          coalField: { byteOffset: 0, length: 0 },
          ironField: { byteOffset: 0, length: 0 },
          copperField: { byteOffset: 0, length: 0 },
        },
      },
      poiSites: [],
      roads: [],
    };

    vi.doMock("../src/builder", async () => {
      const actual = await vi.importActual<typeof import("../src/builder")>("../src/builder");
      return {
        ...actual,
        deserializeTerrainAsset: vi.fn(() => importedTerrain),
      };
    });

    const bridgeModule = await importBridgeModule();
    const demo = createTerrainDemoStub();
    const headerActions = document.createElement("div") as unknown as HTMLDivElement;
    const headerTrailingActions = document.createElement("div") as unknown as HTMLDivElement;
    const footer = document.createElement("div") as unknown as HTMLDivElement;
    const panel = document.createElement("div") as unknown as HTMLDivElement;
    const featurePanel = document.createElement("div") as unknown as HTMLDivElement;

    bridgeModule.initializeDemoBridge({ demo, headerActions, headerTrailingActions, footer, panel, featurePanel });
    await bridgeModule.importTerrainAssetText('{"version":1}');

    expect(demo.importTerrainAsset).toHaveBeenCalledWith(importedTerrain);
    expect(bridgeModule.getSnapshot().hudText).toContain("terrain asset imported");
  });
});

describe("package entrypoints", () => {
  it("exposes the intended builder, babylon, and demo subpaths", async () => {
    const builder = await import("../src/builder");
    const babylon = await import("../src/babylon");
    const demo = await import("../src/demo-api");

    expect(builder).toHaveProperty("buildTerrain");
    expect(builder).toHaveProperty("resolveBuiltTerrainConfig");
    expect(babylon).toHaveProperty("renderBuiltTerrain");
    expect(babylon).toHaveProperty("renderTerrainAsset");
    expect(babylon).toHaveProperty("BabylonTerrainDebugViewMode");
    expect(demo).toHaveProperty("createTerrainDemo");
    expect(packageJson.exports).toMatchObject({
      ".": {
        import: "./dist/main.js",
      },
      "./builder": {
        import: "./dist/builder.js",
      },
      "./babylon": {
        import: "./dist/babylon.js",
      },
      "./demo": {
        import: "./dist/demo-api.js",
      },
    });
  });
});
