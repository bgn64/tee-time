import * as fs from 'node:fs';

const csv = fs.readFileSync('.cache/opengolf/opengolfapi-us.csv', 'utf-8');
const lines = csv.split('\n');
const headers = lines[0].split(',');
const idx = (n: string) => headers.indexOf(n);
const parIdxs = Array.from({ length: 18 }, (_, i) => idx('hole_' + (i + 1) + '_par'));
const declIdx = idx('holes');
const parTotIdx = idx('par');

function splitCsv(line: string): string[] {
  const out: string[] = [];
  let f = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          f += '"';
          i++;
        } else q = false;
      } else f += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      out.push(f);
      f = '';
    } else f += c;
  }
  out.push(f);
  return out;
}

let total = 0;
let exact18 = 0;
let exact9 = 0;
let other = 0;
let noHoles = 0;
let gaps = 0;
let contiguous = 0;
let mismatch = 0;
const histo: Record<number, number> = {};

for (let li = 1; li < lines.length; li++) {
  if (!lines[li].trim()) continue;
  const cols = splitCsv(lines[li]);
  if (cols.length < parIdxs[17] + 1) continue;
  total++;
  const declared = parseInt(cols[declIdx] ?? '', 10);
  const filledPositions: number[] = [];
  for (let i = 0; i < 18; i++) {
    const v = (cols[parIdxs[i]] ?? '').trim();
    if (v !== '') filledPositions.push(i + 1);
  }
  const filled = filledPositions.length;
  histo[filled] = (histo[filled] ?? 0) + 1;
  if (filled === 0) {
    noHoles++;
    continue;
  }
  if (filled === 18) exact18++;
  else if (filled === 9) exact9++;
  else other++;
  const isContig = filledPositions.every((n, i) => n === i + 1);
  if (isContig) contiguous++;
  else gaps++;
  if (Number.isFinite(declared) && declared !== filled) mismatch++;
}

console.log('Total rows:', total);
console.log('No holes filled:', noHoles);
console.log('Exactly 18 filled:', exact18);
console.log('Exactly 9 filled:', exact9);
console.log('Other counts:', other);
console.log('Contiguous (1..N filled):', contiguous);
console.log('Has gaps in filled positions:', gaps);
console.log('Declared-vs-actual mismatch:', mismatch);
console.log('Histogram of filled-hole counts:');
for (const k of Object.keys(histo).sort((a, b) => Number(a) - Number(b))) {
  console.log('  ', k, '→', histo[Number(k)]);
}
