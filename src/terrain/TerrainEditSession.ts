import type { BuiltTerrain } from "../builder";

export type TerrainEditTool = "raise" | "lower" | "smooth";
export type TerrainSelectionMode = "add" | "subtract";

export interface TerrainBrushSettings {
  readonly radius: number;
  readonly strength: number;
  readonly hardness: number;
}

export interface TerrainEditPoint {
  readonly x: number;
  readonly z: number;
}

export interface TerrainEditSessionState {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly hasSelection: boolean;
  readonly selectedSampleCount: number;
  readonly revision: number;
}

interface HeightPatch {
  readonly indices: Uint32Array;
  readonly before: Float32Array;
  readonly after: Float32Array;
}

export class TerrainEditSession {
  private terrain: BuiltTerrain;
  private buffer: ArrayBuffer;
  private heights: Float32Array;
  private selection: Uint8Array;
  private readonly undoStack: HeightPatch[] = [];
  private readonly redoStack: HeightPatch[] = [];
  private strokeBefore: Map<number, number> | null = null;
  private strokeTool: TerrainEditTool | null = null;
  private strokeBrush: TerrainBrushSettings | null = null;
  private lastStrokePoint: TerrainEditPoint | null = null;
  private revision = 0;
  private readonly listeners = new Set<() => void>();

  constructor(terrain: BuiltTerrain, private readonly historyLimit = 100) {
    this.terrain = terrain;
    this.buffer = cloneSnapshotBuffer(terrain);
    this.heights = createHeightView(terrain, this.buffer);
    this.selection = new Uint8Array(this.heights.length);
  }

  getState(): TerrainEditSessionState {
    let selectedSampleCount = 0;
    this.selection.forEach((value) => {
      if (value > 0) selectedSampleCount += 1;
    });
    return {
      canUndo: this.undoStack.length > 0,
      canRedo: this.redoStack.length > 0,
      hasSelection: selectedSampleCount > 0,
      selectedSampleCount,
      revision: this.revision
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  beginStroke(tool: TerrainEditTool, point: TerrainEditPoint, brush: TerrainBrushSettings): void {
    if (this.strokeBefore) {
      throw new Error("A terrain edit stroke is already active.");
    }
    this.strokeBefore = new Map();
    this.strokeTool = tool;
    this.strokeBrush = normalizeBrush(brush);
    this.lastStrokePoint = point;
    this.applyBrushStamp(tool, point, this.strokeBrush, this.strokeBefore);
    this.markChanged();
  }

  appendStroke(point: TerrainEditPoint): void {
    if (!this.strokeBefore || !this.strokeTool || !this.strokeBrush || !this.lastStrokePoint) {
      return;
    }
    const dx = point.x - this.lastStrokePoint.x;
    const dz = point.z - this.lastStrokePoint.z;
    const distance = Math.hypot(dx, dz);
    const spacing = Math.max(this.terrain.packedSnapshot.analysisStep, this.strokeBrush.radius * 0.2);
    const stamps = Math.max(1, Math.ceil(distance / spacing));
    for (let index = 1; index <= stamps; index += 1) {
      const amount = index / stamps;
      this.applyBrushStamp(this.strokeTool, {
        x: this.lastStrokePoint.x + dx * amount,
        z: this.lastStrokePoint.z + dz * amount
      }, this.strokeBrush, this.strokeBefore);
    }
    this.lastStrokePoint = point;
    this.markChanged();
  }

  commitStroke(): boolean {
    if (!this.strokeBefore) {
      return false;
    }
    const changed = this.commitPatch(this.strokeBefore);
    this.clearStroke();
    return changed;
  }

  cancelStroke(): void {
    this.strokeBefore?.forEach((height, index) => { this.heights[index] = height; });
    this.clearStroke();
    this.markChanged();
  }

  paintSelection(point: TerrainEditPoint, radius: number, hardness: number, mode: TerrainSelectionMode): void {
    this.forEachBrushCell(point, radius, hardness, (index, weight) => {
      const value = Math.round(weight * 255);
      this.selection[index] = mode === "add"
        ? Math.max(this.selection[index], value)
        : Math.min(this.selection[index], 255 - value);
    });
    this.markChanged();
  }

  selectRectangle(start: TerrainEditPoint, end: TerrainEditPoint, mode: TerrainSelectionMode): void {
    const minX = Math.min(start.x, end.x);
    const maxX = Math.max(start.x, end.x);
    const minZ = Math.min(start.z, end.z);
    const maxZ = Math.max(start.z, end.z);
    this.forEachGridCell((index, x, z) => {
      if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
        this.selection[index] = mode === "add" ? 255 : 0;
      }
    });
    this.markChanged();
  }

  selectAll(): void {
    this.selection.fill(255);
    this.markChanged();
  }

  clearSelection(): void {
    this.selection.fill(0);
    this.markChanged();
  }

  getSelection(): Uint8Array {
    return this.selection.slice();
  }

  applyToSelection(tool: TerrainEditTool, strength: number): boolean {
    const before = new Map<number, number>();
    const source = tool === "smooth" ? this.heights.slice() : this.heights;
    this.selection.forEach((selectionValue, index) => {
      if (selectionValue === 0) return;
      const weight = selectionValue / 255;
      before.set(index, this.heights[index]);
      this.heights[index] = this.applyToolValue(tool, index, strength * weight, source);
    });
    return this.commitPatch(before);
  }

  /** Smooths the complete authoritative heightfield as one undo command. */
  smoothWorld(strength: number, passes: number): boolean {
    const blend = Math.max(0, Math.min(1, strength));
    const passCount = Math.max(1, Math.min(20, Math.round(passes)));
    if (blend === 0) return false;

    const before = new Map<number, number>();
    this.heights.forEach((height, index) => before.set(index, height));
    for (let pass = 0; pass < passCount; pass += 1) {
      const source = this.heights.slice();
      for (let index = 0; index < this.heights.length; index += 1) {
        this.heights[index] = this.applyToolValue("smooth", index, blend, source);
      }
    }
    return this.commitPatch(before);
  }

  undo(): boolean {
    const patch = this.undoStack.pop();
    if (!patch) return false;
    applyPatch(this.heights, patch.indices, patch.before);
    this.redoStack.push(patch);
    this.revision += 1;
    this.markChanged();
    return true;
  }

  redo(): boolean {
    const patch = this.redoStack.pop();
    if (!patch) return false;
    applyPatch(this.heights, patch.indices, patch.after);
    this.undoStack.push(patch);
    this.revision += 1;
    this.markChanged();
    return true;
  }

  replaceTerrain(terrain: BuiltTerrain): void {
    this.terrain = terrain;
    this.buffer = cloneSnapshotBuffer(terrain);
    this.heights = createHeightView(terrain, this.buffer);
    this.selection = new Uint8Array(this.heights.length);
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.clearStroke();
    this.revision += 1;
    this.markChanged();
  }

  acceptDerivedTerrain(terrain: BuiltTerrain): void {
    if (terrain.packedSnapshot.analysisResolution !== this.resolution) {
      throw new Error("Derived terrain resolution changed during editing.");
    }
    this.terrain = terrain;
    this.buffer = cloneSnapshotBuffer(terrain);
    this.heights = createHeightView(terrain, this.buffer);
    this.markChanged();
  }

  getTerrain(): BuiltTerrain {
    const buffer = this.buffer.slice(0);
    return {
      config: this.terrain.config,
      poiSites: this.terrain.poiSites,
      roads: this.terrain.roads,
      packedSnapshot: { ...this.terrain.packedSnapshot, buffer, shared: false }
    };
  }

  getHeightAt(point: TerrainEditPoint): number {
    const { gridX, gridZ } = this.worldToGrid(point);
    return this.heights[gridZ * this.resolution + gridX];
  }

  sampleHeight(point: TerrainEditPoint): number {
    const step = this.terrain.packedSnapshot.analysisStep;
    const gx = Math.max(0, Math.min(this.resolution - 1, (point.x - this.terrain.config.worldMin) / step));
    const gz = Math.max(0, Math.min(this.resolution - 1, (point.z - this.terrain.config.worldMin) / step));
    const x0 = Math.floor(gx);
    const z0 = Math.floor(gz);
    const x1 = Math.min(this.resolution - 1, x0 + 1);
    const z1 = Math.min(this.resolution - 1, z0 + 1);
    const tx = gx - x0;
    const tz = gz - z0;
    const top = this.heights[z0 * this.resolution + x0] * (1 - tx) + this.heights[z0 * this.resolution + x1] * tx;
    const bottom = this.heights[z1 * this.resolution + x0] * (1 - tx) + this.heights[z1 * this.resolution + x1] * tx;
    return top * (1 - tz) + bottom * tz;
  }

  private applyBrushStamp(tool: TerrainEditTool, point: TerrainEditPoint, brush: TerrainBrushSettings, before: Map<number, number>): void {
    const source = tool === "smooth" ? this.heights.slice() : this.heights;
    this.forEachBrushCell(point, brush.radius, brush.hardness, (index, weight) => {
      if (!before.has(index)) before.set(index, this.heights[index]);
      this.heights[index] = this.applyToolValue(tool, index, brush.strength * weight, source);
    });
  }

  private applyToolValue(tool: TerrainEditTool, index: number, amount: number, source: Float32Array): number {
    const current = this.heights[index];
    if (tool === "raise") return this.clampHeight(current + amount);
    if (tool === "lower") return this.clampHeight(current - amount);
    const x = index % this.resolution;
    const z = Math.floor(index / this.resolution);
    let sum = 0;
    let weights = 0;
    for (let dz = -1; dz <= 1; dz += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = Math.max(0, Math.min(this.resolution - 1, x + dx));
        const nz = Math.max(0, Math.min(this.resolution - 1, z + dz));
        const weight = dx === 0 && dz === 0 ? 4 : Math.abs(dx) + Math.abs(dz) === 1 ? 2 : 1;
        sum += source[nz * this.resolution + nx] * weight;
        weights += weight;
      }
    }
    return this.clampHeight(current + (sum / weights - current) * Math.max(0, Math.min(1, amount)));
  }

  private forEachBrushCell(point: TerrainEditPoint, radius: number, hardness: number, visit: (index: number, weight: number) => void): void {
    const step = this.terrain.packedSnapshot.analysisStep;
    const centerX = (point.x - this.terrain.config.worldMin) / step;
    const centerZ = (point.z - this.terrain.config.worldMin) / step;
    const gridRadius = Math.max(0.5, radius / step);
    const minX = Math.max(0, Math.floor(centerX - gridRadius));
    const maxX = Math.min(this.resolution - 1, Math.ceil(centerX + gridRadius));
    const minZ = Math.max(0, Math.floor(centerZ - gridRadius));
    const maxZ = Math.min(this.resolution - 1, Math.ceil(centerZ + gridRadius));
    for (let z = minZ; z <= maxZ; z += 1) {
      for (let x = minX; x <= maxX; x += 1) {
        const normalizedDistance = Math.hypot(x - centerX, z - centerZ) / gridRadius;
        if (normalizedDistance > 1) continue;
        const hard = Math.max(0, Math.min(1, hardness));
        const weight = normalizedDistance <= hard
          ? 1
          : 1 - smoothstep(hard, 1, normalizedDistance);
        visit(z * this.resolution + x, weight);
      }
    }
  }

  private forEachGridCell(visit: (index: number, x: number, z: number) => void): void {
    const step = this.terrain.packedSnapshot.analysisStep;
    for (let z = 0; z < this.resolution; z += 1) {
      for (let x = 0; x < this.resolution; x += 1) {
        visit(z * this.resolution + x, this.terrain.config.worldMin + x * step, this.terrain.config.worldMin + z * step);
      }
    }
  }

  private commitPatch(before: Map<number, number>): boolean {
    const changed = [...before.entries()].filter(([index, height]) => height !== this.heights[index]);
    if (changed.length === 0) return false;
    changed.sort(([a], [b]) => a - b);
    const patch: HeightPatch = {
      indices: Uint32Array.from(changed.map(([index]) => index)),
      before: Float32Array.from(changed.map(([, height]) => height)),
      after: Float32Array.from(changed.map(([index]) => this.heights[index]))
    };
    this.undoStack.push(patch);
    if (this.undoStack.length > this.historyLimit) this.undoStack.shift();
    this.redoStack.length = 0;
    this.revision += 1;
    this.markChanged();
    return true;
  }

  private clearStroke(): void {
    this.strokeBefore = null;
    this.strokeTool = null;
    this.strokeBrush = null;
    this.lastStrokePoint = null;
  }

  private worldToGrid(point: TerrainEditPoint): { gridX: number; gridZ: number } {
    const step = this.terrain.packedSnapshot.analysisStep;
    return {
      gridX: Math.max(0, Math.min(this.resolution - 1, Math.round((point.x - this.terrain.config.worldMin) / step))),
      gridZ: Math.max(0, Math.min(this.resolution - 1, Math.round((point.z - this.terrain.config.worldMin) / step)))
    };
  }

  private clampHeight(value: number): number {
    return Math.max(this.terrain.config.baseHeight, Math.min(this.terrain.config.maxHeight, value));
  }

  private get resolution(): number { return this.terrain.packedSnapshot.analysisResolution; }
  private markChanged(): void { this.listeners.forEach((listener) => listener()); }
}

function cloneSnapshotBuffer(terrain: BuiltTerrain): ArrayBuffer {
  const source = new Uint8Array(terrain.packedSnapshot.buffer);
  const clone = new Uint8Array(source.byteLength);
  clone.set(source);
  return clone.buffer;
}

function createHeightView(terrain: BuiltTerrain, buffer: ArrayBuffer): Float32Array {
  const field = terrain.packedSnapshot.fields.terrainHeightField;
  if (!field || field.length !== terrain.packedSnapshot.analysisResolution ** 2) {
    throw new Error("Terrain editing requires a complete packed terrain height field.");
  }
  return new Float32Array(buffer, field.byteOffset, field.length);
}

function normalizeBrush(brush: TerrainBrushSettings): TerrainBrushSettings {
  return { radius: Math.max(0.01, brush.radius), strength: Math.max(0, brush.strength), hardness: Math.max(0, Math.min(1, brush.hardness)) };
}

function smoothstep(min: number, max: number, value: number): number {
  if (max <= min) return value >= max ? 1 : 0;
  const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return x * x * (3 - 2 * x);
}

function applyPatch(heights: Float32Array, indices: Uint32Array, values: Float32Array): void {
  indices.forEach((index, offset) => { heights[index] = values[offset]; });
}
