# Third-party code in this folder

The files in vendor/ come from three.js r128 (https://github.com/mrdoob/three.js, tag r128): three.min.js and, from examples/js, GLTFLoader.js, OBJLoader.js, MTLLoader.js, GLTFExporter.js, FBXLoader.js, STLLoader.js, PLYLoader.js,
DRACOLoader.js, curves/NURBSCurve.js and curves/NURBSUtils.js. They are used unchanged under the MIT licence below.

```
The MIT License

Copyright © 2010-2021 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
```

## Other readers in vendor/

- **fflate 0.6.9** (`fflate.min.js`, used by the FBX reader; https://github.com/101arrowz/fflate), MIT licence, taken
  unchanged from three.js r128 examples/js/libs. Copyright (c) 2020 Arjun Barrett.
- **Draco decoder** (`draco_assets.js`; Google, https://github.com/google/draco), Apache License 2.0 (full text in
  `sam2_LICENSE.txt`, the same licence). The decoder's script and WebAssembly files from three.js r128
  examples/js/libs/draco are wrapped, unchanged, as text and base64 in one script file so the tool works when opened
  from disk.

## The piece finder (finder/model/)

- **SAM 2.1 small** (Segment Anything Model 2, Meta, https://github.com/facebookresearch/sam2), licensed under the
  Apache License 2.0 (full text in `sam2_LICENSE.txt`). Changes made: the checkpoint `sam2.1_hiera_small.pt` was
  converted to ONNX in two parts (image encoder; point prompt encoder with mask decoder), the encoder simplified and
  its matrix weights stored as 8-bit numbers, then each file wrapped as base64 in a script file (`sam_enc.js`,
  `sam_dec.js`) so the tool works when opened from disk.
- **ONNX Runtime Web 1.20.1** (Microsoft, https://github.com/microsoft/onnxruntime), MIT licence (full text in
  `onnxruntime_LICENSE.txt`): `ort.webgpu.min.js` unchanged, wrapped as text in `ort_js.js`; its WebAssembly
  runtime and loader wrapped as base64 and text in `ort_wasm.js` and `ort_glue.js`, with one line of the loader changed so it can run from a blob address (the
  runtime file is handed to it directly).

The page asks Google Fonts for IBM Plex Sans and IBM Plex Mono (SIL Open Font Licence) when online; offline it uses the system font.
