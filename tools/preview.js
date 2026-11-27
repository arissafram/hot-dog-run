// Draws every sprite in sprites/src/ side by side, scaled up, on a light
// checkerboard so clear pixels show. Writes the sheet to the path given.
//   node tools/preview.js out.png [scale]
const fs = require('fs');
const path = require('path');
const P = require('./png');

const dir = path.join(__dirname, '..', 'sprites/src');
const out = process.argv[2] || 'preview.png';
const S = Number(process.argv[3]) || 5;
const names = fs.readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
const imgs = names.map((n) => P.decode(fs.readFileSync(path.join(dir, n))));
const GAP = 12;
const W = imgs.reduce((s, i) => s + i.w * S + GAP, GAP);
const H = Math.max(...imgs.map((i) => i.h)) * S + GAP * 2;
const sheet = { w: W, h: H, d: Buffer.alloc(W * H * 4) };
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const c = ((x >> 3) + (y >> 3)) & 1 ? 255 : 238, o = (y * W + x) * 4;
  sheet.d[o] = sheet.d[o + 1] = sheet.d[o + 2] = c; sheet.d[o + 3] = 255;
}
let ox = GAP;
for (const img of imgs) {
  const oy = H - GAP - img.h * S;  // bottoms line up, like the ground
  for (let y = 0; y < img.h * S; y++) for (let x = 0; x < img.w * S; x++) {
    const i = (((y / S) | 0) * img.w + ((x / S) | 0)) * 4;
    if (img.d[i + 3] < 128) continue;
    img.d.copy(sheet.d, ((oy + y) * W + ox + x) * 4, i, i + 3);
  }
  ox += img.w * S + GAP;
}
fs.writeFileSync(out, P.encode(sheet));
console.log(names.join(' '), '->', out);
