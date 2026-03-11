import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Matrix, Vector3 } from "@babylonjs/core/Maths/math.vector";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import { TerrainChunk } from "./TerrainChunk";
import { TerrainConfig } from "./TerrainConfig";

export class TerrainDebugOverlay {
  private readonly lineMeshes: LinesMesh[] = [];
  private readonly centerMarkers: Mesh[] = [];
  private readonly labels: HTMLDivElement[] = [];
  private readonly root: HTMLDivElement;
  private visible = true;

  constructor(
    private readonly scene: Scene,
    private readonly chunks: readonly TerrainChunk[],
    private readonly config: TerrainConfig
  ) {
    this.root = this.createRootElement();
    this.build();
  }

  update(): void {
    const engine = this.scene.getEngine();
    const camera = this.scene.activeCamera;
    const canvas = engine.getRenderingCanvas();

    if (!camera || !canvas) {
      return;
    }

    const viewport = camera.viewport.toGlobal(
      engine.getRenderWidth(),
      engine.getRenderHeight()
    );
    const transform = this.scene.getTransformMatrix();

    for (let index = 0; index < this.chunks.length; index += 1) {
      const chunk = this.chunks[index];
      const label = this.labels[index];
      label.textContent =
        `(${chunk.chunkX}, ${chunk.chunkZ})\nLOD${chunk.getLOD()}${chunk.getCollisionEnabled() ? " C" : ""}`;
      const anchor = new Vector3(chunk.center.x, chunk.centerHeight + 18, chunk.center.z);
      const projected = Vector3.Project(
        anchor,
        Matrix.IdentityReadOnly,
        transform,
        viewport
      );
      const inFrontOfCamera = projected.z >= 0 && projected.z <= 1;
      label.style.display = this.visible && inFrontOfCamera ? "block" : "none";
      label.style.transform = `translate(${projected.x}px, ${projected.y}px) translate(-50%, -100%)`;
    }
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.lineMeshes.forEach((mesh) => mesh.setEnabled(visible));
    this.centerMarkers.forEach((mesh) => mesh.setEnabled(visible));
    this.labels.forEach((label) => {
      label.style.display = visible ? "block" : "none";
    });
  }

  isVisible(): boolean {
    return this.visible;
  }

  dispose(): void {
    this.lineMeshes.forEach((mesh) => mesh.dispose(false, true));
    this.centerMarkers.forEach((mesh) => mesh.dispose(false, true));
    this.labels.forEach((label) => label.remove());
    this.root.remove();
  }

  private build(): void {
    for (const chunk of this.chunks) {
      this.lineMeshes.push(this.createChunkOutline(chunk));
      this.centerMarkers.push(this.createChunkMarker(chunk));
      this.labels.push(this.createChunkLabel(chunk));
    }
  }

  private createChunkOutline(chunk: TerrainChunk): LinesMesh {
    const y = chunk.centerHeight + 2;
    const outline = MeshBuilder.CreateLines(
      `chunk-outline-${chunk.chunkX}-${chunk.chunkZ}`,
      {
        points: [
          new Vector3(chunk.data.minX, y, chunk.data.minZ),
          new Vector3(chunk.data.maxX, y, chunk.data.minZ),
          new Vector3(chunk.data.maxX, y, chunk.data.maxZ),
          new Vector3(chunk.data.minX, y, chunk.data.maxZ),
          new Vector3(chunk.data.minX, y, chunk.data.minZ)
        ]
      },
      this.scene
    );
    outline.color = new Color3(0.96, 0.82, 0.31);
    outline.alwaysSelectAsActiveMesh = true;
    return outline;
  }

  private createChunkMarker(chunk: TerrainChunk): Mesh {
    const marker = MeshBuilder.CreateSphere(
      `chunk-marker-${chunk.chunkX}-${chunk.chunkZ}`,
      { diameter: 6, segments: 8 },
      this.scene
    );
    marker.position.set(chunk.center.x, chunk.centerHeight + 6, chunk.center.z);
    const material = new StandardMaterial(
      `chunk-marker-material-${chunk.chunkX}-${chunk.chunkZ}`,
      this.scene
    );
    material.emissiveColor = new Color3(1, 0.35, 0.2);
    material.diffuseColor = Color3.Black();
    material.specularColor = Color3.Black();
    marker.material = material;
    marker.alwaysSelectAsActiveMesh = true;
    return marker;
  }

  private createChunkLabel(chunk: TerrainChunk): HTMLDivElement {
    const label = document.createElement("div");
    label.dataset.chunk = `${chunk.chunkX}-${chunk.chunkZ}`;
    label.style.position = "fixed";
    label.style.left = "0";
    label.style.top = "0";
    label.style.pointerEvents = "none";
    label.style.whiteSpace = "pre";
    label.style.color = "#f3f0d4";
    label.style.font = "12px/1.3 Consolas, 'Courier New', monospace";
    label.style.textShadow = "0 0 8px rgba(0, 0, 0, 0.85)";
    label.style.padding = "2px 6px";
    label.style.borderRadius = "6px";
    label.style.background = "rgba(8, 13, 19, 0.45)";
    label.style.border = "1px solid rgba(243, 240, 212, 0.14)";
    this.root.appendChild(label);
    return label;
  }

  private createRootElement(): HTMLDivElement {
    const root = document.createElement("div");
    root.id = "terrain-debug-overlay";
    root.style.position = "fixed";
    root.style.inset = "0";
    root.style.pointerEvents = "none";
    root.style.zIndex = "9";
    document.body.appendChild(root);
    return root;
  }
}
