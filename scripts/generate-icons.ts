/**
 * Render PNG variants of the Tee Time logo from the SVG masters in
 * assets/logo/. Uses sharp so it runs anywhere Node runs.
 *
 * Outputs into assets/images/ (paths referenced by app.json):
 *   icon.png             1024×1024  master app icon
 *   adaptive-icon.png    1024×1024  Android foreground
 *   splash-icon.png      1024×1024  Expo splash image
 *   favicon.png          48×48      web favicon
 */

import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'logo');
const OUT = path.join(ROOT, 'assets', 'images');

type Job = {
  svg: string;
  out: string;
  size: number;
  background?: string;
};

const jobs: Job[] = [
  { svg: 'icon.svg',          out: 'icon.png',          size: 1024 },
  { svg: 'adaptive-icon.svg', out: 'adaptive-icon.png', size: 1024 },
  { svg: 'splash.svg',        out: 'splash-icon.png',   size: 1024 },
  { svg: 'icon.svg',          out: 'favicon.png',       size: 48 },
];

async function main() {
  await fs.mkdir(OUT, { recursive: true });

  for (const job of jobs) {
    const inPath = path.join(SRC, job.svg);
    const outPath = path.join(OUT, job.out);
    const svgBuf = await fs.readFile(inPath);
    let pipeline = sharp(svgBuf, { density: 384 }).resize(job.size, job.size);
    if (job.background) {
      pipeline = pipeline.flatten({ background: job.background });
    }
    await pipeline.png().toFile(outPath);
    console.log(`OK ${job.svg} -> ${path.relative(ROOT, outPath)} (${job.size}x${job.size})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
