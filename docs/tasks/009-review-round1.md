# Task009 early coordinator review

The new helper correctly prioritizes named channels, reads the alert's own minute and keeps labels out. Before final QA, fix these wording/data edge cases (do not change the detector or bundle):

1. Communication loss uses a `<30 rows` rule, not necessarily zero rows. Current unconditional gap text “No channel values exist for the gap minutes” is false for partial packets. Distinguish zero rows from incomplete coverage, and describe available values honestly. Add a partial-packet fixture.
2. A measured value with missing z must be “reference comparison unavailable”, not a guessed reason “no reference for this operating mode”. The bundle doesn't establish that reason (commissioning/insufficient reference may apply). Handle `ch.z == null` as well as `ch.z[i] == null`. Add a fixture proving measured/no-z differs from no sample/not installed.
3. Sensor hypothesis currently states coupled channels stay near reference as an observed fact. Attribute this to the detector's rule/source, since it can ignore missing coupled channels and this helper doesn't inspect the whole coupled set. Do not imply unavailable measurements were normal. Similarly retain “reported frozen by the detector”; raw variation/count proof isn't in this bundle.
4. Change checkReason wording from conclusive “separates/shows whether” to “helps distinguish/check/assess”. A single gauge/spectral component is not guaranteed proof of root cause. Keep reasons concise and explicitly proposed engineering checks.
5. Reject/return unavailable for a selected alert beyond view.asOfMs or outside the visible minutes, instead of explaining a future alert with a fallback primary channel. Add a boundary fixture. UI normally filters selection but the pure helper's boundary should be honest.

Continue implementation/layout and handoff; no extra broad experiment runs. Main will review screenshots after these corrections.
