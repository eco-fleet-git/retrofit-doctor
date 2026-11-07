// Portfolio overview (Task020). Pure, no DOM.
// 1) Challenge data: site groups derived from the supplied asset passports (asset.site). Sites are organisational
//    groupings only, never piping connections. Review availability is unknown until the comparison bundle loads.
// 2) Scale scenario: a separate, deterministic, AUTHORED illustration of 200 SIM-prefixed pumps at 20 fictional
//    sites. It never uses benchmark IDs, counts, routes or diagnostic calculations; its states are examples, not
//    predictions or monitoring results.
import { availabilityKinds } from './overview.js';

export const siteKind = (site) => (/^vessel\b/i.test(site) ? 'vessel' : 'plant');
// "Vessel A (RoPax, fictional)" -> "Vessel A"; the full source name stays available for titles.
export const siteShort = (site) => String(site).replace(/\s*\(.*\)\s*$/, '');

// cases === null means the review bundle is still loading or failed: review membership is then unknown and an
// asset without a replay is NOT classified as passport-only.
export function siteGroups(assets, cases) {
  const known = Array.isArray(cases);
  const bySite = new Map();
  for (const a of assets) {
    if (!bySite.has(a.site)) bySite.set(a.site, []);
    const kinds = known ? availabilityKinds(a, cases) : (a.mode === 'VALIDATION_REPLAY' ? ['replay'] : []);
    bySite.get(a.site).push({ assetId: a.assetId, kinds, blindTest: a.split === 'test', reviewKnown: known });
  }
  return [...bySite.entries()].sort(([x], [y]) => x.localeCompare(y)).map(([site, pumps]) => ({
    site, short: siteShort(site), kind: siteKind(site),
    pumps: pumps.sort((p, q) => p.assetId.localeCompare(q.assetId)),
    count: pumps.length,
    reviews: known ? pumps.filter((p) => p.kinds.includes('review')).length : null,
    replays: pumps.filter((p) => p.kinds.includes('replay')).length,
    passportOnly: known ? pumps.filter((p) => p.kinds.includes('inventory')).length : null,
    blindTest: pumps.filter((p) => p.blindTest).length,
  }));
}

// ---- Scale scenario (authored, deterministic) ----
export const SIM_FLAGS = ['inspection', 'measurement', 'missing', 'none'];
export const SIM_PARTITION = { inspection: 12, measurement: 18, missing: 10, none: 160 };
const SIM_SITES = 20; const PER_SITE = 10;
// Authored example issues and advisory checks per flag (illustration text, keyed for EN/RU in the UI).
const SIM_TEMPLATES = {
  inspection: ['vibTrend', 'bearingTemp', 'currentRise'],
  measurement: ['flowCurve', 'suctionStep', 'pressureNoise'],
  missing: ['noData', 'gatewayGap'],
  none: [null],
};

function lcg(seed) { let x = seed >>> 0; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 2 ** 32; }; }

export function scaleScenario() {
  const sites = Array.from({ length: SIM_SITES }, (_, i) => ({
    id: `SIM-S${String(i + 1).padStart(2, '0')}`, kind: i % 2 === 0 ? 'vessel' : 'plant', index: Math.floor(i / 2) + 1,
  }));
  const pumps = [];
  sites.forEach((s, si) => { for (let k = 0; k < PER_SITE; k += 1) pumps.push({ id: `SIM-${String(si * PER_SITE + k + 1).padStart(3, '0')}`, siteId: s.id, flag: 'none', issue: null }); });
  // Deterministic shuffle (fixed seed), then assign the authored partition.
  const order = pumps.map((_, i) => i); const rnd = lcg(20261107);
  for (let i = order.length - 1; i > 0; i -= 1) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  let pos = 0;
  for (const flag of ['inspection', 'measurement', 'missing']) {
    for (let n = 0; n < SIM_PARTITION[flag]; n += 1) {
      const p = pumps[order[pos]]; pos += 1;
      p.flag = flag; p.issue = SIM_TEMPLATES[flag][n % SIM_TEMPLATES[flag].length];
    }
  }
  const siteSummary = sites.map((s) => {
    const ps = pumps.filter((p) => p.siteId === s.id);
    return { ...s, count: ps.length, ...Object.fromEntries(SIM_FLAGS.map((f) => [f, ps.filter((p) => p.flag === f).length])) };
  });
  return { simulated: true, sites: siteSummary, pumps };
}

export function scenarioTotals(sc) {
  return Object.fromEntries(SIM_FLAGS.map((f) => [f, sc.pumps.filter((p) => p.flag === f).length]));
}

// Pumps for the scenario list: optional site and flag filters ('all' = no filter).
export function filterScenario(sc, { siteId = null, flag = 'all' } = {}) {
  return sc.pumps.filter((p) => (!siteId || p.siteId === siteId) && (flag === 'all' || p.flag === flag));
}
