// Piece finder, the parts that need no browser: outline clean-up, joining outlines onto the model's faces,
// and grouping faces into pieces. Runs in the page and under Node (for the checks).
// The steps follow the tested scripts: automatic outlines (SAM 2 style), lift (outline agreement per edge),
// combine (an edge is only as joined as its least-joined photo set says), merge (regions joined by their whole
// shared border), unseen (faces no photo saw).
(function finderCore(root) {
  "use strict";

  /* ---------- outlines from one photo ---------- */
  const LOW = 256;
  // share of the outline that stays inside when the cut-off moves by +-offset (higher = steadier outline)
  function stability(low, offset) {
    let inter = 0, uni = 0;
    for (let i = 0; i < low.length; i++) { const v = low[i]; if (v > offset) inter++; if (v > -offset) uni++; }
    return uni ? inter / uni : 0;
  }
  // box [x0, y0, x1, y1] of the pixels above zero (scaled to the photo)
  function lowBox(low, sx, sy) {
    let x0 = LOW, y0 = LOW, x1 = -1, y1 = -1;
    for (let y = 0; y < LOW; y++) for (let x = 0; x < LOW; x++) if (low[y * LOW + x] > 0) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? [0, 0, 0, 0] : [x0 * sx, y0 * sy, x1 * sx, y1 * sy];
  }
  function maskBox(m, w, h) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) { const o = y * w; for (let x = 0; x < w; x++) if (m[o + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
    return x1 < 0 ? [0, 0, 0, 0] : [x0, y0, x1, y1];
  }
  // keep the best-scoring boxes, dropping any that overlap a kept one by more than t (intersection over union)
  function nms(boxes, scores, t) {
    const order = scores.map((s, i) => i).sort((a, b) => scores[b] - scores[a] || a - b), sup = new Uint8Array(boxes.length), keep = [];
    const area = boxes.map(b => (b[2] - b[0]) * (b[3] - b[1]));
    for (const i of order) {
      if (sup[i]) continue;
      keep.push(i); const bi = boxes[i];
      for (let j = 0; j < boxes.length; j++) {
        const bj = boxes[j];
        const iw = Math.max(0, Math.min(bi[2], bj[2]) - Math.max(bi[0], bj[0])), ih = Math.max(0, Math.min(bi[3], bj[3]) - Math.max(bi[1], bj[1]));
        const inter = iw * ih; if (inter / Math.max(area[i] + area[j] - inter, 1e-9) > t) sup[j] = 1;
      }
    }
    return keep;
  }
  // 256 x 256 outline numbers to a w x h yes/no picture (bilinear, pixel centres, like the model's own resize)
  function upsample(low, w, h) {
    const out = new Uint8Array(w * h), xs0 = new Int32Array(w), xs1 = new Int32Array(w), fx = new Float32Array(w);
    for (let x = 0; x < w; x++) { const s = Math.min(LOW - 1, Math.max(0, (x + 0.5) * LOW / w - 0.5)); xs0[x] = Math.floor(s); xs1[x] = Math.min(xs0[x] + 1, LOW - 1); fx[x] = s - xs0[x]; }
    for (let y = 0; y < h; y++) {
      const s = Math.min(LOW - 1, Math.max(0, (y + 0.5) * LOW / h - 0.5)), y0 = Math.floor(s), y1 = Math.min(y0 + 1, LOW - 1), fy = s - y0;
      const r0 = y0 * LOW, r1 = y1 * LOW, o = y * w;
      for (let x = 0; x < w; x++) {
        const a = low[r0 + xs0[x]] * (1 - fy) + low[r1 + xs0[x]] * fy, b = low[r0 + xs1[x]] * (1 - fy) + low[r1 + xs1[x]] * fy;
        out[o + x] = a * (1 - fx[x]) + b * fx[x] > 0 ? 1 : 0;
      }
    }
    return out;
  }
  // 8-connected areas of value v; returns [labels (0 = other), sizes (index = label)]
  function components(m, w, h, v) {
    const lab = new Int32Array(w * h), sizes = [0], stack = [];
    let n = 0;
    for (let p = 0; p < w * h; p++) {
      if (m[p] !== v || lab[p]) continue;
      n++; let size = 0; lab[p] = n; stack.push(p);
      while (stack.length) {
        const q = stack.pop(); size++; const x = q % w, y = (q - x) / w;
        for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= w) continue; const r = yy * w + xx;
            if (m[r] === v && !lab[r]) { lab[r] = n; stack.push(r); } } }
      }
      sizes.push(size);
    }
    return [lab, sizes];
  }
  // fill holes (mode "holes") or drop islands ("islands") smaller than area pixels; returns [mask, changed]
  function smallRegions(m, w, h, area, mode) {
    const v = mode === "holes" ? 0 : 1, [lab, sizes] = components(m, w, h, v);
    const n = sizes.length - 1; if (!n) return [m, false];
    let anySmall = false; const keep = new Uint8Array(n + 1);
    for (let i = 1; i <= n; i++) { if (sizes[i] < area) anySmall = true; else keep[i] = 1; }
    if (!anySmall) return [m, false];
    if (mode === "islands" && !keep.some(k => k)) { let b = 1; for (let i = 2; i <= n; i++) if (sizes[i] > sizes[b]) b = i; keep[b] = 1; }
    const out = new Uint8Array(m.length);
    for (let p = 0; p < m.length; p++) { const k = lab[p] ? keep[lab[p]] : 0; out[p] = mode === "holes" ? (m[p] ? 1 : (k ? 0 : 1)) : (k ? 1 : 0); }
    return [out, true];
  }
  // the candidate outlines of one photo (256 x 256 numbers each, with the model's quality guess) to the kept outlines
  // at photo size, smallest first. opts: iou 0.7, stab 0.85, offset 1, nms 0.7, minArea 200
  function keepOutlines(cands, w, h, opts) {
    const o = Object.assign({ iou: 0.7, stab: 0.85, offset: 1, nms: 0.7, minArea: 200 }, opts || {});
    let c = cands.filter(k => k.iou > o.iou && stability(k.low, o.offset) >= o.stab);
    if (!c.length) return [];
    const sx = w / LOW, sy = h / LOW;
    let keep = nms(c.map(k => lowBox(k.low, sx, sy)), c.map(k => k.iou), o.nms);
    c = keep.map(i => c[i]);
    let masks = c.map(k => upsample(k.low, w, h)); const sc = [];
    masks = masks.map(m => { let [a, c1] = smallRegions(m, w, h, o.minArea, "holes"); let [b, c2] = smallRegions(a, w, h, o.minArea, "islands"); sc.push(c1 || c2 ? 0 : 1); return b; });
    keep = nms(masks.map(m => maskBox(m, w, h)), sc, o.nms);
    masks = keep.map(i => masks[i]);
    const area = masks.map(m => { let s = 0; for (let i = 0; i < m.length; i++) s += m[i]; return s; });
    return masks.map((m, i) => i).sort((a, b) => area[a] - area[b] || a - b).map(i => masks[i]);
  }
  // grid points (fractions of the photo) that land on the model; onFig(x, y) says whether a pixel shows it
  function gridPoints(n, w, h, onFig) {
    const pts = [], off = 1 / (2 * n);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const gx = off + i * (1 - 2 * off) / (n - 1), gy = off + j * (1 - 2 * off) / (n - 1);
      if (!onFig || onFig(Math.min(w - 1, Math.floor(gx * w)), Math.min(h - 1, Math.floor(gy * h)))) pts.push([gx, gy]);
    }
    return pts;
  }

  /* ---------- the model's edges ---------- */
  // pairs of faces sharing an edge, in the same order as the tested scripts (edges sorted by their two corners)
  function edgePairs(idx, F) {
    const n = F * 3;
    let nV = 0; for (let i = 0; i < n; i++) if (idx[i] + 1 > nV) nV = idx[i] + 1;
    const lo = new Uint32Array(n), hi = new Uint32Array(n);
    for (let k = 0; k < 3; k++) for (let f = 0; f < F; f++) { const t = k * F + f, a = idx[f * 3 + k], b = idx[f * 3 + (k + 1) % 3]; lo[t] = a < b ? a : b; hi[t] = a < b ? b : a; }
    const cnt = new Uint32Array(nV + 1); for (let t = 0; t < n; t++) cnt[lo[t] + 1]++;
    for (let v = 0; v < nV; v++) cnt[v + 1] += cnt[v];
    const pos = cnt.slice(0, nV), ord = new Uint32Array(n);
    for (let t = 0; t < n; t++) ord[pos[lo[t]]++] = t;
    const fa = [], fb = [];
    for (let v = 0; v < nV; v++) {
      const s0 = cnt[v], s1 = cnt[v + 1]; if (s1 - s0 < 2) continue;
      const g = Array.from(ord.subarray(s0, s1)).sort((p, q) => hi[p] - hi[q] || p - q);
      for (let i = 1; i < g.length; i++) if (hi[g[i]] === hi[g[i - 1]]) { fa.push(g[i - 1] % F); fb.push(g[i] % F); }
    }
    return { fa: Uint32Array.from(fa), fb: Uint32Array.from(fb) };
  }

  /* ---------- lift: outline agreement per edge ---------- */
  function popcount(x) { x -= (x >>> 1) & 0x55555555; x = (x & 0x33333333) + ((x >>> 2) & 0x33333333); return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24; }
  function newEvidence(edges) { const m = edges.fa.length; return { fa: edges.fa, fb: edges.fb, same: new Float64Array(m), both: new Float64Array(m) }; }
  // one photo: ids = face number per pixel (-1 = background, rows top down), masks = kept outlines (yes/no pictures)
  function liftPhoto(ev, ids, masks, F, maxfrac) {
    maxfrac = maxfrac == null ? 0.3 : maxfrac;
    const npx = new Int32Array(F); let figpix = 0;
    for (let p = 0; p < ids.length; p++) if (ids[p] >= 0) { npx[ids[p]]++; figpix++; }
    // which kept outlines hold each face: up to 124 outlines, 31 to a word (the first two words as before)
    const W = 4, words = Array.from({ length: W }, () => new Uint32Array(F)), inm = new Int32Array(F);
    let nm = 0;
    for (const m of masks) {
      let on = 0, tot = 0;
      for (let p = 0; p < ids.length; p++) if (m[p]) { tot++; if (ids[p] >= 0) on++; }
      if (!tot || on / tot < 0.5) continue;            // a background outline
      if (tot > maxfrac * figpix) continue;             // covers most of the model
      inm.fill(0);
      for (let p = 0; p < ids.length; p++) if (m[p] && ids[p] >= 0) inm[ids[p]]++;
      const bit = 1 << (nm % 31), arr = words[Math.floor(nm / 31)];
      for (let f = 0; f < F; f++) if (inm[f] * 2 > Math.max(npx[f], 1)) arr[f] |= bit;
      nm++; if (nm === 31 * W) break;
    }
    const { fa, fb, same, both } = ev, used = Math.ceil(nm / 31);
    for (let j = 0; j < fa.length; j++) {
      const a = fa[j], b = fb[j];
      if (!npx[a] || !npx[b]) continue;
      let con = 0, sep = 0;
      for (let w = 0; w < used; w++) { const x = words[w][a], y = words[w][b]; con += popcount(x | y); sep += popcount(x ^ y); }
      if (!con) continue;
      same[j] += con - sep; both[j] += con;
    }
    return nm;
  }
  // two photo sets of the same model: an edge is only as joined as its least-joined set says
  function combineMin(a, b) {
    const m = a.fa.length, same = new Float64Array(m), both = new Float64Array(m);
    for (let j = 0; j < m; j++) {
      const r0 = a.both[j] > 0 ? a.same[j] / Math.max(a.both[j], 1) : 1, r1 = b.both[j] > 0 ? b.same[j] / Math.max(b.both[j], 1) : 1;
      const tot = a.both[j] + b.both[j]; same[j] = Math.min(r0, r1) * tot; both[j] = tot;
    }
    return { fa: a.fa, fb: a.fb, same, both };
  }

  /* ---------- merge: faces into pieces ---------- */
  // rank of each value among the distinct values (like numpy's unique with return_inverse)
  function rankLabels(v) {
    const u = Array.from(new Set(v)).sort((a, b) => a - b), map = new Map(u.map((x, i) => [x, i])), out = new Int32Array(v.length);
    for (let i = 0; i < v.length; i++) out[i] = map.get(v[i]);
    return out;
  }
  // a small heap of [score, a, b], best score first, then lowest a, then lowest b
  function Heap() { this.h = []; }
  Heap.prototype.less = function (x, y) { return x[0] > y[0] || (x[0] === y[0] && (x[1] < y[1] || (x[1] === y[1] && x[2] < y[2]))); };
  Heap.prototype.push = function (x) { const h = this.h; h.push(x); let i = h.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (!this.less(h[i], h[p])) break; [h[i], h[p]] = [h[p], h[i]]; i = p; } };
  Heap.prototype.pop = function () { const h = this.h, top = h[0], last = h.pop(); if (h.length) { h[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < h.length && this.less(h[l], h[m])) m = l; if (r < h.length && this.less(h[r], h[m])) m = r; if (m === i) break; [h[i], h[m]] = [h[m], h[i]]; i = m; } } return top; };
  // opts.needEvidence: a small region only joins a neighbour on its own when some photo saw their border; small regions
  // with no evidence at all wait until the end and then join the big piece they share the longest border with (so
  // without evidence nothing snowballs into one piece)
  function merge(ev, F, thr, minsize, opts) {
    thr = thr == null ? 0.8 : thr; minsize = minsize == null ? 300 : minsize;
    const needEv = !!(opts && opts.needEvidence);
    const { fa, fb, same, both } = ev;
    // 1. tiny seeds: faces joined only where every photo that saw both agreed, seen at least twice
    const p = new Int32Array(F); for (let i = 0; i < F; i++) p[i] = i;
    const find = x => { let r = x; while (p[r] !== r) r = p[r]; while (p[x] !== r) { const nx = p[x]; p[x] = r; x = nx; } return r; };
    for (let j = 0; j < fa.length; j++) if (both[j] >= 2 && same[j] === both[j]) { const a = find(fa[j]), b = find(fb[j]); if (a !== b) p[b] = a; }
    const rootv = new Int32Array(F); for (let i = 0; i < F; i++) rootv[i] = find(i);
    const comp = rankLabels(rootv); let n = 0; for (let i = 0; i < F; i++) if (comp[i] + 1 > n) n = comp[i] + 1;
    // 2. join neighbouring regions by the agreement along their whole shared border
    const pairs = new Map();
    for (let j = 0; j < fa.length; j++) {
      const ca = comp[fa[j]], cb = comp[fb[j]]; if (ca === cb) continue;
      const k = Math.min(ca, cb) * n + Math.max(ca, cb); let e = pairs.get(k); if (!e) { e = [0, 0, 0]; pairs.set(k, e); }
      e[0] += same[j]; e[1] += both[j]; e[2]++;
    }
    const nb = Array.from({ length: n }, () => new Map());
    for (const k of Array.from(pairs.keys()).sort((x, y) => x - y)) { const e = pairs.get(k), a = Math.floor(k / n), b = k % n; nb[a].set(b, e); nb[b].set(a, e); }
    const size = new Float64Array(n); for (let i = 0; i < F; i++) size[comp[i]]++;
    const alive = new Uint8Array(n).fill(1), par = new Int32Array(n); for (let i = 0; i < n; i++) par[i] = i;
    const score = e => e[1] > 0 ? e[0] / e[1] : 0.5;
    const heap = new Heap();
    for (let a = 0; a < n; a++) for (const [b, e] of nb[a]) if (a < b) heap.push([score(e), a, b]);
    while (heap.h.length) {
      const [sc, a, b] = heap.pop();
      if (!(alive[a] && alive[b]) || !nb[a].has(b) || Math.abs(score(nb[a].get(b)) - sc) > 1e-9) continue;
      if (sc < thr && Math.min(size[a], size[b]) >= minsize) continue;
      if (needEv && sc < thr && !(nb[a].get(b)[1] > 0)) continue;
      join(a, b, true);
    }
    function join(a, b, requeue) {
      alive[b] = 0; par[b] = a; size[a] += size[b];
      nb[a].delete(b); nb[b].delete(a);
      for (const [c, e] of Array.from(nb[b])) {
        nb[c].delete(b);
        if (nb[a].has(c)) { const ea = nb[a].get(c); ea[0] += e[0]; ea[1] += e[1]; ea[2] += e[2]; }
        else { nb[a].set(c, e); nb[c].set(a, e); }
        if (requeue) heap.push([score(nb[a].get(c)), Math.min(a, c), Math.max(a, c)]);
      }
      nb[b] = new Map();
    }
    if (needEv) {
      // the small regions left (no photo saw their border): each joins the big neighbour it shares the longest border
      // with, smallest first, repeated while any can; one that only touches small regions stays as it is
      for (let changed = true; changed;) {
        changed = false;
        const small = []; for (let a = 0; a < n; a++) if (alive[a] && size[a] < minsize) small.push(a);
        small.sort((x, y) => size[x] - size[y] || x - y);
        for (const a of small) {
          if (!alive[a] || size[a] >= minsize) continue;
          let best = -1, bl = -1;
          for (const [c, e] of nb[a]) if (alive[c] && size[c] >= minsize && (e[2] > bl || (e[2] === bl && c < best))) { best = c; bl = e[2]; }
          if (best >= 0) { join(best, a, false); changed = true; }
        }
      }
    }
    const top = x => { while (par[x] !== x) x = par[x]; return x; };
    const lab = new Int32Array(F); for (let i = 0; i < F; i++) lab[i] = top(comp[i]);
    return rankLabels(lab);
  }

  /* ---------- unseen: faces no photo saw ---------- */
  // hidden patches become their own pieces; a small patch inside one seen piece joins it (small), and a crumb
  // between pieces joins the piece it shares the longest border with (tiny)
  function unseen(pieceIn, seen, edges, F, small, tiny) {
    small = small == null ? 3000 : small; tiny = tiny == null ? 500 : tiny;
    const { fa, fb } = edges, piece = Int32Array.from(pieceIn), hid = new Uint8Array(F);
    for (let f = 0; f < F; f++) hid[f] = seen[f] ? 0 : 1;
    // hidden patches, numbered in order of their lowest face
    const p = new Int32Array(F); for (let i = 0; i < F; i++) p[i] = i;
    const find = x => { let r = x; while (p[r] !== r) r = p[r]; while (p[x] !== r) { const nx = p[x]; p[x] = r; x = nx; } return r; };
    for (let j = 0; j < fa.length; j++) if (hid[fa[j]] && hid[fb[j]]) { const a = find(fa[j]), b = find(fb[j]); if (a !== b) { if (a < b) p[b] = a; else p[a] = b; } }
    let base = 0; for (let f = 0; f < F; f++) if (piece[f] + 1 > base) base = piece[f] + 1;
    const hnum = new Map(), sizes = [];
    for (let f = 0; f < F; f++) if (hid[f]) { const r = find(f); let k = hnum.get(r); if (k === undefined) { k = hnum.size; hnum.set(r, k); sizes.push(0); } piece[f] = base + k; sizes[k]++; }
    const nbr = new Map(), border = new Map();
    for (let j = 0; j < fa.length; j++) {
      const x = fa[j], y = fb[j]; if (!(hid[x] ^ hid[y])) continue;
      const hp = hid[x] ? piece[x] : piece[y], sp = hid[x] ? piece[y] : piece[x];
      if (!nbr.has(hp)) nbr.set(hp, new Set()); nbr.get(hp).add(sp);
      const k = hp + "," + sp; border.set(k, (border.get(k) || 0) + 1);
    }
    const best = new Map();
    for (const [k, n] of border) { const [hp, sp] = k.split(",").map(Number); if (!best.has(hp) || n > best.get(hp)[1]) best.set(hp, [sp, n]); }
    const remap = new Map();
    for (const [hp, ss] of nbr) {
      const sz = sizes[hp - base];
      if (ss.size === 1 && sz < small) remap.set(hp, ss.values().next().value);
      else if (sz < tiny) remap.set(hp, best.get(hp)[0]);
    }
    for (let f = 0; f < F; f++) if (remap.has(piece[f])) piece[f] = remap.get(piece[f]);
    return rankLabels(piece);
  }

  /* ---------- very dense models ---------- */
  // On a model with millions of faces most faces are smaller than a pixel in the photos, so no photo shows where one
  // piece meets the next. Faces are first grouped into small connected patches of up to k faces (each grown from a
  // face across its neighbours); the finder then works on patches, and each face takes its patch's piece.
  function facePatches(edges, F, k) {
    const { fa, fb } = edges, deg = new Int32Array(F + 1);
    for (let j = 0; j < fa.length; j++) { deg[fa[j] + 1]++; deg[fb[j] + 1]++; }
    for (let f = 0; f < F; f++) deg[f + 1] += deg[f];
    const pos = deg.slice(0, F), nb = new Int32Array(deg[F]);
    for (let j = 0; j < fa.length; j++) { nb[pos[fa[j]]++] = fb[j]; nb[pos[fb[j]]++] = fa[j]; }
    const patch = new Int32Array(F).fill(-1), queue = new Int32Array(F);
    let n = 0;
    for (let f = 0; f < F; f++) {
      if (patch[f] >= 0) continue;
      let head = 0, tail = 0, cnt = 1; queue[tail++] = f; patch[f] = n;
      while (head < tail && cnt < k) {
        const g = queue[head++];
        for (let i = deg[g]; i < deg[g + 1] && cnt < k; i++) { const h = nb[i]; if (patch[h] < 0) { patch[h] = n; queue[tail++] = h; cnt++; } }
      }
      n++;
    }
    return { patch, n };
  }
  // the pairs of patches that touch, each once
  function patchEdges(edges, patch, n) {
    const seen = new Set(), fa = [], fb = [];
    for (let j = 0; j < edges.fa.length; j++) {
      let a = patch[edges.fa[j]], b = patch[edges.fb[j]]; if (a === b) continue;
      if (a > b) { const t = a; a = b; b = t; }
      const key = a * n + b; if (seen.has(key)) continue;
      seen.add(key); fa.push(a); fb.push(b);
    }
    return { fa: Uint32Array.from(fa), fb: Uint32Array.from(fb) };
  }

  /* ---------- clues from the model itself ---------- */
  // per edge: crease (signed bend between the two faces in radians, positive where the surface folds inwards, as in a
  // seam or where a sleeve meets the arm) and colour step (difference of the texture colours, CIE Lab)
  function edgeCues(edges, nrm, cen, lab) {
    const { fa, fb } = edges, m = fa.length, crease = new Float32Array(m), dcol = new Float32Array(m);
    for (let j = 0; j < m; j++) {
      const a = fa[j] * 3, b = fb[j] * 3;
      const dot = Math.max(-1, Math.min(1, nrm[a] * nrm[b] + nrm[a + 1] * nrm[b + 1] + nrm[a + 2] * nrm[b + 2]));
      const side = (cen[b] - cen[a]) * nrm[a] + (cen[b + 1] - cen[a + 1]) * nrm[a + 1] + (cen[b + 2] - cen[a + 2]) * nrm[a + 2];
      crease[j] = Math.acos(dot) * (side > 0 ? 1 : -1);
      const dl = lab[a] - lab[b], da = lab[a + 1] - lab[b + 1], db = lab[a + 2] - lab[b + 2]; dcol[j] = Math.sqrt(dl * dl + da * da + db * db);
    }
    return { crease, dcol };
  }
  // the outline evidence with every edge's join chance (pj(j), 0..1) folded in: edges the photos agreed on stay seeds,
  // every other edge counts as evidence with weight 1 + its photo count
  // onlyUnseen: only the edges no photo said anything about get a chance from the clues
  function cueEvidence(ev, edges, pj, onlyUnseen) {
    const m = ev.both.length, same = new Float64Array(m), both = new Float64Array(m);
    for (let j = 0; j < m; j++) {
      const b0 = ev.both[j];
      if (onlyUnseen && b0 > 0) { same[j] = ev.same[j]; both[j] = b0; continue; }
      if (b0 >= 2 && ev.same[j] === b0) { same[j] = b0; both[j] = b0; continue; }
      const w = 1 + b0; both[j] = w; same[j] = pj(j) * w;
    }
    return { fa: ev.fa, fb: ev.fb, same, both };
  }

  const api = { LOW, stability, nms, upsample, smallRegions, keepOutlines, gridPoints, edgePairs, newEvidence, liftPhoto, combineMin, merge, unseen, rankLabels, facePatches, patchEdges, edgeCues, cueEvidence };
  // the same code as text, for running it in a background worker
  api.source = "(" + finderCore.toString() + ")(self);";
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.FinderCore = api;
})(typeof self !== "undefined" ? self : this);
