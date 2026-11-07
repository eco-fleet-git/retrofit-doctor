# Task019 coordinator review

7 November 2026. User requested shorter lower-table labels, icons with a legend, no overlaps, screenshots, and preservation of Ps/Pd/Q. Claude Code implemented; Codex verified through CUA in the running local app.

- Baseline screenshot confirms availability pills overlapping the adjacent action column and long sensor headers splitting mid-word at 1161 px.
- Final table uses Ps, Pd, Q, n, V, I with a bilingual legend above, installed/missing marks, and one compact Data column. Chart/play/document links have accessible names and hover labels. The visible TEST badge distinguishes blind-test passports; no health status is implied.
- Screenshots inspected in RU and EN, desktop1440/default1161, narrower1280/940 and mobile390. No text collisions or page-wide horizontal overflow observed. Table/container widths match at1440 (1120 px),1280 (960 px),940 (620 px). On390 the560 px table scrolls inside a326 px region.
- Mobile keyboard Tab from PUMP-01 focuses its review icon, shows a solid focus outline and automatically scrolls the table horizontally (234 px), with no page overflow.
- Verified functional icon routes: P04 recorded review, P08 baseline replay, P10 passport-only inventory. All12 rows' rendered hrefs, titles and accessible labels were inspected; P08 has two data links, test pumps only passport links plus TEST.
- Found a pre-existing replay-chart runtime error during icon verification: local numeric `L` shadowed the language helper `L()`. Claude extracted the trend renderer to `web/js/trend.js` and renamed the margin. Added regression coverage for EN/RU, dense/sparse and narrow/desktop rendering. After fix, actual P08 replay displays two charts in both languages, including through the new icon link. No new console warnings/errors captured after the fix/reload.
- Coordinator independently reran web tests: **100 passed, 0 failed**. Whitespace check clean; frozen data files are unchanged.

Screenshots: `review/task019/`, including the baseline and final table in both languages. Default browser viewport restored; app left at the Russian coverage table. Video remains paused. No paid services used.
