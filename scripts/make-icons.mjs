// Generates PWA / Apple icons from an inline SVG. Run: node scripts/make-icons.mjs
import sharp from "sharp";
import { mkdirSync } from "node:fs";

mkdirSync("public", { recursive: true });

const svg = (size, pad = 0) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#000"/>
  <g transform="translate(${pad} ${pad}) scale(${(512 - pad * 2) / 512})">
    <text x="256" y="300" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
      font-weight="800" font-size="168" letter-spacing="-10" fill="#fff">AIO</text>
    <rect x="156" y="336" width="200" height="10" rx="5" fill="#fff" opacity="0.35"/>
  </g>
</svg>`;

const out = [
  ["icon-192.png", 192, 0],
  ["icon-512.png", 512, 0],
  ["icon-maskable-512.png", 512, 60],
  ["apple-touch-icon.png", 180, 0],
];
for (const [name, size, pad] of out) {
  await sharp(Buffer.from(svg(size, pad))).resize(size, size).png().toFile(`public/${name}`);
}
await sharp(Buffer.from(svg(64))).resize(48, 48).png().toFile("src/app/icon.png");
console.log("icons written");
