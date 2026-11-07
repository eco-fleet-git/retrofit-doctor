# Coordinator acceptance oracle — Task023

Defined before implementation review. Scope: workflow behavior, not diagnostic accuracy.

## Episodes

Authored lowHead fixture changes at2026-03-02T10:08:00Z. With selectedcut10:09:00Z, oneclosed mismatchminute is supported; at10:10, two; at10:11, three and prototype 'persistent' criterion reached; at10:20, twelve, onset10:08. Appending a future episode cannot change earlier count, onset or recurrence. Gap/transient/within/direction/regimebreak must end currentrun; no fill. Q/n compare to fixed episode anchor to prevent gradualdrift linking distantregimes. If lookbackstartsinsideepisode report at leastobservedduration. Repeatcount is bounded bylookback and same direction/comparable Q/n only.

## Independent measurements

Synthetic selected10:19 minute baselineapproximately Q149.9m³/h, ΔP284.8kPa. At declared5% comparison band, Q149.9 and ΔP284.8 agree. Q170 differs (about13.4%) while ΔP284.8 agrees: review flowmeasurement/mapping, do not declare installedsensorbroken. Qonly agreeing leavespressureunchecked. Referenceagreement is not mechanicalhealth or diagnosedwear. No baselineQ must never yield agreement againstzero.

A check measured10:19:30 is deferred atcut10:19 and usable as retrospectiveannotation atcut10:20, matchingminute only; actualentrytime remains visible. OriginalassessAt object must be identical before/after checkhistory mutation. Changingcurve/mapping/source or density makes oldcheck historical-only. Savingfailed duequota must not announce saved or change renderedreview. OldsavedSYS001/2/3 remainreadable. Synthetic QA records explicitly carryillustrativeorigin.

## Browser route

Use savedSYS003 fromTask022. Checkonset/duration earlyandlate. Formrequiredinstrument/method, timezone/nonfinitechecks, at leastonevalue andsame-regimeack. Saveillustrativeagreement, reload, languagechange, movetimebeforecheck. Recordlaterdisagreement andensure latesteligibleannotationtakesprecedence withbothretainedinhistory. Ifmeasuredtimesdifferwithinminute, don't claim concurrentcheckbetweenoldandnew values. Mobile390px noverticalnumbercolumns oroverlappingformlabels. Savedcheck data never silently edits originalCSV/curve.
