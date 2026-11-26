import assert from 'node:assert/strict';
import { traceMaskToRings, refineContour } from '../src/geometry/LogoTracer.js';

// Hard (non anti-aliased) masks are the worst case: raw marching squares yields pixel stairs.
function rasterMask(w, h, inside) {
  const m = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = inside(x + 0.5, y + 0.5) ? 1 : 0;
  return m;
}
const turn = r => { let s = 0; for (let i = 0; i < r.length; i++) { const a = r[(i - 1 + r.length) % r.length], b = r[i], c = r[(i + 1) % r.length]; let d = Math.atan2(c[1] - b[1], c[0] - b[0]) - Math.atan2(b[1] - a[1], b[0] - a[0]); while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; s += Math.abs(d); } return s; };

// 1. Disk: smooth, round, no stair-step wobble (total absolute turning ~ 2π)
{
  const cx = 100, cy = 90, R = 60;
  for (const smoothPasses of [0, 1, 4]) {
    const rings = traceMaskToRings(rasterMask(200, 180, (x, y) => Math.hypot(x - cx, y - cy) <= R), 200, 180, { smoothPasses });
    assert.equal(rings.length, 1);
    const errs = rings[0].map(([x, y]) => Math.abs(Math.hypot(x - cx, y - cy) - R));
    assert(Math.max(...errs) < 1.0, `disk radial error ${Math.max(...errs)} (smooth ${smoothPasses})`);
    assert(turn(rings[0]) < 2 * Math.PI * 1.15, `disk wobble ${turn(rings[0])} (smooth ${smoothPasses})`);
  }
}

// 2. Rotated square: straight edges become single lines, corners are rebuilt sharp
{
  const c = [120, 120], half = 60, th = (25 * Math.PI) / 180, co = Math.cos(th), si = Math.sin(th);
  const inside = (x, y) => { const dx = x - c[0], dy = y - c[1]; return Math.abs(dx * co + dy * si) <= half && Math.abs(-dx * si + dy * co) <= half; };
  const rings = traceMaskToRings(rasterMask(240, 240, inside), 240, 240, { smoothPasses: 1 });
  assert.equal(rings.length, 1);
  assert.equal(rings[0].length, 4, `square should be 4 points, got ${rings[0].length}`);
  const truth = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([u, v]) => [c[0] + half * (u * co - v * si), c[1] + half * (u * si + v * co)]);
  for (const p of rings[0]) assert(Math.min(...truth.map(t => Math.hypot(t[0] - p[0], t[1] - p[1]))) < 1.2, `corner off: ${p}`);
}

// 3. Upscaled logo with a hole (letter-like O inside a box), pixelScale > 1
{
  const s = 2, w = 300, h = 200;
  const inside = (x, y) => { const X = x / s, Y = y / s; const box = X > 10 && X < 140 && Y > 10 && Y < 90; return box && Math.hypot(X - 75, Y - 50) > 25; };
  const rings = traceMaskToRings(rasterMask(w, h, inside), w, h, { pixelScale: s, smoothPasses: 1 });
  assert.equal(rings.length, 2);
  const outer = rings.find(r => r.length === 4);
  assert(outer, 'box outline should collapse to 4 straight edges');
  const hole = rings.find(r => r !== outer);
  assert(turn(hole) < 2 * Math.PI * 1.15, `hole wobble ${turn(hole)}`);
}

// 4. refineContour keeps degenerate tiny rings valid
assert(refineContour([[0, 0], [3, 0], [3, 3], [0, 3]]).length >= 3);
console.log('✓ Logo tracer: sub-pixel smooth curves, straight edges and sharp corners (no pixel stair-steps)');
