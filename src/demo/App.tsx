import { BabylonTerrainDebugViewMode as TerrainDebugViewMode } from "../adapters/babylon";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import type {
  FeaturePanelState,
  MaterialTabState,
  PanelTab,
  RuntimeTabState,
  WorldTabState,
} from "./demoSnapshots";
import { useDemoBridge } from "./useDemoBridge";
import "./app.css";

interface TerrainPresetOption {
  readonly name: string;
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function App() {
  const { bridge, snapshot } = useDemoBridge();
  const [selectedPresetIndex, setSelectedPresetIndex] = useState(0);
  const [presetName, setPresetName] = useState("");
  const [importText, setImportText] = useState("");
  const terrainImportInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSelectedPresetIndex((currentIndex) => {
      if (snapshot.presetOptions.length === 0) {
        return 0;
      }
      return Math.min(currentIndex, snapshot.presetOptions.length - 1);
    });
  }, [snapshot.presetOptions]);

  const selectedPresetName = useMemo(
    () => snapshot.presetOptions[selectedPresetIndex]?.name ?? "",
    [snapshot.presetOptions, selectedPresetIndex],
  );

  const handleApplyPreset = async (): Promise<void> => {
    if (!bridge) {
      return;
    }

    await bridge.applyPresetByIndex(selectedPresetIndex);
  };

  const handleSavePreset = (): void => {
    if (!bridge) {
      return;
    }

    const nextName = presetName.trim();
    if (!nextName) {
      return;
    }

    bridge.saveCurrentPreset(nextName);
    setPresetName("");
  };

  const handleExportPreset = (): void => {
    bridge?.exportPresetByIndex(selectedPresetIndex);
  };

  const handleExportTerrain = (): void => {
    bridge?.exportTerrainBundle();
  };

  const handleImportTerrainClick = (): void => {
    terrainImportInputRef.current?.click();
  };

  const handleImportTerrainFile = async (
    event: ChangeEvent<HTMLInputElement>
  ): Promise<void> => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!bridge || !file) {
      return;
    }

    try {
      const serialized = await file.text();
      await bridge.importTerrainAssetText(serialized);
    } catch {
      // The demo bridge already publishes an import failure message.
    }
  };

  const handleImportPresets = (): void => {
    if (!bridge) {
      return;
    }

    const serialized = importText.trim();
    if (!serialized) {
      return;
    }

    bridge.importPresetText(serialized);
    setImportText("");
  };

  const handleRebuildTerrain = async (): Promise<void> => {
    if (!bridge) {
      return;
    }

    await bridge.rebuildTerrainFromDraft();
  };

  const handleResetDraft = (): void => {
    if (!bridge) {
      return;
    }

    bridge.resetDraftTerrainConfig();
  };

  const handleFeaturePanelChange = (nextState: FeaturePanelState): void => {
    bridge?.setFeaturePanelState(nextState);
  };

  const handleRuntimeTabChange = (nextState: RuntimeTabState): void => {
    bridge?.setRuntimeTabState(nextState);
  };

  const handleMaterialTabChange = (nextState: MaterialTabState): void => {
    bridge?.setMaterialTabState(nextState);
  };

  const handleWorldTabChange = (nextState: WorldTabState): void => {
    bridge?.setWorldTabState(nextState);
  };

  const handlePanelTabChange = (tab: PanelTab): void => {
    bridge?.setActivePanelTab(tab);
  };

  const handleRetuneWorld = (): void => {
    if (!bridge) {
      return;
    }

    bridge.retuneWorldTabForWorldSize();
  };

  return (
    <>
      <div id="app" />
      <input
        accept=".json,application/json"
        onChange={(event) => {
          void handleImportTerrainFile(event);
        }}
        ref={terrainImportInputRef}
        style={{ display: "none" }}
        type="file"
      />
      {snapshot.headerActionsMount
        ? createPortal(
            <button
              className="editor-button editor-button-header"
              onClick={() => void handleRebuildTerrain()}
              type="button"
            >
              Rebuild Terrain
            </button>,
            snapshot.headerActionsMount,
          )
        : null}
      {snapshot.headerTrailingActionsMount
        ? createPortal(
            <>
              <button
                className="editor-button editor-button-header"
                onClick={handleExportTerrain}
                type="button"
              >
                Export Terrain
              </button>
              <button
                className="editor-button editor-button-header"
                onClick={handleImportTerrainClick}
                type="button"
              >
                Import Terrain
              </button>
            </>,
            snapshot.headerTrailingActionsMount,
          )
        : null}
      {snapshot.footerMount
        ? createPortal(
            <FooterStatus text={snapshot.hudText} />,
            snapshot.footerMount,
          )
        : null}
      {snapshot.footerPerformanceMount
        ? createPortal(
            <FooterPerformance text={snapshot.performanceText} />,
            snapshot.footerPerformanceMount,
          )
        : null}
      {snapshot.featurePanelMount && snapshot.featurePanelState
        ? createPortal(
            <FeaturePanel
              onApplyFeatures={handleRebuildTerrain}
              onChange={handleFeaturePanelChange}
              state={snapshot.featurePanelState}
              statusText={snapshot.featureStatusText}
            />,
            snapshot.featurePanelMount,
          )
        : null}
      {snapshot.leftPanelMount
        ? createPortal(
            <LeftPanel
              activeTab={snapshot.activePanelTab}
              materialTabState={snapshot.materialTabState}
              onApply={handleApplyPreset}
              onExport={handleExportPreset}
              onExportTerrain={handleExportTerrain}
              onImport={handleImportPresets}
              onImportTextChange={setImportText}
              onMaterialTabChange={handleMaterialTabChange}
              onPanelTabChange={handlePanelTabChange}
              onPresetNameChange={setPresetName}
              onRebuildTerrain={handleRebuildTerrain}
              onResetDraft={handleResetDraft}
              onRetuneWorld={handleRetuneWorld}
              onRuntimeTabChange={handleRuntimeTabChange}
              onSave={handleSavePreset}
              onSelectPreset={setSelectedPresetIndex}
              onWorldTabChange={handleWorldTabChange}
              presetName={presetName}
              presetOptions={snapshot.presetOptions}
              presetsImportText={importText}
              runtimeTabState={snapshot.runtimeTabState}
              selectedPresetIndex={selectedPresetIndex}
              selectedPresetName={selectedPresetName}
              worldTabState={snapshot.worldTabState}
            />,
            snapshot.leftPanelMount,
          )
        : null}
    </>
  );
}

function FooterStatus({ text }: { readonly text: string }) {
  return <div className="editor-footer-status">{text}</div>;
}

function FooterPerformance({ text }: { readonly text: string }) {
  return <div className="editor-footer-performance">{text}</div>;
}

function LeftPanel({
  activeTab,
  materialTabState,
  onApply,
  onExport,
  onExportTerrain,
  onImport,
  onImportTextChange,
  onMaterialTabChange,
  onPanelTabChange,
  onPresetNameChange,
  onRebuildTerrain,
  onResetDraft,
  onRetuneWorld,
  onRuntimeTabChange,
  onSave,
  onSelectPreset,
  onWorldTabChange,
  presetName,
  presetOptions,
  presetsImportText,
  runtimeTabState,
  selectedPresetIndex,
  selectedPresetName,
  worldTabState
}: {
  readonly activeTab: PanelTab;
  readonly materialTabState: MaterialTabState | null;
  readonly onApply: () => void | Promise<void>;
  readonly onExport: () => void;
  readonly onExportTerrain: () => void;
  readonly onImport: () => void;
  readonly onImportTextChange: (value: string) => void;
  readonly onMaterialTabChange: (state: MaterialTabState) => void;
  readonly onPanelTabChange: (tab: PanelTab) => void;
  readonly onPresetNameChange: (value: string) => void;
  readonly onRebuildTerrain: () => void | Promise<void>;
  readonly onResetDraft: () => void;
  readonly onRetuneWorld: () => void;
  readonly onRuntimeTabChange: (state: RuntimeTabState) => void;
  readonly onSave: () => void;
  readonly onSelectPreset: (index: number) => void;
  readonly onWorldTabChange: (state: WorldTabState) => void;
  readonly presetName: string;
  readonly presetOptions: readonly TerrainPresetOption[];
  readonly presetsImportText: string;
  readonly runtimeTabState: RuntimeTabState | null;
  readonly selectedPresetIndex: number;
  readonly selectedPresetName: string;
  readonly worldTabState: WorldTabState | null;
}) {
  return (
    <div className="editor-panel-content">
      <div className="editor-heading">Terrain Tuning</div>
      <div className="editor-tab-bar">
        {panelTabs.map(([tab, label]) => (
          <button
            className={cx("editor-tab", activeTab === tab && "is-active")}
            key={tab}
            onClick={() => onPanelTabChange(tab)}
            type="button"
          >
            {label}
          </button>
        ))}
      </div>
      {activeTab === "runtime" && runtimeTabState ? (
        <RuntimeTab onChange={onRuntimeTabChange} state={runtimeTabState} />
      ) : null}
      {activeTab === "material" && materialTabState ? (
        <MaterialTab onChange={onMaterialTabChange} state={materialTabState} />
      ) : null}
      {activeTab === "world" && worldTabState ? (
        <WorldTab
          onChange={onWorldTabChange}
          onRebuildTerrain={onRebuildTerrain}
          onResetDraft={onResetDraft}
          onRetune={onRetuneWorld}
          state={worldTabState}
        />
      ) : null}
      {activeTab === "presets" ? (
        <PresetsTab
          importText={presetsImportText}
          onApply={onApply}
          onExport={onExport}
          onExportTerrain={onExportTerrain}
          onImport={onImport}
          onImportTextChange={onImportTextChange}
          onPresetNameChange={onPresetNameChange}
          onRebuildTerrain={onRebuildTerrain}
          onResetDraft={onResetDraft}
          onSave={onSave}
          onSelectPreset={onSelectPreset}
          presetName={presetName}
          presetOptions={presetOptions}
          selectedPresetIndex={selectedPresetIndex}
          selectedPresetName={selectedPresetName}
        />
      ) : null}
    </div>
  );
}

interface FeaturePanelProps {
  readonly onApplyFeatures: () => void | Promise<void>;
  readonly onChange: (state: FeaturePanelState) => void;
  readonly state: FeaturePanelState;
  readonly statusText: string;
}

function FeaturePanel({ onApplyFeatures, onChange, state, statusText }: FeaturePanelProps) {
  const update = (updater: (current: FeaturePanelState) => FeaturePanelState) => {
    onChange(updater(state));
  };

  return (
    <div className="editor-panel-content">
      <div className="editor-heading">World Features</div>
      <div className="editor-section-label">Build</div>
      <label className="editor-checkbox-row">
        <input
          className="editor-checkbox-input"
          checked={state.features.poi}
          onChange={(event) =>
            update((current) => ({
              ...current,
              features: {
                poi: event.target.checked,
                roads: event.target.checked ? current.features.roads : false
              }
            }))
          }
          type="checkbox"
        />
        <span className="editor-checkbox-box" />
        <span>POI</span>
      </label>
      <label className="editor-checkbox-row">
        <input
          className="editor-checkbox-input"
          checked={state.features.roads}
          disabled={!state.features.poi}
          onChange={(event) =>
            update((current) => ({
              ...current,
              features: {
                ...current.features,
                roads: event.target.checked && current.features.poi
              }
            }))
          }
          type="checkbox"
        />
        <span className="editor-checkbox-box" />
        <span>Build Roads</span>
      </label>
      <FeatureBuildStatus text={statusText} />
      <button
        className="editor-button"
        onClick={() => void onApplyFeatures()}
        style={topMarginStyle}
        type="button"
      >
        Apply Features
      </button>

      {state.features.poi ? (
        <>
          <div className="editor-divider" />
          <div className="editor-section-label">POI Debug</div>
          <label className="editor-checkbox-row">
            <input
              className="editor-checkbox-input"
              checked={state.hidePoiMarkerMeshes}
              onChange={(event) =>
                update((current) => ({ ...current, hidePoiMarkerMeshes: event.target.checked }))
              }
              type="checkbox"
            />
            <span className="editor-checkbox-box" />
            <span>Hide Marker Meshes</span>
          </label>
          <label className="editor-checkbox-row">
            <input
              className="editor-checkbox-input"
              checked={state.hidePoiLabels}
              onChange={(event) => update((current) => ({ ...current, hidePoiLabels: event.target.checked }))}
              type="checkbox"
            />
            <span className="editor-checkbox-box" />
            <span>Hide POI Labels</span>
          </label>
          <label className="editor-checkbox-row">
            <input
              className="editor-checkbox-input"
              checked={state.showPoiFootprints}
              onChange={(event) =>
                update((current) => ({ ...current, showPoiFootprints: event.target.checked }))
              }
              type="checkbox"
            />
            <span className="editor-checkbox-box" />
            <span>Show Footprints</span>
          </label>
          <div className="editor-card">
            <div className="editor-label-muted" style={bottomSpacingStyle}>POI Debug</div>
            <DebugToggle
              checked={state.poiDebug.showScores}
              label="Show Scores"
              onChange={(checked) =>
                update((current) => ({
                  ...current,
                  poiDebug: { ...current.poiDebug, showScores: checked }
                }))
              }
            />
            <DebugToggle
              checked={state.poiDebug.showRadii}
              label="Show Radii"
              onChange={(checked) =>
                update((current) => ({
                  ...current,
                  poiDebug: { ...current.poiDebug, showRadii: checked }
                }))
              }
            />
            <DebugToggle
              checked={state.poiDebug.showTags}
              label="Show Tags"
              onChange={(checked) =>
                update((current) => ({
                  ...current,
                  poiDebug: { ...current.poiDebug, showTags: checked }
                }))
              }
            />
            <DebugToggle
              checked={state.poiDebug.kinds.village}
              label="Villages"
              onChange={(checked) =>
                update((current) => ({
                  ...current,
                  poiDebug: {
                    ...current.poiDebug,
                    kinds: { ...current.poiDebug.kinds, village: checked }
                  }
                }))
              }
            />
            <DebugToggle
              checked={state.poiDebug.kinds.outpost}
              label="Outposts"
              onChange={(checked) =>
                update((current) => ({
                  ...current,
                  poiDebug: {
                    ...current.poiDebug,
                    kinds: { ...current.poiDebug.kinds, outpost: checked }
                  }
                }))
              }
            />
            <DebugToggle
              checked={state.poiDebug.kinds.mine}
              label="Mines"
              onChange={(checked) =>
                update((current) => ({
                  ...current,
                  poiDebug: {
                    ...current.poiDebug,
                    kinds: { ...current.poiDebug.kinds, mine: checked }
                  }
                }))
              }
            />
            <div className="editor-divider" />
            <DebugToggle
              checked={state.poiDebug.mineResources.coal}
              label="Coal Mines"
              onChange={(checked) =>
                update((current) => ({
                  ...current,
                  poiDebug: {
                    ...current.poiDebug,
                    mineResources: { ...current.poiDebug.mineResources, coal: checked }
                  }
                }))
              }
            />
            <DebugToggle
              checked={state.poiDebug.mineResources.iron}
              label="Iron Mines"
              onChange={(checked) =>
                update((current) => ({
                  ...current,
                  poiDebug: {
                    ...current.poiDebug,
                    mineResources: { ...current.poiDebug.mineResources, iron: checked }
                  }
                }))
              }
            />
            <DebugToggle
              checked={state.poiDebug.mineResources.copper}
              label="Copper Mines"
              onChange={(checked) =>
                update((current) => ({
                  ...current,
                  poiDebug: {
                    ...current.poiDebug,
                    mineResources: { ...current.poiDebug.mineResources, copper: checked }
                  }
                }))
              }
            />
          </div>
          <div className="editor-status editor-code">
            {`POI ${state.poiStats.total}: V ${state.poiStats.villages} | O ${state.poiStats.outposts} | M ${state.poiStats.mines}\nMeshes ${state.poiMeshStats.enabled}/${state.poiMeshStats.total}`}
          </div>
        </>
      ) : null}
    </div>
  );
}

function DebugToggle({
  checked,
  label,
  onChange
}: {
  readonly checked: boolean;
  readonly label: string;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <label className="editor-toggle-row">
      <input
        checked={checked}
        className="editor-toggle-input"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span className="editor-toggle-track" />
      <span>{label}</span>
    </label>
  );
}

function FeatureBuildStatus({ text }: { readonly text: string }) {
  return <div className="editor-status" style={topMarginStyle}>{text}</div>;
}

function RuntimeTab({
  onChange,
  state
}: {
  readonly onChange: (state: RuntimeTabState) => void;
  readonly state: RuntimeTabState;
}) {
  const update = (updater: (current: RuntimeTabState) => RuntimeTabState) => {
    onChange(updater(state));
  };

  return (
    <div style={tabContentStyle}>
      <div className="editor-section-label">Runtime</div>
      <SliderField label="Water" max={32} min={-24} onChange={(value) => update((current) => ({ ...current, waterLevel: value }))} step={1} value={state.waterLevel} />
      <SliderField label="Water Opacity" max={1} min={0.1} onChange={(value) => update((current) => ({ ...current, water: { ...current.water, opacity: value } }))} step={0.01} value={state.water.opacity} />
      <SliderField label="Shore Fade" max={32} min={1} onChange={(value) => update((current) => ({ ...current, water: { ...current.water, shoreFadeDistance: value } }))} step={0.5} value={state.water.shoreFadeDistance} />
      <SliderField label="Wave Scale X" max={0.05} min={0.002} onChange={(value) => update((current) => ({ ...current, water: { ...current.water, waveScaleX: value } }))} step={0.001} value={state.water.waveScaleX} />
      <SliderField label="Wave Scale Z" max={0.05} min={0.002} onChange={(value) => update((current) => ({ ...current, water: { ...current.water, waveScaleZ: value } }))} step={0.001} value={state.water.waveScaleZ} />
      <SliderField label="Wave Speed X" max={0.12} min={-0.12} onChange={(value) => update((current) => ({ ...current, water: { ...current.water, waveSpeedX: value } }))} step={0.005} value={state.water.waveSpeedX} />
      <SliderField label="Wave Speed Z" max={0.12} min={-0.12} onChange={(value) => update((current) => ({ ...current, water: { ...current.water, waveSpeedZ: value } }))} step={0.005} value={state.water.waveSpeedZ} />
      <SliderField label="River Discharge" max={1.8} min={0.4} onChange={(value) => update((current) => ({ ...current, water: { ...current.water, riverDischargeStrength: value } }))} step={0.05} value={state.water.riverDischargeStrength} />
      <SliderField label="River Mesh Cutoff" max={0.6} min={0.05} onChange={(value) => update((current) => ({ ...current, water: { ...current.water, riverMeshThreshold: value } }))} step={0.01} value={state.water.riverMeshThreshold} />
      <SliderField label="River Mesh Min Width" max={12} min={0} onChange={(value) => update((current) => ({ ...current, water: { ...current.water, riverMeshMinWidth: value } }))} step={0.5} value={state.water.riverMeshMinWidth} />
      <SliderField label="Lake Mesh Cutoff" max={0.3} min={0.02} onChange={(value) => update((current) => ({ ...current, water: { ...current.water, lakeMeshThreshold: value } }))} step={0.01} value={state.water.lakeMeshThreshold} />
      <SliderField label="Inland Res" max={513} min={33} onChange={(value) => update((current) => ({ ...current, water: { ...current.water, inlandMeshResolution: value } }))} step={32} value={state.water.inlandMeshResolution} />
      <SliderField label="Inland Smooth" max={6} min={0} onChange={(value) => update((current) => ({ ...current, water: { ...current.water, inlandSmoothingPasses: value } }))} step={1} value={state.water.inlandSmoothingPasses} />
      <SelectField
        label="Water Debug"
        onChange={(value) => update((current) => ({ ...current, water: { ...current.water, debugView: Number(value) } }))}
        options={[
          ["Final", "0"],
          ["Terrain Mask", "1"],
          ["Water Depth", "2"],
          ["Shore Fade", "3"]
        ]}
        value={String(state.water.debugView)}
      />
      <ColorField label="Shallow Color" onChange={(value) => update((current) => ({ ...current, water: { ...current.water, shallowColor: value } }))} value={state.water.shallowColor} />
      <ColorField label="Deep Color" onChange={(value) => update((current) => ({ ...current, water: { ...current.water, deepColor: value } }))} value={state.water.deepColor} />
      <div className="editor-divider" />
      <div className="editor-section-label">Camera Radius</div>
      <CheckboxField
        checked={state.buildFoliage}
        label="Build Foliage"
        onChange={(checked) =>
          update((current) => ({
            ...current,
            buildFoliage: checked,
            showFoliage: checked ? current.showFoliage : false
          }))
        }
      />
      <CheckboxField
        checked={state.showFoliage}
        label="Show Foliage"
        onChange={(checked) => update((current) => ({ ...current, showFoliage: checked }))}
      />
      <SliderField label="Collision" max={480} min={80} onChange={(value) => update((current) => ({ ...current, collisionRadius: value }))} step={10} value={state.collisionRadius} />
      <SliderField label="Foliage" max={2000} min={120} onChange={(value) => update((current) => ({ ...current, foliageRadius: value }))} step={10} value={state.foliageRadius} />
      <SliderField
        label="LOD0"
        max={280}
        min={80}
        onChange={(value) =>
          update((current) => {
            const lodDistances = [...current.lodDistances] as [number, number, number];
            lodDistances[0] = value;
            lodDistances[1] = Math.max(lodDistances[1], value + 10);
            lodDistances[2] = Math.max(lodDistances[2], lodDistances[1] + 10);
            return { ...current, lodDistances };
          })
        }
        step={10}
        value={state.lodDistances[0]}
      />
      <SliderField
        label="LOD1"
        max={420}
        min={160}
        onChange={(value) =>
          update((current) => {
            const lodDistances = [...current.lodDistances] as [number, number, number];
            lodDistances[1] = Math.max(value, lodDistances[0] + 10);
            lodDistances[2] = Math.max(lodDistances[2], lodDistances[1] + 10);
            return { ...current, lodDistances };
          })
        }
        step={10}
        value={state.lodDistances[1]}
      />
      <SliderField
        label="LOD2"
        max={700}
        min={260}
        onChange={(value) =>
          update((current) => {
            const lodDistances = [...current.lodDistances] as [number, number, number];
            lodDistances[2] = Math.max(value, lodDistances[1] + 10);
            return { ...current, lodDistances };
          })
        }
        step={10}
        value={state.lodDistances[2]}
      />
      <SelectField
        label="Terrain View"
        onChange={(value) => update((current) => ({ ...current, debugViewMode: Number(value) as TerrainDebugViewMode }))}
        options={debugViewOptions}
        value={String(state.debugViewMode)}
      />
    </div>
  );
}

function MaterialTab({
  onChange,
  state
}: {
  readonly onChange: (state: MaterialTabState) => void;
  readonly state: MaterialTabState;
}) {
  const update = (updater: (current: MaterialTabState) => MaterialTabState) => {
    onChange(updater(state));
  };

  return (
    <div style={tabContentStyle}>
      <div className="editor-section-label">Material Blend</div>
      <CheckboxField
        checked={state.useGeneratedTextures}
        label="Use Generated Textures"
        onChange={(checked) => update((current) => ({ ...current, useGeneratedTextures: checked }))}
      />
      <SliderField
        label="Rock Start"
        max={0.9}
        min={0.05}
        onChange={(value) =>
          update((current) => ({
            ...current,
            materialThresholds: {
              ...current.materialThresholds,
              rockSlopeStart: Math.min(value, current.materialThresholds.rockSlopeFull - 0.02)
            }
          }))
        }
        step={0.01}
        value={state.materialThresholds.rockSlopeStart}
      />
      <SliderField
        label="Rock Full"
        max={1}
        min={0.1}
        onChange={(value) =>
          update((current) => ({
            ...current,
            materialThresholds: {
              ...current.materialThresholds,
              rockSlopeFull: Math.max(value, current.materialThresholds.rockSlopeStart + 0.02)
            }
          }))
        }
        step={0.01}
        value={state.materialThresholds.rockSlopeFull}
      />
      <SliderField
        label="Grass Max Slope"
        max={0.9}
        min={0.1}
        onChange={(value) =>
          update((current) => ({
            ...current,
            materialThresholds: { ...current.materialThresholds, grassMaxSlope: value }
          }))
        }
        step={0.01}
        value={state.materialThresholds.grassMaxSlope}
      />
      <SliderField
        label="Snow Start"
        max={state.maxHeight}
        min={state.baseHeight}
        onChange={(value) =>
          update((current) => ({
            ...current,
            materialThresholds: {
              ...current.materialThresholds,
              snowStartHeight: Math.min(value, current.materialThresholds.snowFullHeight - 1)
            }
          }))
        }
        step={1}
        value={state.materialThresholds.snowStartHeight}
      />
      <SliderField
        label="Snow Full"
        max={state.maxHeight}
        min={state.baseHeight}
        onChange={(value) =>
          update((current) => ({
            ...current,
            materialThresholds: {
              ...current.materialThresholds,
              snowFullHeight: Math.max(value, current.materialThresholds.snowStartHeight + 1)
            }
          }))
        }
        step={1}
        value={state.materialThresholds.snowFullHeight}
      />
      <SliderField
        label="Dirt Low"
        max={state.maxHeight}
        min={state.baseHeight}
        onChange={(value) =>
          update((current) => ({
            ...current,
            materialThresholds: {
              ...current.materialThresholds,
              dirtLowHeight: Math.min(value, current.materialThresholds.dirtHighHeight - 1)
            }
          }))
        }
        step={1}
        value={state.materialThresholds.dirtLowHeight}
      />
      <SliderField
        label="Dirt High"
        max={state.maxHeight}
        min={state.baseHeight}
        onChange={(value) =>
          update((current) => ({
            ...current,
            materialThresholds: {
              ...current.materialThresholds,
              dirtHighHeight: Math.max(value, current.materialThresholds.dirtLowHeight + 1)
            }
          }))
        }
        step={1}
        value={state.materialThresholds.dirtHighHeight}
      />
      <SliderField label="Grass Scale" max={0.2} min={0.02} onChange={(value) => update((current) => ({ ...current, materialScales: { ...current.materialScales, grassScale: value } }))} step={0.005} value={state.materialScales.grassScale} />
      <SliderField label="Dirt Scale" max={0.2} min={0.02} onChange={(value) => update((current) => ({ ...current, materialScales: { ...current.materialScales, dirtScale: value } }))} step={0.005} value={state.materialScales.dirtScale} />
      <SliderField label="Sand Scale" max={0.2} min={0.02} onChange={(value) => update((current) => ({ ...current, materialScales: { ...current.materialScales, sandScale: value } }))} step={0.005} value={state.materialScales.sandScale} />
      <SliderField label="Rock Scale" max={0.2} min={0.02} onChange={(value) => update((current) => ({ ...current, materialScales: { ...current.materialScales, rockScale: value } }))} step={0.005} value={state.materialScales.rockScale} />
      <SliderField label="Snow Scale" max={0.2} min={0.02} onChange={(value) => update((current) => ({ ...current, materialScales: { ...current.materialScales, snowScale: value } }))} step={0.005} value={state.materialScales.snowScale} />
      <SliderField label="Macro Scale" max={0.03} min={0.001} onChange={(value) => update((current) => ({ ...current, materialScales: { ...current.materialScales, macroScale: value } }))} step={0.001} value={state.materialScales.macroScale} />
      <SliderField label="Anti-Tile" max={1} min={0} onChange={(value) => update((current) => ({ ...current, materialScales: { ...current.materialScales, antiTileStrength: value } }))} step={0.01} value={state.materialScales.antiTileStrength} />
      <SliderField label="Blend Sharpness" max={3} min={0.5} onChange={(value) => update((current) => ({ ...current, blendSharpness: value }))} step={0.05} value={state.blendSharpness} />
      <SliderField label="Sediment" max={2} min={0} onChange={(value) => update((current) => ({ ...current, sedimentStrength: value }))} step={0.05} value={state.sedimentStrength} />
      <SliderField label="Sediment Sand" max={1} min={0} onChange={(value) => update((current) => ({ ...current, sedimentSandBias: value }))} step={0.05} value={state.sedimentSandBias} />
      <SliderField label="Small River Tint" max={1.5} min={0} onChange={(value) => update((current) => ({ ...current, smallRiverTintStrength: value }))} step={0.05} value={state.smallRiverTintStrength} />
      <SliderField label="Small River Bright" max={1.8} min={0.5} onChange={(value) => update((current) => ({ ...current, smallRiverTintBrightness: value }))} step={0.05} value={state.smallRiverTintBrightness} />
      <SliderField label="Small River Sat" max={1.8} min={0} onChange={(value) => update((current) => ({ ...current, smallRiverTintSaturation: value }))} step={0.05} value={state.smallRiverTintSaturation} />
      <SliderField
        label="Beach Start"
        max={8}
        min={0}
        onChange={(value) =>
          update((current) => ({
            ...current,
            shorelineStartOffset: Math.min(value, current.shorelineEndOffset - 0.5)
          }))
        }
        step={0.5}
        value={state.shorelineStartOffset}
      />
      <SliderField
        label="Beach End"
        max={40}
        min={2}
        onChange={(value) =>
          update((current) => ({
            ...current,
            shorelineEndOffset: Math.max(value, current.shorelineStartOffset + 0.5)
          }))
        }
        step={0.5}
        value={state.shorelineEndOffset}
      />
    </div>
  );
}

function WorldTab({
  onChange,
  onRebuildTerrain,
  onResetDraft,
  onRetune,
  state
}: {
  readonly onChange: (state: WorldTabState) => void;
  readonly onRebuildTerrain: () => void | Promise<void>;
  readonly onResetDraft: () => void;
  readonly onRetune: () => void;
  readonly state: WorldTabState;
}) {
  const update = (updater: (current: WorldTabState) => WorldTabState) => {
    onChange(updater(state));
  };

  return (
    <div style={tabContentStyle}>
      <div className="editor-section-label">Regenerate</div>
      <label className="editor-field-group">
        <div className="editor-field-label">Seed</div>
        <input
          className="editor-input"
          onChange={(event) => update((current) => ({ ...current, seed: event.target.value }))}
          type="text"
          value={state.seed}
        />
      </label>
      <div className="editor-divider" />
      <div className="editor-section-label">World Size</div>
      <SliderField
        label="Chunks / Axis"
        max={16}
        min={6}
        onChange={(value) =>
          update((current) => ({
            ...current,
            chunksPerAxis: value,
            worldSize: value * current.chunkSize
          }))
        }
        step={1}
        value={state.chunksPerAxis}
      />
      <SliderField
        label="Chunk Size"
        max={256}
        min={64}
        onChange={(value) =>
          update((current) => ({
            ...current,
            chunkSize: value,
            worldSize: current.chunksPerAxis * value
          }))
        }
        step={16}
        value={state.chunkSize}
      />
      <div className="editor-status editor-code">{`World Size: ${state.worldSize}`}</div>
      <button className="editor-button" onClick={onRetune} type="button">
        Retune For World Size
      </button>
      <SliderField label="Base Height" max={32} min={-64} onChange={(value) => update((current) => ({ ...current, baseHeight: value, maxHeight: Math.max(current.maxHeight, value + 40) }))} step={1} value={state.baseHeight} />
      <SliderField label="Max Height" max={320} min={120} onChange={(value) => update((current) => ({ ...current, maxHeight: Math.max(value, current.baseHeight + 40) }))} step={5} value={state.maxHeight} />
      <SliderField label="Continent Amp" max={120} min={24} onChange={(value) => update((current) => ({ ...current, shape: { ...current.shape, continentAmplitude: value } }))} step={2} value={state.shape.continentAmplitude} />
      <SliderField label="Continent Freq" max={0.0025} min={0.0004} onChange={(value) => update((current) => ({ ...current, shape: { ...current.shape, continentFrequency: value } }))} step={0.00005} value={state.shape.continentFrequency} />
      <SliderField label="Radial Falloff" max={1.2} min={0.1} onChange={(value) => update((current) => ({ ...current, shape: { ...current.shape, radialFalloffStrength: value } }))} step={0.01} value={state.shape.radialFalloffStrength} />
      <SliderField label="Mountain Amp" max={220} min={40} onChange={(value) => update((current) => ({ ...current, shape: { ...current.shape, mountainAmplitude: value } }))} step={2} value={state.shape.mountainAmplitude} />
      <SliderField label="Mountain Freq" max={0.02} min={0.003} onChange={(value) => update((current) => ({ ...current, shape: { ...current.shape, mountainFrequency: value } }))} step={0.0005} value={state.shape.mountainFrequency} />
      <SliderField label="Hill Amp" max={80} min={8} onChange={(value) => update((current) => ({ ...current, shape: { ...current.shape, hillAmplitude: value } }))} step={1} value={state.shape.hillAmplitude} />
      <SliderField label="Hill Freq" max={0.015} min={0.002} onChange={(value) => update((current) => ({ ...current, shape: { ...current.shape, hillFrequency: value } }))} step={0.0005} value={state.shape.hillFrequency} />
      <SliderField label="Detail Amp" max={18} min={0} onChange={(value) => update((current) => ({ ...current, shape: { ...current.shape, detailAmplitude: value } }))} step={0.5} value={state.shape.detailAmplitude} />
      <SliderField label="Detail Freq" max={0.08} min={0.01} onChange={(value) => update((current) => ({ ...current, shape: { ...current.shape, detailFrequency: value } }))} step={0.001} value={state.shape.detailFrequency} />
      <div className="editor-divider" />
      <div className="editor-section-label">Erosion</div>
      <CheckboxField
        checked={state.erosion.enabled}
        label="Enable Erosion"
        onChange={(checked) => update((current) => ({ ...current, erosion: { ...current.erosion, enabled: checked } }))}
      />
      <SliderField label="Erosion Grid" max={513} min={65} onChange={(value) => update((current) => ({ ...current, erosion: { ...current.erosion, resolution: value } }))} step={32} value={state.erosion.resolution} />
      <SliderField label="Iterations" max={48} min={0} onChange={(value) => update((current) => ({ ...current, erosion: { ...current.erosion, iterations: value } }))} step={1} value={state.erosion.iterations} />
      <SliderField label="Talus Height" max={4} min={0.25} onChange={(value) => update((current) => ({ ...current, erosion: { ...current.erosion, talusHeight: value } }))} step={0.05} value={state.erosion.talusHeight} />
      <SliderField label="Smoothing" max={0.45} min={0.02} onChange={(value) => update((current) => ({ ...current, erosion: { ...current.erosion, smoothing: value } }))} step={0.01} value={state.erosion.smoothing} />
      <div className="editor-divider" />
      <div className="editor-section-label">Rivers</div>
      <CheckboxField
        checked={state.rivers.enabled}
        label="Enable Rivers"
        onChange={(checked) => update((current) => ({ ...current, rivers: { ...current.rivers, enabled: checked } }))}
      />
      <SliderField label="River Grid" max={513} min={65} onChange={(value) => update((current) => ({ ...current, rivers: { ...current.rivers, resolution: value } }))} step={32} value={state.rivers.resolution} />
      <SliderField label="Flow Threshold" max={0.95} min={0.45} onChange={(value) => update((current) => ({ ...current, rivers: { ...current.rivers, flowThreshold: value } }))} step={0.01} value={state.rivers.flowThreshold} />
      <SliderField label="Bank Width" max={1} min={0.2} onChange={(value) => update((current) => ({ ...current, rivers: { ...current.rivers, bankStrength: value } }))} step={0.02} value={state.rivers.bankStrength} />
      <SliderField label="Lake Threshold" max={3} min={0.2} onChange={(value) => update((current) => ({ ...current, rivers: { ...current.rivers, lakeThreshold: value } }))} step={0.05} value={state.rivers.lakeThreshold} />
      <SliderField label="River Depth" max={6} min={0.2} onChange={(value) => update((current) => ({ ...current, rivers: { ...current.rivers, depth: Math.min(value, current.rivers.maxDepth) } }))} step={0.1} value={state.rivers.depth} />
      <SliderField label="Max Depth" max={14} min={1} onChange={(value) => update((current) => ({ ...current, rivers: { ...current.rivers, maxDepth: Math.max(value, current.rivers.depth) } }))} step={0.25} value={state.rivers.maxDepth} />
      <SliderField label="Min Slope" max={0.12} min={0} onChange={(value) => update((current) => ({ ...current, rivers: { ...current.rivers, minSlope: value } }))} step={0.002} value={state.rivers.minSlope} />
      <SliderField label="Min Elevation" max={32} min={0} onChange={(value) => update((current) => ({ ...current, rivers: { ...current.rivers, minElevation: value } }))} step={1} value={state.rivers.minElevation} />
      <div className="editor-divider" />
      <div className="editor-section-label">POI</div>
      <SliderField label="POI Density" max={3} min={0.35} onChange={(value) => update((current) => ({ ...current, poi: { ...current.poi, density: value } }))} step={0.05} value={state.poi.density} />
      <SliderField label="POI Spacing" max={1.8} min={0.7} onChange={(value) => update((current) => ({ ...current, poi: { ...current.poi, spacing: value } }))} step={0.05} value={state.poi.spacing} />
      <div className="editor-divider" />
      <div className="editor-row-grid">
        <button className="editor-button" onClick={() => void onRebuildTerrain()} type="button">
          Rebuild Terrain
        </button>
        <button className="editor-button is-danger" onClick={onResetDraft} type="button">
          Reset Draft
        </button>
      </div>
    </div>
  );
}

function SliderField({
  label,
  max,
  min,
  onChange,
  step,
  value
}: {
  readonly label: string;
  readonly max: number;
  readonly min: number;
  readonly onChange: (value: number) => void;
  readonly step: number;
  readonly value: number;
}) {
  return (
    <label className="editor-range-wrap">
      <div className="editor-range-label">
        <span>{label}</span>
        <span className="editor-range-value">{formatValue(value, step)}</span>
      </div>
      <input
        className="editor-range"
        max={String(max)}
        min={String(min)}
        onChange={(event) => onChange(Number(event.target.value))}
        step={String(step)}
        type="range"
        value={String(value)}
      />
    </label>
  );
}

function CheckboxField({
  checked,
  label,
  onChange
}: {
  readonly checked: boolean;
  readonly label: string;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <label className="editor-checkbox-row">
      <input
        checked={checked}
        className="editor-checkbox-input"
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
      <span className="editor-checkbox-box" />
      <span>{label}</span>
    </label>
  );
}

function SelectField({
  label,
  onChange,
  options,
  value
}: {
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly (readonly [string, string])[];
  readonly value: string;
}) {
  return (
    <label className="editor-field-group">
      <div className="editor-field-label">{label}</div>
      <select className="editor-select" onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map(([optionLabel, optionValue]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function ColorField({
  label,
  onChange,
  value
}: {
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  return (
    <label className="editor-field-group">
      <div className="editor-field-label">{label}</div>
      <input
        className="editor-input"
        onChange={(event) => onChange(event.target.value)}
        type="color"
        value={value}
      />
    </label>
  );
}

interface PresetsTabProps {
  readonly importText: string;
  readonly onApply: () => void | Promise<void>;
  readonly onExport: () => void;
  readonly onExportTerrain: () => void;
  readonly onImport: () => void;
  readonly onImportTextChange: (value: string) => void;
  readonly onPresetNameChange: (value: string) => void;
  readonly onRebuildTerrain: () => void | Promise<void>;
  readonly onResetDraft: () => void;
  readonly onSave: () => void;
  readonly onSelectPreset: (index: number) => void;
  readonly presetName: string;
  readonly presetOptions: readonly TerrainPresetOption[];
  readonly selectedPresetIndex: number;
  readonly selectedPresetName: string;
}

function PresetsTab({
  importText,
  onApply,
  onExport,
  onExportTerrain,
  onImport,
  onImportTextChange,
  onPresetNameChange,
  onRebuildTerrain,
  onResetDraft,
  onSave,
  onSelectPreset,
  presetName,
  presetOptions,
  selectedPresetIndex,
  selectedPresetName
}: PresetsTabProps) {
  return (
    <div style={tabContentStyle}>
      <div className="editor-section-label">Presets</div>
      <label className="editor-field-group">
        <div className="editor-label-muted">Preset</div>
        <select
          className="editor-select"
          value={presetOptions.length === 0 ? "" : String(selectedPresetIndex)}
          onChange={(event) => onSelectPreset(Number(event.target.value))}
        >
          {presetOptions.map((preset, index) => (
            <option key={`${preset.name}-${index}`} value={index}>
              {preset.name}
            </option>
          ))}
        </select>
      </label>
      <button className="editor-button" type="button" onClick={() => void onApply()}>
        Apply Selected Preset
      </button>
      <button
        className="editor-button"
        type="button"
        onClick={onExport}
        disabled={presetOptions.length === 0}
      >
        Export {selectedPresetName || "Preset"}
      </button>
      <button className="editor-button" type="button" onClick={onExportTerrain}>
        Export Terrain ZIP
      </button>
      <label className="editor-field-group">
        <div className="editor-label-muted">Save Current As</div>
        <input
          className="editor-input"
          type="text"
          value={presetName}
          onChange={(event) => onPresetNameChange(event.target.value)}
          placeholder="Preset name"
        />
      </label>
      <button className="editor-button" type="button" onClick={onSave} disabled={!presetName.trim()}>
        Save Current Preset
      </button>
      <label className="editor-field-group">
        <div className="editor-label-muted">Import Presets JSON</div>
        <textarea
          className="editor-textarea editor-code"
          value={importText}
          onChange={(event) => onImportTextChange(event.target.value)}
          rows={6}
          placeholder='[{"name":"My Preset","config":{}}]'
        />
      </label>
      <button className="editor-button" type="button" onClick={onImport} disabled={!importText.trim()}>
        Import Presets
      </button>
      <div className="editor-divider" />
      <div className="editor-row-grid">
        <button className="editor-button" type="button" onClick={() => void onRebuildTerrain()}>
          Rebuild Terrain
        </button>
        <button className="editor-button is-danger" type="button" onClick={onResetDraft}>
          Reset Draft
        </button>
      </div>
    </div>
  );
}

const tabContentStyle = {
  display: "grid",
  gap: "8px",
  marginTop: "8px",
};

const topMarginStyle = {
  marginTop: "8px",
};

const bottomSpacingStyle = {
  marginBottom: "6px",
};

const debugViewOptions = [
  ["Final", String(TerrainDebugViewMode.Final)],
  ["Grass Weight", String(TerrainDebugViewMode.GrassWeight)],
  ["Dirt Weight", String(TerrainDebugViewMode.DirtWeight)],
  ["Rock Weight", String(TerrainDebugViewMode.RockWeight)],
  ["Snow Weight", String(TerrainDebugViewMode.SnowWeight)],
  ["Height", String(TerrainDebugViewMode.Height)],
  ["Slope", String(TerrainDebugViewMode.Slope)],
  ["Triplanar Blend", String(TerrainDebugViewMode.TriplanarBlend)],
  ["Erosion", String(TerrainDebugViewMode.Erosion)],
  ["Raw Height", String(TerrainDebugViewMode.RawHeight)],
  ["Flow", String(TerrainDebugViewMode.Flow)],
  ["River", String(TerrainDebugViewMode.River)],
  ["Lake", String(TerrainDebugViewMode.Lake)],
  ["Sediment", String(TerrainDebugViewMode.Sediment)],
  ["River Width", String(TerrainDebugViewMode.RiverWidth)],
  ["Water Transition", String(TerrainDebugViewMode.WaterTransition)],
  ["Resource", String(TerrainDebugViewMode.Resource)],
  ["Coal", String(TerrainDebugViewMode.Coal)],
  ["Iron", String(TerrainDebugViewMode.Iron)],
  ["Copper", String(TerrainDebugViewMode.Copper)]
] as const;

const panelTabs: readonly (readonly [PanelTab, string])[] = [
  ["runtime", "Runtime"],
  ["material", "Material"],
  ["world", "World"],
  ["presets", "Presets"]
];

function formatValue(value: number, step: number): string {
  return step >= 1 ? String(value) : value.toFixed(getDecimalPlaces(step));
}

function getDecimalPlaces(step: number): number {
  const stepText = String(step);
  const dotIndex = stepText.indexOf(".");
  return dotIndex === -1 ? 0 : stepText.length - dotIndex - 1;
}
