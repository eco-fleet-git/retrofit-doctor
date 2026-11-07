# Task009 visual review — make the explanation concise

Independently passed 24 explanation/replay tests; viewed actual 1440 and 390 screenshots. The hierarchy is better, but the card is still ~990 px desktop / 2049 px mobile. The next check is buried below repeated cadence paragraphs. This misses the user's clarity priority.

1. Condense the default card: one hypothesis statement (headline + step1 currently repeat it), observed values, short uncertainty summary, next check. Move the long z explanation and full per-channel gap descriptions/last-sample values into technical details. Keep one short visible reference caveat: first-day empirical reference, not verified healthy.
2. Summarize gaps by category without losing distinctions. For the P08 example, a few lines suffice: flow not installed; strainer differential pressure unavailable in benchmark; four installed vibration/bearing channels have no sample in this minute (5-minute cadence), which does not establish normality. The complete list and last observed values remain available in the disclosure. Derive categories/counts from the helper, do not hardcode P08.
3. Sensor headline still says “deviates on its own” as an independent fact. Use “The detector reports…” and keep the long coupled-set caveat in details, not a large paragraph in the main card.
4. Selecting an older alert from history should bring the updated explanation into view with keyboard focus (e.g. focus heading with tabindex=-1 and scrollIntoView). Currently it re-renders above the user but leaves them in the history area. Preserve technical disclosure state appropriately; no focus jump during ordinary replay updates.
5. Remove the unmatched final </div> after the inventory in renderPump's template (old grid wrapper was removed).

Target a noticeably shorter default view (roughly <=650 px desktop and <=1300 px mobile for this P08 card; use judgment, do not shrink text to meet a number). Keep English, readable fonts, all source details, and the scientifically honest changes from round1. Update the affected browser checks/screenshots; then hand off. No broad reruns or detector changes.
