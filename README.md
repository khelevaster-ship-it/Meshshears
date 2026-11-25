# MeshShears

Cut a 3D model into separate pieces by painting on it.

<!-- a short screen recording goes here: ![Painting a tunic and boots, then exporting them](docs/demo.gif) -->

I kept getting character models where the clothes, the body and the props were all fused into one mesh. Splitting
them in Blender meant selecting thousands of faces by hand, so I made this instead. You paint each part a colour,
hit export, and get one file per part. It runs in your browser and your model never gets uploaded anywhere.

**Try it:** https://khelevaster-ship-it.github.io/Meshshears/

- **Hugging Face Space:** https://huggingface.co/spaces/Khelevaster/Meshshears
- **Mobile & tablet support:** Phones and tablets can pick model files directly in the import buttons.

Or grab a copy (the green Code button, then Download ZIP), unzip it and double-click `index.html`. That works
offline.

## What it does

You open a model (`.glb`, `.gltf`, `.obj`, `.fbx`, `.stl` or `.ply`) and paint on it. Every colour you use becomes a
piece. Fill follows colour edges and folds, so a shirt usually takes a click or two. When you're done, export gives you
a zip with each piece as its own `.glb`, still at the right size, the right way up, with its texture.

There's also a piece finder. It takes photos of your model from 40 angles, works out where the outlines are, and
splits the model into pieces for you, so Fill can grab a whole sleeve or boot in one click. It runs in the background
while you keep painting, and the first pieces show up about a quarter of the way in. Afterwards a slider makes the
pieces bigger or smaller, and Split a piece / Join two pieces fix the odd one by hand. Tick Quick for a run with half
the photos.

And a clone brush, for when part of a texture looks wrong: Alt-click a good area, paint over the bad one, and it
copies the look across, colours and all.

## Getting around

- Left drag paints, right drag turns, the wheel zooms, middle drag slides. W A S D and the arrow keys move too, R
  resets the view. Every key is listed in the corner of the screen (click its title to fold it away).
- On a touch screen: one finger paints, two fingers slide, pinch and twist.
- Brush, Fill, Lasso and Eraser are in the panel on the right. Wall draws a line that Fill won't cross.
- Preview the cut shows only what you're keeping.
- Save keeps your work in the browser. File, then Save paint to a file, gives you a file you can open on another
  computer.

## A few things to know

- The piece finder takes a few minutes. It works on several cores side by side (up to four, fewer on a computer with
  little memory), and on a graphics card that can run it, it uses that too. If the graphics card gives a wrong answer
  at any point, it carries on without it. If a run goes wrong, File, then Copy piece finder report, gives you text to
  send.
- Models up to about 4 million triangles. Big ones want a computer with a decent graphics card.
- `.stl` and `.ply` files have no texture, so they open grey.
- From `.usdz` or `.blend`, export a `.glb` first (in Blender: File, Export, glTF 2.0).
- Chrome and Edge are fastest. Firefox works.

<details>
<summary>File formats and other details</summary>

- Textures that sit in separate files (an `.obj`'s `.mtl`, a `.gltf`'s `.bin`, image files) need to be opened or
  dropped together with the model.
- Draco-compressed `.glb` files open. Meshopt and KTX2 compression don't yet.
- A model far from person size (one made in centimetres, say) is scaled to 1.75 m while you paint so the brush sizes
  make sense. The export puts it back.
- All of a model's meshes are joined into one surface for painting. Several materials are laid side by side in one
  texture; the export carries that texture.
- Colours to fix (the switch at the top of the panel) is a second layer for marking places whose colour should change.
  It's saved with the paint.
- Paint files (`.paint.json`) store one mark per face. Cloned faces carry colour mark 16, and the file's `clones` field
  lists each one with the face it copies, as pairs of 32-bit numbers (base64).
- Found pieces are kept in the browser. File, then Save found pieces to a file, writes a `.pieces.json`.

</details>

## Folder

- `index.html` is the whole tool.
- `vendor/` holds three.js and its loaders.
- `finder/` holds the piece finder: `finder_core.js` and the outline model it runs (`model/`).

## Good for

Splitting a character mesh into separate clothing, accessories, props and body parts; separating clothes from an
AI-generated 3D character so they can be fitted, rigged or swapped; cutting up scanned or photogrammetry models;
preparing game assets for Unity, Unreal, Godot or Blender. It is a browser-based mesh segmentation tool (paint to
select, fill by colour and folds, plus an automatic piece finder built on Segment Anything) that reads GLB, glTF, OBJ,
FBX, STL and PLY and exports each piece as its own GLB.

## Disclosure
MeshShears is AI-made (built by the developer with AI help).

## Credits and licence

MeshShears is MIT licensed (see `LICENSE`). It's built on three.js, uses Meta's SAM 2.1 model for the piece finder
(Apache 2.0) run by Microsoft's ONNX Runtime Web (MIT), and Google's Draco decoder (Apache 2.0). Full details are in
`THIRD_PARTY.md`.
