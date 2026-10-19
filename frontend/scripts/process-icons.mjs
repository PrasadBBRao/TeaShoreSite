/**
 * process-icons.mjs — white-background icons
 *
 * New source images (confirmed by pixel scan):
 *   icon-fresh-squeezed.png.jpeg  1600×962   white bg, 63.6% near-white
 *   icon-fast-delivery.png.jpeg   1105×910   white bg, 58%   near-white
 *
 * Strategy (same as ethically-sourced but inverted — bg is white not black):
 *   - brightness >= 220  →  background  →  A=0  (transparent)
 *   - brightness <= 180  →  artwork     →  A=255 (fully opaque palm-brown)
 *   - 181-219            →  anti-alias edge ramp 0→255
 *
 * Target color: palm-brown #4a3325 = rgb(74,51,37)
 */

import Jimp from "jimp";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ASSETS    = path.resolve(__dirname, "../src/assets");

const TR = 74, TG = 51, TB = 37;   // #4a3325

const BG_MIN    = 220;   // >= this  →  white background  →  transparent
const ART_MAX   = 180;   // <= this  →  dark artwork       →  fully opaque
// 181-219: smooth anti-alias ramp

function whiteToTransparent(srcName, outName) {
  return Jimp.read(path.join(ASSETS, srcName)).then(img => {
    const out = new Jimp(img.getWidth(), img.getHeight(), 0x00000000);

    img.scan(0, 0, img.getWidth(), img.getHeight(), (x, y, idx) => {
      const r          = img.bitmap.data[idx];
      const g          = img.bitmap.data[idx + 1];
      const b          = img.bitmap.data[idx + 2];
      const brightness = Math.floor((r + g + b) / 3);

      if (brightness >= BG_MIN) {
        // White/near-white background → transparent
        out.setPixelColor(0x00000000, x, y);
        return;
      }

      let alpha;
      if (brightness <= ART_MAX) {
        // Dark artwork → fully opaque
        alpha = 255;
      } else {
        // Anti-alias ramp: brightness 181-219 → alpha 255→0
        // (lighter = more transparent, darker = more opaque)
        alpha = Math.round(((BG_MIN - brightness) / (BG_MIN - ART_MAX)) * 255);
        alpha = Math.max(0, Math.min(255, alpha));
      }

      out.setPixelColor(Jimp.rgbaToInt(TR, TG, TB, alpha), x, y);
    });

    return out.writeAsync(path.join(ASSETS, outName));
  });
}

async function main() {
  console.log("Processing white-background icons…\n");

  await whiteToTransparent(
    "icon-fresh-squeezed.png.jpeg",
    "icon-fresh-squeezed-processed.png"
  );
  console.log("✓ icon-fresh-squeezed-processed.png");

  await whiteToTransparent(
    "icon-fast-delivery.png.jpeg",
    "icon-fast-delivery-processed.png"
  );
  console.log("✓ icon-fast-delivery-processed.png");

  // ── Verification ──────────────────────────────────────────────────────
  console.log("\nVerifying output:");
  for (const name of [
    "icon-fresh-squeezed-processed.png",
    "icon-fast-delivery-processed.png",
  ]) {
    const img = await Jimp.read(path.join(ASSETS, name));
    const w = img.getWidth(), h = img.getHeight();
    let transparent = 0, opaque = 0, total = 0;

    for (let sy = 0; sy < h; sy += 6) {
      for (let sx = 0; sx < w; sx += 6) {
        const { a } = Jimp.intToRGBA(img.getPixelColor(sx, sy));
        total++;
        if (a === 0)   transparent++;
        if (a === 255) opaque++;
      }
    }

    // Corner check
    const corners = [
      Jimp.intToRGBA(img.getPixelColor(5, 5)).a,
      Jimp.intToRGBA(img.getPixelColor(w - 5, 5)).a,
      Jimp.intToRGBA(img.getPixelColor(5, h - 5)).a,
      Jimp.intToRGBA(img.getPixelColor(w - 5, h - 5)).a,
    ];

    const tPct = Math.round(transparent / total * 100);
    const oPct = Math.round(opaque / total * 100);
    const cornersOk = corners.every(a => a === 0);

    console.log(`\n  ${name}  (${w}×${h})`);
    console.log(`    A=0  (transparent bg): ${tPct}%`);
    console.log(`    A=255 (opaque artwork): ${oPct}%`);
    console.log(`    Corner alphas: ${corners.join(",")} — ${cornersOk ? "✓ all transparent" : "⚠ NOT transparent"}`);
    console.log(`    Status: ${oPct >= 5 && tPct >= 30 && cornersOk ? "✓ GOOD" : "⚠ CHECK"}`);
  }

  console.log("\nDone.");
}

main().catch(err => { console.error(err); process.exit(1); });
