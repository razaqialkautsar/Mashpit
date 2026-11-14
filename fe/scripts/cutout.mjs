// Removes a plain white background by flood-filling from the image edges,
// feathers the cut edge, then trims transparent margins.
// Usage: node scripts/cutout.mjs <in.png> <out.webp> [--all removes enclosed white areas too]
import sharp from "sharp";

const [, , input, output] = process.argv;
const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h } = info;
const white = (i) => Math.min(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
const bg = new Uint8Array(w * h);
const stack = [];
const push = (x, y) => {
  if (x < 0 || y < 0 || x >= w || y >= h) return;
  const i = y * w + x;
  if (bg[i] || white(i) < 238) return;
  bg[i] = 1;
  stack.push(i);
};
for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
while (stack.length) {
  const i = stack.pop();
  const x = i % w, y = (i / w) | 0;
  push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
}
if (process.argv.includes("--all")) for (let i = 0; i < w * h; i++) if (white(i) >= 238) bg[i] = 1;
for (let i = 0; i < w * h; i++) {
  if (bg[i]) { data[i * 4 + 3] = 0; continue; }
  const x = i % w, y = (i / w) | 0;
  const edge = (x > 0 && bg[i - 1]) || (x < w - 1 && bg[i + 1]) || (y > 0 && bg[i - w]) || (y < h - 1 && bg[i + w]);
  if (edge) {
    const m = white(i);
    if (m > 120) data[i * 4 + 3] = Math.round(255 * Math.max(0.15, (238 - m) / 118));
  }
}
await sharp(data, { raw: { width: w, height: h, channels: 4 } }).trim().webp({ quality: 88, alphaQuality: 95 }).toFile(output);
const meta = await sharp(output).metadata();
console.log(output, meta.width + "x" + meta.height);
