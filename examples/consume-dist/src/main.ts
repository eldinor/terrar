import { ArcRotateCamera } from "@babylonjs/core/Cameras/arcRotateCamera";
import "@babylonjs/core/Culling/ray";
import { Engine } from "@babylonjs/core/Engines/engine";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { Color3 } from "@babylonjs/core/Maths/math.color";
import { Vector3 } from "@babylonjs/core/Maths/math.vector";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { Scene } from "@babylonjs/core/scene";
import { buildTerrain } from "terrar/builder";
import { renderTerrainAsset } from "terrar/babylon";

console.info("[terrar consumer] modules loaded");

const canvas = document.querySelector<HTMLCanvasElement>("#terrain");
if (!canvas) {
  throw new Error("Terrain canvas was not found.");
}
console.info("[terrar consumer] canvas found", canvas.clientWidth, canvas.clientHeight);

const engine = new Engine(canvas, true);
const scene = new Scene(engine);
engine.resize();
scene.clearColor.set(0.9, 0.05, 0.35, 1);
scene.forceShowBoundingBoxes = true;
console.info("[terrar consumer] Babylon engine and scene created", {
  canvasSize: [canvas.width, canvas.height],
  renderSize: [engine.getRenderWidth(), engine.getRenderHeight()]
});

const camera = new ArcRotateCamera(
  "camera",
  -Math.PI * 0.25,
  Math.PI * 0.18,
  900,
  new Vector3(0, 60, 0),
  scene
);
camera.attachControl(canvas, true);
camera.lowerRadiusLimit = 180;
camera.upperRadiusLimit = 1400;
scene.activeCamera = camera;
console.info("[terrar consumer] camera active", camera.position.asArray());

new HemisphericLight("sky", new Vector3(0.25, 1, 0.15), scene).intensity = 1.1;

const marker = MeshBuilder.CreateBox("consumer-marker", { size: 32 }, scene);
const forwardRay = camera.getForwardRay();
marker.position.copyFrom(forwardRay.origin.add(forwardRay.direction.scale(120)));
const markerMaterial = new StandardMaterial("consumer-marker-material", scene);
markerMaterial.emissiveColor = new Color3(1, 0, 0);
markerMaterial.disableDepthWrite = true;
marker.material = markerMaterial;
console.info("[terrar consumer] red scene marker created");

console.info("[terrar consumer] building terrain asset");
const terrain = buildTerrain({
  seed: "npm-package-example",
  worldMin: -128,
  worldMax: 128,
  chunksPerAxis: 4,
  chunkSize: 64,
  erosion: { resolution: 257 },
  rivers: { resolution: 257 }
});
console.info("[terrar consumer] terrain asset built", terrain.config);

const adapter = renderTerrainAsset(scene, terrain);
console.info("[terrar consumer] terrain adapter created");
adapter.initialize();
adapter.setWireframe(true);
console.info("[terrar consumer] terrain adapter initialized");

void adapter.whenChunkMeshesReady()
  .then(() => {
    console.info("[terrar consumer] terrain meshes ready", {
      chunks: adapter.getChunkCount(),
      loadedMeshes: adapter.getLoadedChunkMeshCount()
    });
  })
  .catch((error: unknown) => {
    console.error("[terrar consumer] terrain mesh build failed", error);
  });

scene.onAfterRenderObservable.addOnce(() => {
  const activeMeshes = scene.getActiveMeshes();
  const enabledMeshes = scene.meshes.filter((mesh) => mesh.isEnabled());
  console.info("[terrar consumer] first scene frame rendered", {
    activeCamera: scene.activeCamera?.name,
    activeMeshes: activeMeshes.length,
    enabledMeshes: enabledMeshes.length,
    sceneMeshes: scene.meshes.length,
    visibleEnabledMeshes: enabledMeshes.filter((mesh) => mesh.isVisible).length
  });
  console.info("[terrar consumer] camera and mesh bounds", {
    cameraTarget: camera.target.asArray(),
    meshes: enabledMeshes.map((mesh) => {
      const bounds = mesh.getBoundingInfo().boundingBox;
      return {
        name: mesh.name,
        minimum: bounds.minimumWorld.asArray(),
        maximum: bounds.maximumWorld.asArray(),
        vertices: mesh.getTotalVertices()
      };
    })
  });
});
engine.onEndFrameObservable.addOnce(() => {
  const context = canvas.getContext("webgl2");
  if (!context) {
    console.error("[terrar consumer] WebGL2 context unavailable for pixel check");
    return;
  }

  const pixel = new Uint8Array(4);
  context.readPixels(
    Math.floor(engine.getRenderWidth() * 0.5),
    Math.floor(engine.getRenderHeight() * 0.5),
    1,
    1,
    context.RGBA,
    context.UNSIGNED_BYTE,
    pixel
  );
  console.info("[terrar consumer] center framebuffer pixel", [...pixel]);
});
window.addEventListener("error", (event) => {
  console.error("[terrar consumer] window error", event.error ?? event.message);
});
window.addEventListener("unhandledrejection", (event) => {
  console.error("[terrar consumer] unhandled rejection", event.reason);
});

engine.runRenderLoop(() => {
  adapter.update(camera.position);
  scene.render();
});

window.addEventListener("resize", () => engine.resize());
window.addEventListener("beforeunload", () => {
  adapter.dispose();
  engine.dispose();
});
