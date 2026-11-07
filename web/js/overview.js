// Pure overview logic (Task018): data availability per asset, derived counts and the previewed case.
// Availability describes which recorded data exists, never pump health. No DOM access.

// 'review' (a recorded warning review exists), 'replay' (baseline replay dataset), else 'inventory'.
export function availabilityKinds(asset, cases) {
  const k = [];
  if ((cases ?? []).some((c) => c.assetId === asset.assetId)) k.push('review');
  if (asset.mode === 'VALIDATION_REPLAY') k.push('replay');
  if (!k.length) k.push('inventory');
  return k;
}

// Counts overlap by design (an asset can have a review and a replay).
export function overviewCounts(assets, cases) {
  const inventory = assets.filter((a) => availabilityKinds(a, cases).includes('inventory'));
  return {
    total: assets.length,
    reviews: (cases ?? []).length,
    replay: assets.filter((a) => a.mode === 'VALIDATION_REPLAY').length,
    inventory: inventory.length,
    inventoryBlindTest: inventory.filter((a) => a.split === 'test').length,
  };
}

// The previewed case must be one the queue currently shows: keep the stored selection if still visible,
// otherwise the first visible case, otherwise none (a genuine empty preview).
export function selectVisibleCase(visibleCases, selectedId) {
  return visibleCases.find((c) => c.caseId === selectedId) ?? visibleCases[0] ?? null;
}
