/**
 * Render PNG variants of the Tee Time logo from the SVG masters in
 * assets/logo/. Uses sharp so it runs anywhere Node runs.
 *
 * Outputs into assets/images/ (paths referenced by app.json):
 *   icon-modern-scorecard.png           1024×1024  master app icon
 *   adaptive-icon-modern-scorecard.png  1024×1024  Android foreground
 *   splash-modern-scorecard.png         1024×1024  Expo splash image
 *   favicon.png          48×48      web favicon
 *
 * Outputs into public/ (paths referenced by manifest.json and +html.tsx):
 *   icon-192.png         192×192    PWA icon
 *   icon-512.png         512×512    PWA/maskable icon
 *   apple-touch-icon.png 180×180    iOS web app icon
 *
 * Outputs into assets/logo/:
 *   tee-time-logo.png    1024×1024  standalone publishing/upload asset
 */

import { promises as fs } from 'fs';
import path from 'path';
import sharp from 'sharp';

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assets', 'logo');
const OUT = path.join(ROOT, 'assets', 'images');
const PUBLIC_OUT = path.join(ROOT, 'public');

type Job = {
  svg: string;
  out: string;
  size: number;
  dir?: 'assets' | 'public' | 'logo';
  background?: string;
};

const jobs: Job[] = [
  { svg: 'icon.svg',          out: 'icon-modern-scorecard.png',            size: 1024 },
  { svg: 'adaptive-icon.svg', out: 'adaptive-icon-modern-scorecard.png',   size: 1024 },
  { svg: 'splash.svg',        out: 'splash-modern-scorecard.png',          size: 1024 },
  { svg: 'icon.svg',          out: 'favicon.png',          size: 48 },
  { svg: 'icon.svg',          out: 'icon-192.png',         size: 192, dir: 'public' },
  { svg: 'icon.svg',          out: 'icon-512.png',         size: 512, dir: 'public' },
  { svg: 'icon.svg',          out: 'apple-touch-icon.png', size: 180, dir: 'public' },
  { svg: 'icon.svg',          out: 'tee-time-logo.png',    size: 1024, dir: 'logo' },
];

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  await fs.mkdir(PUBLIC_OUT, { recursive: true });

  for (const job of jobs) {
    const inPath = path.join(SRC, job.svg);
    const outDir = job.dir === 'public' ? PUBLIC_OUT : job.dir === 'logo' ? SRC : OUT;
    const outPath = path.join(outDir, job.out);
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
