# Terrain Editor Mode

Terrain Editor Mode edits the generated terrain heightfield directly in the browser. Sculpted elevations remain when Editor Mode is closed and are included in terrain exports.

The header button shows `Editor Mode On/Off (E) · v<package version> alpha`. Press `E` to toggle the mode unless focus is inside an input, select, or text area.

## Viewport controls

While Editor Mode is enabled:

- Left-drag edits terrain or selection.
- Right-drag orbits the camera.
- Middle-drag pans the camera.
- Mouse wheel zooms.

Normal camera bindings return after Editor Mode is disabled.

The bright terrain-following ring shows the brush position and radius. In Select workflow, selected ground is displayed with a translucent cyan overlay. The selection overlay is hidden in Sculpt workflow, but the stored selection is not cleared.

## Sculpt workflow

Choose `Sculpt`, then select one of these tools:

- `Raise` increases elevation.
- `Lower` decreases elevation.
- `Smooth` blends elevation toward a stable weighted 3×3 neighbourhood.

The available brush controls are:

- `Radius` controls the affected area.
- `Strength` controls the height change or smoothing blend.
- `Hardness` controls the falloff between the brush centre and edge.

One left-drag is recorded as one undo command. A new drag is accepted after the preceding stroke has been committed. Heights are clamped to the configured base and maximum terrain heights.

Edited chunks and their seam neighbours update immediately. All terrain LOD meshes receive the edited heights and matching terrain-sampled normals. The shared terrain material is invalidated after a completed edit so height- and slope-based grass, dirt, rock, sand, and snow blending can update without rebuilding the entire world.

## Select workflow

Selection is persistent and can be reused for several operations.

- `Brush` paints a selection using the configured radius and hardness.
- `Rectangle` selects a rectangular area.
- `Add` adds ground to the selection.
- `Subtract` removes ground from the selection.
- `Select All` selects the complete heightfield.
- `Clear` removes the selection.

Choose Raise, Lower, or Smooth and press `Apply` to edit the selected ground. Applying an operation does not clear the selection. Selection changes are not added to terrain undo history.

## Undo and redo

Use the Editor panel buttons or the standard shortcuts:

- `Ctrl/Cmd+Z` undoes the last terrain edit.
- `Ctrl/Cmd+Y` or `Ctrl/Cmd+Shift+Z` redoes it.

A sculpt drag, one selection application, or one Smooth World operation is stored as one command. Up to 100 terrain edit commands are retained. Importing or procedurally replacing terrain clears edit history and selection.

## Smooth World

The separate `World Smoothing` panel appears under `World Features` when Editor Mode is off.

- `Strength` controls how strongly each pass blends toward neighbouring elevations.
- `Passes` controls how many stable 3×3 smoothing passes are applied.
- `Refresh Features After` optionally regenerates derived world content immediately afterward.
- `Smooth World` applies the operation to the complete authoritative heightfield.

Smooth World is one undoable command even when several passes are requested. It does not change the persistent Editor Mode selection.

## Terrain changes and world-feature refreshes

Geometry, normals, bounds, and terrain material appearance update immediately. Derived world content is intentionally refreshed separately because it is much slower than updating affected terrain chunks.

When the panel says:

> Terrain changed. Click Refresh World Features to regenerate rivers, water, roads, POIs, resources, and foliage.

press `Refresh World Features` if the project uses any of that generated content. Refreshing treats the edited elevations as authoritative; it does not rerun erosion or river-channel carving over the user's sculpted heights.

Refresh uses the current `World Features` settings, including POI, roads, POI density/spacing, rivers, and foliage. It also restores visibility for enabled settlements, roads, and foliage after the refreshed terrain is swapped in. You do not need to run the procedural `Apply Features`/`Rebuild Terrain` operation first.

Manual refresh is not necessary when the result only needs terrain elevation and material appearance and does not use rivers, lakes/water, roads, POIs, resources, or foliage. It is also unnecessary to click refresh manually when `Refresh Features After` was enabled for Smooth World.

| Use case | Manual feature refresh needed? |
| --- | --- |
| Terrain shape/material preview only | No |
| Rivers, lakes, or generated water | Yes |
| Roads or POIs | Yes |
| Resource maps/data | Yes |
| Foliage placement | Yes |
| Smooth World with `Refresh Features After` enabled | No; it runs automatically |
| Export from the browser demo | No; export waits for pending terrain synchronization |

A refresh runs through the worker-based derived-data pipeline. A newer edit can supersede an older refresh, and stale worker results are not allowed to replace newer terrain edits.

## Rebuild Terrain versus Refresh World Features

- `Refresh World Features` preserves sculpted elevations and regenerates content derived from them.
- `Rebuild Terrain` performs procedural terrain generation again and replaces sculpt edits, selection, and undo history.

Use Refresh World Features after editing. Use Rebuild Terrain only when a new procedurally generated world is intended.

## Export and import

Browser exports use the current edited terrain rather than the originally generated heightfield.

- Terrain-bundle export includes edited elevations and synchronized derived data.
- Heightmap export contains the edited elevations. The browser export path also waits for pending synchronization, so a manual refresh click is not required before exporting.
- Import restores the terrain asset as the new authoritative terrain and clears the previous edit selection/history.

## Public editing API

`TerrainEditSession` is exported through the terrain and Babylon package surfaces. It provides:

- Brush/tool configuration and stroke begin/append/commit/cancel lifecycle.
- Brush and rectangle selection operations.
- Raise, lower, and smooth application to persistent selection.
- Whole-world smoothing.
- Undo/redo state and edit subscriptions.
- Sampling and retrieval of the current edited terrain asset.

The session owns a private mutable copy of imported height data and never mutates the source asset buffer directly.
