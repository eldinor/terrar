import { Texture } from "@babylonjs/core/Materials/Textures/texture";

export interface TerrainTextureLayer {
  albedo: Texture;
  normal?: Texture;
  roughness?: Texture;
}

export interface TerrainTextureSet {
  grass: TerrainTextureLayer;
  dirt: TerrainTextureLayer;
  rock: TerrainTextureLayer;
  snow: TerrainTextureLayer;
}

