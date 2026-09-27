import { chromium } from 'playwright';
import { resolve } from 'node:path';

const [, , htmlPath, outPath, wArg, hArg] = process.argv;
if (!htmlPath || !outPath) {
  console.error('usage: node scripts/render-figure.mjs <html> <out.png> [width] [height]');
  process.exit(1);
}
const width = Number(wArg) || 1600;
const height = Number(hArg) || 900;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width, height },
  deviceScaleFactor: 2,
});
await page.goto('file://' + resolve(htmlPath), { waitUntil: 'networkidle' });
await page.screenshot({ path: outPath });
await browser.close();
console.log(`${outPath} (${width}x${height} @2x)`);
