// Turns the big source art in sprites/art/*.jpg into small transparent pixel
// sprites in sprites/src/*.png.
//   node tools/make_sprites.js
//
// Also draws the bun and hot dog stacks (see the end of this file).
//
// For each image: the white background is flood-filled away from the edges,
// the drawing is trimmed, then shrunk to `height` px by taking the most common
// colour in each block (keeps hard pixel-art edges instead of blurring them).
// Hand edits belong in sprites/src/; re-running this overwrites them.
const fs = require('fs');
const path = require('path');
const jpeg = require('jpeg-js');
const P = require('./png');

const root = path.join(__dirname, '..');

// name -> output height in px (the largest size it's drawn at in the game)
const SPRITES = {
  'hot-dog': 64,
  'grill-kettle': 62,
  'grill-gas': 62
};

const HOLE_MIN = 20000;  // source px: enclosed white areas bigger than this are cut out
const isBackground = (d, i) => d[i] > 228 && d[i + 1] > 228 && d[i + 2] > 222;

function load(name) {
  const img = jpeg.decode(fs.readFileSync(path.join(root, 'sprites/art', name + '.jpg')), { useTArray: true });
  return { w: img.width, h: img.height, d: Buffer.from(img.data) };
}

// Background: near-white pixels connected to the border become transparent
function cutOut(img) {
  const { w, h, d } = img;
  const seen = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop();
    if (seen[p] || !isBackground(d, p * 4)) continue;
    seen[p] = 1;
    d[p * 4 + 3] = 0;
    const x = p % w, y = (p / w) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  // Large near-white areas the edge fill can't reach (e.g. between a grill's
  // legs) are background too; small ones (teeth, eye glints) stay.
  for (let start = 0; start < w * h; start++) {
    if (seen[start] || !isBackground(d, start * 4)) continue;
    const region = [];
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const p = stack.pop();
      region.push(p);
      const x = p % w, y = (p / w) | 0;
      for (const q of [x > 0 && p - 1, x < w - 1 && p + 1, y > 0 && p - w, y < h - 1 && p + w]) {
        if (q === false || seen[q] || !isBackground(d, q * 4)) continue;
        seen[q] = 1;
        stack.push(q);
      }
    }
    if (region.length > HOLE_MIN) for (const p of region) d[p * 4 + 3] = 0;
  }
  return img;
}

// Shrink so the result is `outH` tall; each output pixel takes the most common
// (coarsely bucketed) colour of its block, or stays clear if the block is mostly clear.
function shrink(img, outH) {
  const b = P.bbox(img, 128);
  const srcW = b.x1 - b.x0 + 1, srcH = b.y1 - b.y0 + 1;
  const f = srcH / outH;
  const outW = Math.max(1, Math.round(srcW / f));
  const out = { w: outW, h: outH, d: Buffer.alloc(outW * outH * 4) };
  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      const sx0 = Math.floor(b.x0 + ox * f), sx1 = Math.floor(b.x0 + (ox + 1) * f);
      const sy0 = Math.floor(b.y0 + oy * f), sy1 = Math.floor(b.y0 + (oy + 1) * f);
      const buckets = new Map();
      let solid = 0, total = 0;
      for (let y = sy0; y < sy1; y++) {
        for (let x = sx0; x < sx1; x++) {
          total++;
          const i = (y * img.w + x) * 4;
          if (img.d[i + 3] < 128) continue;
          solid++;
          const key = (img.d[i] >> 5) << 6 | (img.d[i + 1] >> 5) << 3 | (img.d[i + 2] >> 5);
          const e = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0 };
          e.n++; e.r += img.d[i]; e.g += img.d[i + 1]; e.b += img.d[i + 2];
          buckets.set(key, e);
        }
      }
      if (solid * 2 < total) continue;
      let best = null;
      for (const e of buckets.values()) if (!best || e.n > best.n) best = e;
      const o = (oy * outW + ox) * 4;
      out.d[o] = Math.round(best.r / best.n);
      out.d[o + 1] = Math.round(best.g / best.n);
      out.d[o + 2] = Math.round(best.b / best.n);
      out.d[o + 3] = 255;
    }
  }
  return out;
}

for (const [name, height] of Object.entries(SPRITES)) {
  const img = shrink(cutOut(load(name)), height);
  fs.writeFileSync(path.join(root, 'sprites/src', name + '.png'), P.encode(img));
  console.log(name, img.w + 'x' + img.h);
}

// ---- Player frames from the one hot dog drawing ----
// Pixel positions below are for the 64px-tall hot-dog.png made above.
const LEGS_TOP = 50;                         // first row of legs
const EYES = [[26, 15], [32, 15]];           // top-left of each 3x5 eye
const MOUTH = { x0: 26, x1: 33, y0: 21, y1: 23 };
const OUTLINE = [17, 14, 10];                // near-black outline colour

const hotDog = P.decode(fs.readFileSync(path.join(root, 'sprites/src/hot-dog.png')));
const copy = (img) => ({ w: img.w, h: img.h, d: Buffer.from(img.d) });
const at = (img, x, y) => (y * img.w + x) * 4;
const setPx = (img, x, y, rgba) => { const o = at(img, x, y); for (let k = 0; k < 4; k++) img.d[o + k] = rgba[k]; };
const getPx = (img, x, y) => Array.from(img.d.slice(at(img, x, y), at(img, x, y) + 4));
const clearRows = (img, y0) => img.d.fill(0, y0 * img.w * 4);

// Legs are drawn as thick lines through these points (x, y in the 42x64 frame)
// as a dark outline with a brown fill, like the legs in the drawing.
const LEG_OUTLINE = [3, 3, 3, 255], LEG_FILL = [77, 40, 18, 255];
function drawLeg(img, points, size, color) {
  for (let i = 1; i < points.length; i++) {
    const [ax, ay] = points[i - 1], [bx, by] = points[i];
    const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2;
    for (let t = 0; t <= steps; t++) {
      const cx = Math.round(ax + ((bx - ax) * t) / steps), cy = Math.round(ay + ((by - ay) * t) / steps);
      const o = size > 2 ? -1 : 0;
      for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) {
        const x = cx + dx + o, y = cy + dy + o;
        if (x >= 0 && y >= 0 && x < img.w && y < img.h) setPx(img, x, y, color);
      }
    }
  }
}
function withLegs(legs) {
  const img = copy(hotDog);
  clearRows(img, LEGS_TOP + 2);   // keep the hips, redraw everything below
  legs.forEach((points) => drawLeg(img, points, 4, LEG_OUTLINE));
  legs.forEach((points) => drawLeg(img, points, 2, LEG_FILL));
  return img;
}

// run2: legs passing under the body (run1 is the full stride)
const run2 = withLegs([
  [[16, 51], [14, 57], [15, 62], [11, 62]],         // back leg, straight down, foot back
  [[28, 51], [31, 56], [28, 61], [32, 62]]          // front leg, knee forward
]);

// jump: both legs tucked up
const jumpFrame = withLegs([
  [[16, 51], [11, 55], [6, 54]],                    // back leg trailing
  [[28, 51], [34, 54], [33, 58], [37, 58]]          // front leg raised, foot forward
]);

// dead: X eyes and a frown
const dead = copy(hotDog);
const skin = getPx(hotDog, 30, 26);
const ink = [...OUTLINE, 255];
for (const [ex, ey] of EYES) {
  for (let y = ey; y < ey + 5; y++) for (let x = ex; x < ex + 3; x++) setPx(dead, x, y, skin);
  for (const [dx, dy] of [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]]) setPx(dead, ex + dx, ey + 1 + dy, ink);
}
for (let y = MOUTH.y0; y <= MOUTH.y1; y++) for (let x = MOUTH.x0; x <= MOUTH.x1; x++) setPx(dead, x, y, skin);
for (let x = 28; x <= 31; x++) setPx(dead, x, 22, ink);
setPx(dead, 27, 23, ink); setPx(dead, 32, 23, ink);

const frames = { run1: hotDog, run2, jump: jumpFrame, dead };
for (const [name, img] of Object.entries(frames)) {
  fs.writeFileSync(path.join(root, 'sprites/src', name + '.png'), P.encode(img));
}
console.log('player frames:', Object.keys(frames).join(' '));

// ---- Ketchup tub and bun / hot dog stacks, drawn pixel by pixel ----
const BUN = { line: [74, 38, 14], fill: [222, 168, 96], light: [242, 204, 142], dark: [188, 128, 64] };
const DOG = { line: [60, 22, 8], fill: [178, 76, 36], light: [214, 112, 64], dark: [140, 54, 24] };

const blank = (w, h) => ({ w, h, d: Buffer.alloc(w * h * 4) });

// A rounded bar with an outline, a light top row and a dark bottom row
function capsule(img, x0, y0, w, h, c) {
  const r = h / 2;
  const inside = (x, y) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return false;
    const cx = Math.min(Math.max(x + 0.5, r), w - r), cy = r;
    return (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= r * r;
  };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!inside(x, y)) continue;
    const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
    const col = edge ? c.line : y <= 2 ? c.light : y >= h - 3 ? c.dark : c.fill;
    if (x0 + x >= 0 && y0 + y >= 0 && x0 + x < img.w && y0 + y < img.h) setPx(img, x0 + x, y0 + y, [...col, 255]);
  }
}

// A closed bun, with the split showing along the top
function bun(img, x, y) {
  capsule(img, x, y, 24, 10, BUN);
  for (let i = 5; i < 19; i++) setPx(img, x + i, y + 3, [...BUN.dark, 255]);
}

// A hot dog in a bun: the sausage pokes out both ends and over the top
function hotDogInBun(img, x, y) {
  capsule(img, x, y, 28, 7, DOG);
  capsule(img, x + 3, y + 3, 22, 8, BUN);
}

// Bun tower: five buns, a little uneven, with a hot dog on top
const tower = blank(32, 55);
[0, 2, -1, 1, 0].forEach((dx, i) => bun(tower, 3 + dx, 45 - i * 9));
hotDogInBun(tower, 2, 0);

// Hot dog pile: 3, then 2, then 1
const pile = blank(76, 30);
for (let i = 0; i < 3; i++) hotDogInBun(pile, i * 24, 20);
for (let i = 0; i < 2; i++) hotDogInBun(pile, 12 + i * 24, 10);
hotDogInBun(pile, 24, 0);

// Ketchup tub: a red tub, wider at the top, with a white label and a
// mound of ketchup on top
const KETCHUP = { line: [84, 8, 6], fill: [206, 34, 26], light: [236, 82, 64], dark: [158, 20, 16] };
const tub = blank(34, 38);
const TUB_TOP = 10, TUB_H = 28;
for (let y = 0; y < TUB_H; y++) {
  const inset = Math.round((y * 4) / TUB_H);           // sides slope in by 4px
  const x0 = 1 + inset, x1 = 32 - inset;
  for (let x = x0; x <= x1; x++) {
    const edge = x === x0 || x === x1 || y === TUB_H - 1;
    let col = edge ? KETCHUP.line : x <= x0 + 2 ? KETCHUP.light : x >= x1 - 3 ? KETCHUP.dark : KETCHUP.fill;
    if (!edge && y >= 11 && y <= 18) col = y === 11 || y === 18 ? [200, 200, 196] : [246, 244, 238];  // label
    setPx(tub, x, TUB_TOP + y, [...col, 255]);
  }
}
for (let x = 0; x < 34; x++) {                          // rim
  setPx(tub, x, TUB_TOP - 1, [...KETCHUP.line, 255]);
  setPx(tub, x, TUB_TOP, [...(x === 0 || x === 33 ? KETCHUP.line : KETCHUP.light), 255]);
  setPx(tub, x, TUB_TOP + 1, [...(x === 0 || x === 33 ? KETCHUP.line : KETCHUP.dark), 255]);
}
for (let x = 13; x <= 20; x++) for (let y = 14; y <= 17; y++)   // a little tomato on the label
  if ((x - 16.5) ** 2 / 12 + (y - 15.5) ** 2 / 3.2 <= 1) setPx(tub, x, TUB_TOP + y, [...KETCHUP.fill, 255]);
for (const [x, y] of [[16, 12], [17, 12], [15, 13], [16, 13], [17, 13], [18, 13]])   // its stem
  setPx(tub, x, TUB_TOP + y, [60, 140, 40, 255]);
capsule(tub, 4, 2, 26, 10, KETCHUP);                    // ketchup mound
capsule(tub, 11, 0, 12, 6, KETCHUP);
setPx(tub, 14, 2, [255, 236, 230, 255]); setPx(tub, 15, 2, [255, 236, 230, 255]);   // shine
fs.writeFileSync(path.join(root, 'sprites/src/ketchup.png'), P.encode(tub));

fs.writeFileSync(path.join(root, 'sprites/src/bun-tower.png'), P.encode(tower));
fs.writeFileSync(path.join(root, 'sprites/src/hot-dog-pile.png'), P.encode(pile));
console.log('drawn: ketchup bun-tower hot-dog-pile');
