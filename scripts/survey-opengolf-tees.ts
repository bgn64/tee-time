/**
 * One-off survey: fetch a broad sample of OpenGolfAPI courses and look
 * at the SHAPE of /v1/courses/:id/tees and /v1/courses/:id/holes —
 * specifically how often per-hole yardages are present, how the
 * yardages object is keyed, whether tees lack per-hole data, and any
 * other shape variations.
 *
 *   npx tsx scripts/survey-opengolf-tees.ts
 */

import * as fs from 'node:fs';

const BULK_CSV = '.cache/opengolf/opengolfapi-us.csv';

function* sampleIds(): Generator<string> {
  if (!fs.existsSync(BULK_CSV)) {
    console.warn(`bulk CSV not found at ${BULK_CSV} — using only a handful of hard-coded ids`);
    yield 'c4ba81b6-ac7b-4158-808a-1806500b665b';
    return;
  }
  const lines = fs.readFileSync(BULK_CSV, 'utf-8').split('\n');
  // First column is id. Sample every Nth line to spread across the dataset.
  const step = Math.max(1, Math.floor((lines.length - 1) / 30));
  for (let li = 1; li < lines.length; li += step) {
    const line = lines[li];
    if (!line.trim()) continue;
    const firstComma = line.indexOf(',');
    if (firstComma <= 0) continue;
    const id = line.slice(0, firstComma).trim();
    if (id) yield id;
  }
}

type Stats = {
  total: number;
  teesCounts: Record<number, number>;     // tees array length → frequency
  holeCounts: Record<number, number>;     // holes array length → frequency
  teeNameSet: Set<string>;
  teeColorSet: Set<string>;
  teeGenderSet: Set<string>;
  teesMissingRating: number;
  teesMissingSlope: number;
  teesMissingTotalYardage: number;
  holesMissingHcp: number;
  holesWithYardagesObj: number;
  yardageKeyExamples: Set<string>;
  // For each course: tee names declared in /tees vs keys present in /holes' yardages
  teesWithoutAnyYardageRow: number;
  yardageRowsWithoutTee: number;
  courseTeeNameLowercaseEqualsKey: number;
  courseTeeNameLowercaseDifferFromKey: number;
  errors: number;
};

async function main() {
  const stats: Stats = {
    total: 0,
    teesCounts: {},
    holeCounts: {},
    teeNameSet: new Set(),
    teeColorSet: new Set(),
    teeGenderSet: new Set(),
    teesMissingRating: 0,
    teesMissingSlope: 0,
    teesMissingTotalYardage: 0,
    holesMissingHcp: 0,
    holesWithYardagesObj: 0,
    yardageKeyExamples: new Set(),
    teesWithoutAnyYardageRow: 0,
    yardageRowsWithoutTee: 0,
    courseTeeNameLowercaseEqualsKey: 0,
    courseTeeNameLowercaseDifferFromKey: 0,
    errors: 0,
  };

  const inspected: Array<{
    name: string;
    teeNames: string[];
    yardageKeys: string[];
    holeCount: number;
    hasYardages: boolean;
  }> = [];

  let processed = 0;
  for (const id of sampleIds()) {
    try {
      const [teesRes, holesRes] = await Promise.all([
        fetch(`https://api.opengolfapi.org/v1/courses/${id}/tees`),
        fetch(`https://api.opengolfapi.org/v1/courses/${id}/holes`),
      ]);
      if (!teesRes.ok || !holesRes.ok) {
        stats.errors++;
        continue;
      }
      const teesData: any = await teesRes.json();
      const holesData: any = await holesRes.json();
      const tees: any[] = teesData?.tees ?? [];
      const holes: any[] = holesData?.holes ?? [];

      stats.total++;
      stats.teesCounts[tees.length] = (stats.teesCounts[tees.length] ?? 0) + 1;
      stats.holeCounts[holes.length] = (stats.holeCounts[holes.length] ?? 0) + 1;

      // Tee field stats
      for (const t of tees) {
        if (t.tee_name) stats.teeNameSet.add(String(t.tee_name).toLowerCase());
        if (t.tee_color) stats.teeColorSet.add(String(t.tee_color).toLowerCase());
        if (t.gender) stats.teeGenderSet.add(String(t.gender));
        if (t.course_rating == null) stats.teesMissingRating++;
        if (t.slope_rating == null) stats.teesMissingSlope++;
        if (t.total_yardage == null) stats.teesMissingTotalYardage++;
      }

      // Hole field stats
      const allYardageKeys = new Set<string>();
      for (const h of holes) {
        if (h.handicap_index == null) stats.holesMissingHcp++;
        if (h.yardages && typeof h.yardages === 'object' && Object.keys(h.yardages).length > 0) {
          stats.holesWithYardagesObj++;
          for (const k of Object.keys(h.yardages)) {
            stats.yardageKeyExamples.add(k);
            allYardageKeys.add(k);
          }
        }
      }

      // Key-vs-name mapping check
      const teeNamesLower = new Set(tees.map((t) => String(t.tee_name ?? '').toLowerCase()));
      for (const k of allYardageKeys) {
        if (teeNamesLower.has(k)) stats.courseTeeNameLowercaseEqualsKey++;
        else stats.courseTeeNameLowercaseDifferFromKey++;
      }
      for (const lower of teeNamesLower) {
        if (!allYardageKeys.has(lower)) stats.teesWithoutAnyYardageRow++;
      }
      for (const k of allYardageKeys) {
        if (!teeNamesLower.has(k)) stats.yardageRowsWithoutTee++;
      }

      const teeNames = tees.map((t) => String(t.tee_name));
      const yardageKeys = [...allYardageKeys];
      inspected.push({
        name: teesData?.course_name ?? holesData?.course_name ?? id.slice(0, 8),
        teeNames,
        yardageKeys,
        holeCount: holes.length,
        hasYardages: stats.holesWithYardagesObj > 0,
      });

      processed++;
      if (processed >= 20) break;
    } catch (err: any) {
      stats.errors++;
    }
  }

  console.log('\n=========== SAMPLE COURSES ===========');
  for (const r of inspected) {
    const missing = r.teeNames.filter((n) => !r.yardageKeys.includes(n.toLowerCase()));
    const extras = r.yardageKeys.filter((k) => !r.teeNames.map((n) => n.toLowerCase()).includes(k));
    console.log(`  ${r.name.padEnd(40).slice(0, 40)}  holes=${r.holeCount}  tees=[${r.teeNames.join(', ')}]  yardage_keys=[${r.yardageKeys.join(', ')}]`);
    if (missing.length > 0) console.log(`    ⚠ tees without per-hole yardage rows: ${missing.join(', ')}`);
    if (extras.length > 0) console.log(`    ⚠ yardage keys without a matching tee: ${extras.join(', ')}`);
  }

  console.log('\n=========== AGGREGATE ===========');
  console.log(`courses sampled: ${stats.total}    errors: ${stats.errors}`);
  console.log(`tees-count distribution:`, stats.teesCounts);
  console.log(`hole-count distribution:`, stats.holeCounts);
  console.log(`unique tee names seen:`, [...stats.teeNameSet].sort().join(', '));
  console.log(`unique tee colors seen:`, [...stats.teeColorSet].sort().join(', '));
  console.log(`unique gender values:`, [...stats.teeGenderSet].sort().join(', '));
  console.log(`tees missing rating: ${stats.teesMissingRating}  slope: ${stats.teesMissingSlope}  total_yardage: ${stats.teesMissingTotalYardage}`);
  console.log(`holes missing handicap_index: ${stats.holesMissingHcp}`);
  console.log(`holes with non-empty yardages obj: ${stats.holesWithYardagesObj}`);
  console.log(`unique yardages-object keys ever seen:`, [...stats.yardageKeyExamples].sort().join(', '));
  console.log(`name→key match: yardage key = tee_name.toLowerCase() in ${stats.courseTeeNameLowercaseEqualsKey} cases, differs in ${stats.courseTeeNameLowercaseDifferFromKey}`);
  console.log(`tees declared but missing from per-hole yardages: ${stats.teesWithoutAnyYardageRow}`);
  console.log(`per-hole yardage keys with no matching tee: ${stats.yardageRowsWithoutTee}`);
}

void main();

