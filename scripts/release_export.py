"""Task007 release export adapter for the selected artifact: unchanged causal B1 (k=6, persistence=15).

  python scripts/release_export.py selfcheck      # interpreter/seed/dependency pin report, no data access
  python scripts/release_export.py dev-check      # phase 1: adapter on train+validation, parity, schema, cutpoints
  python scripts/release_export.py dev-prefix-audit  # phase 1: registered prefix audit on train+validation
  python scripts/release_export.py repeat-check   # phase 1: fresh pinned processes give identical bytes; seed guard
  python scripts/release_export.py manifest       # phase 1: write the PROPOSED release manifest
  python scripts/release_export.py export         # phase 2 ONLY: refuses unless the coordinator gate is recorded

Seed policy: B1 diagnosis iterates a Python set (AUDIT A03); outputs are reproducible only with
PYTHONHASHSEED=0 set at interpreter start. `main()` checks the pin before importing data code. If it is
missing or wrong, it re-executes the same interpreter once with PYTHONHASHSEED=0; if the pin is still not
in effect (or relaunch is disabled) it exits with status 3 before any data access. Batch replay with a
zero additional ingestion-lag assumption: an alert at t uses only windows closed by t.
"""
from __future__ import annotations

import os
import sys

PINNED_PYTHON = (3, 13, 16)
RELAUNCH_FLAG = "RD_RELEASE_RELAUNCHED"
NO_RELAUNCH = "RD_RELEASE_NO_RELAUNCH"


def seed_pinned():
    """True only when PYTHONHASHSEED=0 was in effect at interpreter start (hash randomization off)."""
    return os.environ.get("PYTHONHASHSEED") == "0" and sys.flags.hash_randomization == 0


def ensure_pinned():
    if seed_pinned():
        return
    if os.environ.get(RELAUNCH_FLAG) == "1" or os.environ.get(NO_RELAUNCH) == "1":
        sys.stderr.write("REFUSED: PYTHONHASHSEED=0 is not in effect at interpreter start; no data accessed.\n")
        sys.exit(3)
    env = dict(os.environ, PYTHONHASHSEED="0", PYTHONDONTWRITEBYTECODE="1", **{RELAUNCH_FLAG: "1"})
    os.execve(sys.executable, [sys.executable, "-B", *sys.argv], env)


def ensure_environment(root):
    """Python version and every locked dependency must match before data access."""
    from importlib.metadata import PackageNotFoundError, version
    problems = []
    if sys.version_info[:3] != PINNED_PYTHON:
        problems.append(f"python {sys.version.split()[0]} != {'.'.join(map(str, PINNED_PYTHON))}")
    for line in (root / "requirements.lock.txt").read_text().split():
        name, want = line.split("==")
        try:
            have = version(name)
        except PackageNotFoundError:
            have = None
        if have != want:
            problems.append(f"{name} {have} != {want}")
    if problems:
        sys.stderr.write("REFUSED: environment differs from the pinned release: " + "; ".join(problems) + "\n")
        sys.exit(4)


# --- data-free helpers (importable by tests) -------------------------------------------------------------

from pathlib import Path  # noqa: E402
import hashlib  # noqa: E402
import json  # noqa: E402
import re  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "vendor/benchmark"
DATA = VENDOR / "data/full"
TEMPLATE = VENDOR / "submission_template/predictions_template.csv"
OUT = ROOT / "results/release"
GATE = OUT / "BLIND_GATE.json"
MANIFEST = OUT / "release_manifest.proposed.json"
OUTPUT = OUT / "predictions_test.csv"
TARGETS = ("PUMP-10", "PUMP-11", "PUMP-12")  # approved blind-test scope; never derived from metadata at export
FEATURE_SHA256 = "de25928738c45a5d6608d6c1a3e6e3eb69d612d23e99a9f184f3b23db4d9c52c"
FEATURE_BYTES = 10_433_571
CODE = ["scripts/release_export.py", "src/retrofit_doctor/causal_b1.py",
        "vendor/benchmark/src/retrofit_sim/baselines.py", "vendor/benchmark/src/retrofit_sim/scoring.py",
        "requirements.lock.txt"]
TIME_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
# Preregistered prefix-invariance clocks, as offsets from each asset's metadata window_start_utc (seconds).
# Commissioning boundary +-1 s and +60 s, first-day points, then daily cutpoints; plus window_end - 60 s.
PREFIX_OFFSETS_S = (2700, 21600, 43200, 86399, 86400, 86401, 86460, 129600, 172800, 259200, 345600, 432000, 518400)
PREFIX_END_MINUS_S = 60


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def template_columns():
    return TEMPLATE.read_text().splitlines()[0].split(",")


def validate_submission(df, assets):
    """Schema/content checks against the organizer template and scorer vocabularies; returns problems."""
    import pandas as pd
    from retrofit_sim.scoring import CLASSES, FAULT_TYPES
    problems = []
    if list(df.columns) != template_columns():
        return [f"columns {list(df.columns)} != template {template_columns()}"]
    if df[["asset_id", "alert_time_utc", "event_class", "fault_type", "confidence"]].isna().any().any():
        problems.append("missing value in a required column")
    unknown = sorted(set(df.asset_id) - set(assets.asset_id))
    if unknown:
        problems.append(f"asset outside target set: {unknown}")
    bad_t = [t for t in df.alert_time_utc if not isinstance(t, str) or not TIME_RE.match(t)]
    if bad_t:
        problems.append(f"{len(bad_t)} timestamps not YYYY-MM-DDTHH:MM:SSZ")
    if not set(df.event_class) <= CLASSES:
        problems.append(f"event_class outside {sorted(CLASSES)}")
    if not set(df.fault_type) <= FAULT_TYPES:
        problems.append("fault_type outside scorer vocabulary")
    conf = pd.to_numeric(df.confidence, errors="coerce")
    if not (conf.notna() & (conf >= 0) & (conf <= 1)).all():
        problems.append("confidence outside [0, 1]")
    if not bad_t and not unknown:
        ws = dict(zip(assets.asset_id, pd.to_datetime(assets.window_start_utc, utc=True)))
        we = dict(zip(assets.asset_id, pd.to_datetime(assets.window_end_utc, utc=True)))
        t = pd.to_datetime(df.alert_time_utc, utc=True)
        if not all(ws[a] <= x <= we[a] for a, x in zip(df.asset_id, t)):
            problems.append("alert outside its asset window")
        key = list(zip(df.asset_id, t))
        if key != sorted(key):
            problems.append("rows not sorted by asset_id, alert_time_utc")
    return problems


def write_csv(df, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(path, index=False, lineterminator="\n", float_format="%.17g")


def canonical(df):
    """Null-safe, dtype-independent text form of every submission field (None/NaN -> '', floats %.17g)."""
    import pandas as pd
    out = pd.DataFrame(index=range(len(df)))
    for c in template_columns():
        col = df[c].reset_index(drop=True) if c in df else pd.Series([None] * len(df))
        if c == "confidence":
            out[c] = ["" if pd.isna(v) else format(float(v), ".17g") for v in col]
        else:
            out[c] = ["" if v is None or (isinstance(v, float) and v != v) else str(v) for v in col]
    return out


def prefix_clocks(asset):
    import pandas as pd
    start, end = pd.Timestamp(asset["window_start_utc"]), pd.Timestamp(asset["window_end_utc"])
    cuts = [start + pd.Timedelta(seconds=s) for s in PREFIX_OFFSETS_S]
    cuts.append(end - pd.Timedelta(seconds=PREFIX_END_MINUS_S))
    return sorted({c for c in cuts if start < c < end})


def prefix_audit(feat, assets, full, predictor=None):
    """Compare every submission field of independent prefix runs with the saved full-run past.
    Returns only pass/fail/count metadata (no prediction values)."""
    import pandas as pd
    predictor = predictor or predict
    rows = []
    for _, asset in assets.sort_values("asset_id").iterrows():
        aid = asset.asset_id
        a = assets[assets.asset_id == aid]
        f = feat[feat.asset_id == aid]
        mine = full[full.asset_id == aid]
        for cut in prefix_clocks(asset):
            prefix = f[pd.to_datetime(f.window_start_utc, utc=True) + pd.Timedelta(minutes=1) <= cut]
            short = predictor(prefix, a.assign(window_end_utc=cut.isoformat()))
            past = mine[pd.to_datetime(mine.alert_time_utc, utc=True) <= cut]
            rows.append({"asset_id": aid, "offset_from_start_s": int((cut - pd.Timestamp(asset.window_start_utc)).total_seconds()),
                         "compared_rows": len(past), "pass": canonical(past).equals(canonical(short))})
    return rows


# --- data access ---------------------------------------------------------------------------------------

def load(ids, allow_test=False):
    """Allowlisted metadata + feature rows by predicate; test assets only after the recorded gate and only
    exactly the approved TARGETS (all with metadata split 'test')."""
    import pandas as pd
    assets = pd.read_csv(DATA / "assets.csv")
    assets = assets[assets.asset_id.isin(ids)].reset_index(drop=True)
    if set(assets.asset_id) != set(ids) or len(assets) != len(set(ids)):
        raise RuntimeError("requested assets missing from or duplicated in metadata")
    if (assets.split == "test").any():
        if not allow_test:
            raise PermissionError("test telemetry is closed until the coordinator records the blind gate")
        if tuple(sorted(ids)) != TARGETS or not (assets.split == "test").all():
            raise PermissionError(f"test scope must be exactly {TARGETS} with split 'test'")
    feat = pd.read_parquet(DATA / "features_1min.parquet", filters=[("asset_id", "in", sorted(ids))])
    if set(feat.asset_id) != set(ids):
        raise RuntimeError(f"predicate returned {sorted(set(feat.asset_id))}, expected {sorted(ids)}")
    return assets, feat


def predict(feat, assets):
    """Selected artifact: causal B1 at each asset's metadata window end; returns template columns only."""
    from retrofit_sim import baselines as B
    from retrofit_doctor.causal_b1 import causal_features, predict_from_features
    clocks = dict(zip(assets.asset_id, assets.window_end_utc))
    p = predict_from_features(causal_features(feat, assets, clocks), k=6, persist=15)
    p = p[B._COLS].sort_values(["asset_id", "alert_time_utc"], kind="stable").reset_index(drop=True)
    return p[template_columns()]


def _bootstrap():
    sys.path[:0] = [str(ROOT / "src"), str(VENDOR / "src")]


# --- modes ---------------------------------------------------------------------------------------------

def selfcheck():
    from importlib.metadata import version
    print(json.dumps({"python": sys.version.split()[0], "executable": sys.executable,
                      "PYTHONHASHSEED": os.environ.get("PYTHONHASHSEED"),
                      "hash_randomization": sys.flags.hash_randomization, "seed_pinned": seed_pinned(),
                      "relaunched": os.environ.get(RELAUNCH_FLAG) == "1",
                      "pandas": version("pandas"), "numpy": version("numpy"), "pyarrow": version("pyarrow")}))


def dev_run(out_dir):
    """Adapter on train + validation (development splits) into out_dir; used by dev-check and repeat-check."""
    import pandas as pd
    assets = pd.read_csv(DATA / "assets.csv")
    out = Path(out_dir)
    for split in ("train", "validation"):
        ids = sorted(assets[assets.split == split].asset_id)
        a, f = load(ids)
        p = predict(f, a)
        problems = validate_submission(p, a)
        if problems:
            raise RuntimeError(f"{split}: {problems}")
        write_csv(p, out / f"predictions_{split}.csv")


def dev_prefix_audit():
    """Phase 1: the registered test-prefix audit run unchanged on train + validation assets."""
    import pandas as pd
    assets = pd.read_csv(DATA / "assets.csv")
    out = {}
    for split in ("train", "validation"):
        ids = sorted(assets[assets.split == split].asset_id)
        a, f = load(ids)
        full = pd.read_csv(OUT / "dev" / f"predictions_{split}.csv")
        rows = prefix_audit(f, a, full)
        out[split] = {"checked": len(rows), "failures": sum(not r["pass"] for r in rows), "rows": rows}
    (OUT / "dev_prefix_audit.json").write_text(json.dumps(out, indent=2) + "\n")
    print(json.dumps({k: {"checked": v["checked"], "failures": v["failures"]} for k, v in out.items()}))
    if any(v["failures"] for v in out.values()):
        sys.exit(1)


def dev_check():
    import pandas as pd
    from retrofit_doctor.causal_b1 import causal_features, predict_from_features
    from run_b1 import canonical_predictions, same_fields
    dev = OUT / "dev"
    dev_run(dev)
    report = {"phase": 1, "splits": {}}
    for split in ("train", "validation"):
        mine = pd.read_csv(dev / f"predictions_{split}.csv")
        stored = pd.read_csv(ROOT / f"results/causal_b1/predictions_causal_{split}.csv")
        report["splits"][split] = {"rows": len(mine), "assets": sorted(set(mine.asset_id)),
                                   "parity_with_released_causal_b1": same_fields(
                                       canonical_predictions(stored), canonical_predictions(mine)),
                                   "sha256": sha256(dev / f"predictions_{split}.csv")}
    cuts = pd.read_csv(ROOT / "results/causal_b1/causality_audit.csv")
    rows = []
    assets_all = pd.read_csv(DATA / "assets.csv")
    for aid, cc in cuts.groupby("asset_id", sort=True):
        a, f = load([aid])
        full = predict(f, a)
        for cut in pd.to_datetime(cc.cutoff_utc, utc=True):
            prefix = f[pd.to_datetime(f.window_start_utc, utc=True) + pd.Timedelta(minutes=1) <= cut]
            short = predict_from_features(causal_features(prefix, a, {aid: cut}), k=6, persist=15)
            past = full[pd.to_datetime(full.alert_time_utc, utc=True) <= cut]
            rows.append({"asset_id": aid, "cutoff_utc": cut.isoformat(),
                         "match": same_fields(canonical_predictions(past), canonical_predictions(short))})
    audit = pd.DataFrame(rows)
    audit.to_csv(OUT / "dev_cutpoint_audit.csv", index=False)
    report["stored_cutpoints"] = {"checked": len(audit), "failures": int((~audit.match).sum()),
                                  "assets": sorted(set(audit.asset_id))}
    report["test_assets_in_metadata"] = sorted(assets_all[assets_all.split == "test"].asset_id)
    report["test_telemetry_loaded"] = False
    (OUT / "dev_check.json").write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps(report, indent=2))
    ok = all(s["parity_with_released_causal_b1"] for s in report["splits"].values()) and not report["stored_cutpoints"]["failures"]
    if not ok:
        sys.exit(1)


def repeat_check():
    import subprocess
    import tempfile
    results = {}
    with tempfile.TemporaryDirectory() as tmp:
        digests = []
        for i in range(2):
            d = Path(tmp) / f"run{i}"
            env = {k: v for k, v in os.environ.items() if k not in ("PYTHONHASHSEED", RELAUNCH_FLAG)}
            subprocess.run([sys.executable, "-B", __file__, "dev-run", str(d)], env=env, check=True, cwd=ROOT)
            digests.append({p.name: sha256(p) for p in sorted(d.glob("*.csv"))})
        results["fresh_processes_identical"] = digests[0] == digests[1]
        results["digests"] = digests[0]
    base = {k: v for k, v in os.environ.items() if k not in ("PYTHONHASHSEED", RELAUNCH_FLAG, NO_RELAUNCH)}
    r = subprocess.run([sys.executable, __file__, "selfcheck"], env={**base, "PYTHONHASHSEED": "1"},
                       capture_output=True, text=True, cwd=ROOT)
    results["wrong_seed_relaunches_pinned"] = r.returncode == 0 and json.loads(r.stdout)["seed_pinned"]
    r = subprocess.run([sys.executable, __file__, "dev-run", "/nonexistent"],
                       env={**base, "PYTHONHASHSEED": "1", NO_RELAUNCH: "1"}, capture_output=True, text=True, cwd=ROOT)
    results["wrong_seed_without_relaunch_refused_before_data"] = r.returncode == 3 and "no data accessed" in r.stderr
    (OUT / "repeat_check.json").write_text(json.dumps(results, indent=2) + "\n")
    print(json.dumps(results, indent=2))
    if not all(v for k, v in results.items() if k != "digests"):
        sys.exit(1)


def manifest():
    import subprocess
    from importlib.metadata import version
    import pandas as pd
    assets = pd.read_csv(DATA / "assets.csv")
    test = assets[assets.split == "test"]
    vendor = json.loads((VENDOR / "MANIFEST.json").read_text())
    feature_entry = next(e for e in vendor["files"] if e["path"].endswith("full/features_1min.parquet"))
    head = subprocess.run(["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True, text=True).stdout.strip()
    dirty = subprocess.run(["git", "status", "--short"], cwd=ROOT, capture_output=True, text=True).stdout.splitlines()
    dev = json.loads((OUT / "dev_check.json").read_text())
    rep = json.loads((OUT / "repeat_check.json").read_text())
    pre = json.loads((OUT / "dev_prefix_audit.json").read_text())
    pre = {k: {"checked": v["checked"], "failures": v["failures"]} for k, v in pre.items()}
    m = {
        "status": "PROPOSED_FOR_COORDINATOR_GATE_NOT_EXECUTED",
        "selected_artifact": {"id": "causal B1 (released control; Task002 C0 = Task008 S0 = Task005 R0)",
                              "parameters": {"k": 6, "persistence_min": 15, "reference_hours": 24}, "per_asset_manual_parameters": False},
        "selection_rationale": "No improved model passed its registered train gates: Task002 C1-C5 (burden/type), Task008 S2/S3 "
                               "(burden/detection), Task005 R1/R2 (seed + causality + type gates); E4 not testable. "
                               "Unchanged causal B1 is released; no improvement claimed.",
        "code_sha256": {p: sha256(ROOT / p) for p in CODE},
        "environment": {"python": ".".join(map(str, PINNED_PYTHON)), "dependencies": "requirements.lock.txt (exact match enforced)",
                        "installed": {line.split("==")[0]: version(line.split("==")[0])
                                      for line in (ROOT / "requirements.lock.txt").read_text().split()}},
        "seed_policy": "PYTHONHASHSEED=0 at interpreter start (enforced by relaunch or exit 3 before data access). "
                       "B1 diagnosis is NOT seed-invariant (AUDIT A03; Task005 measured fault-type changes under seeds 1/7); "
                       "no seed-invariance claim; vendor iteration not edited.",
        "data_identity": {"features_1min.parquet": {"sha256": FEATURE_SHA256, "bytes": FEATURE_BYTES,
                                                    "vendor_manifest_sha256": feature_entry["sha256"],
                                                    "local_sha256": sha256(DATA / "features_1min.parquet"),
                                                    "note": "opaque whole-file hash including test partitions; values not decoded"},
                          "assets.csv": sha256(DATA / "assets.csv"),
                          "predictions_template.csv": sha256(TEMPLATE),
                          "vendor/benchmark/MANIFEST.json": sha256(VENDOR / "MANIFEST.json")},
        "availability_policy": "each asset replayed to its metadata window_end_utc; only closed one-minute windows "
                               "(window_start + 1 min <= clock); missing windows materialized as gateway gaps; zero additional "
                               "ingestion lag assumed; no future windows, no backward fill",
        "reference_policy": "fixed causal commissioning reference: first 24 h from metadata window_start_utc, steady minutes, "
                            "frozen afterwards; no diagnosis from reference-dependent z during commissioning",
        "inputs_used_at_export": ["assets.csv rows for PUMP-10/11/12 (static public metadata)",
                                  "features_1min.parquet rows for PUMP-10/11/12 via predicate, IDs verified"],
        "inputs_never_used": ["any events/labels", "organizer baselines/results/*_test.csv", "hidden configs/generator",
                              "telemetry/ raw partitions", "vibration snapshots", "benign windows for test"],
        "target_assets": list(TARGETS),
        "target_assets_check": {"metadata_test_rows": sorted(test.asset_id), "equals_targets": tuple(sorted(test.asset_id)) == TARGETS},
        "target_channels_from_metadata": {r.asset_id: str(r.channels_available).split("|") for r in test.itertuples()},
        "schema": {"template": "vendor/benchmark/submission_template/predictions_template.csv",
                   "columns": template_columns(), "checks": "validate_submission(): exact header, required non-null, target "
                   "assets only, YYYY-MM-DDTHH:MM:SSZ, scorer class/type vocabulary, confidence in [0,1], inside asset window, sorted"},
        "prefix_invariance_audit": {
            "registered_offsets_from_window_start_s": list(PREFIX_OFFSETS_S), "plus": f"window_end - {PREFIX_END_MINUS_S} s",
            "comparison": "independent prefix run (closed windows <= clock, clock = cut) vs saved full-run alerts <= cut; every "
                          "submission column via canonical(): text, None/NaN -> '', confidence %.17g; exact equality",
            "output": "results/release/test_prefix_audit.json with pass/fail and compared-row counts only; no values, no labels",
            "on_failure": "disclosed; predictions stay immutable; no tuning"},
        "output": {"path": str(OUTPUT.relative_to(ROOT)), "extra_files": ["execution_manifest.json", "predictions_test.sha256", "test_prefix_audit.json"],
                   "diagnostics_outside_submission_columns": True},
        "exposure_log": {
            "train": "fully exposed (all Task001-008/005 development)",
            "validation": "inspected repeatedly; descriptive only",
            "test_metadata": "assets.csv rows (public static metadata) used by UI and this manifest",
            "test_opaque_hash_reads": "vendor MANIFEST integrity checks hashed test partitions, the shared feature parquet and "
                                      "3 organizer test-prediction CSVs as bytes; never parsed",
            "test_measurements": "never loaded before the gate"},
        "phase1_checks": {"dev_check": dev, "repeat_check": rep, "dev_prefix_audit_registered_offsets": pre},
        "git": {"head": head, "uncommitted_at_manifest_time": dirty},
        "post_export_statement": "Test predictions exported; quality unknown (no organizer labels/scoring available)",
        "repeat_policy": "infrastructure-only repeat with identical artifact; prior predictions must be byte-identical; reason disclosed",
        "created_at": pd.Timestamp.now(tz="UTC").isoformat()}
    MANIFEST.write_text(json.dumps(m, indent=2) + "\n")
    print(f"wrote {MANIFEST.relative_to(ROOT)} sha256={sha256(MANIFEST)}")


def export():
    """Phase 2. Refuses before any test data access unless the coordinator gate matches this manifest/code."""
    if not GATE.exists():
        sys.stderr.write("REFUSED: no coordinator blind gate recorded (results/release/BLIND_GATE.json); no data accessed.\n")
        sys.exit(5)
    gate = json.loads(GATE.read_text())
    m = json.loads(MANIFEST.read_text())
    if not gate.get("approved") or gate.get("manifest_sha256") != sha256(MANIFEST):
        sys.stderr.write("REFUSED: gate does not approve this exact manifest; no data accessed.\n")
        sys.exit(5)
    changed = [p for p, h in m["code_sha256"].items() if sha256(ROOT / p) != h]
    ident = m["data_identity"]
    if sha256(DATA / "features_1min.parquet") != FEATURE_SHA256:
        changed.append("features_1min.parquet")
    if sha256(DATA / "assets.csv") != ident["assets.csv"]:
        changed.append("assets.csv")
    if sha256(TEMPLATE) != ident["predictions_template.csv"]:
        changed.append("predictions_template.csv")
    if tuple(m["target_assets"]) != TARGETS:
        changed.append("target_assets")
    if changed:
        sys.stderr.write(f"REFUSED: code/data identity changed {changed}; no data accessed.\n")
        sys.exit(5)
    if OUTPUT.exists():
        sys.stderr.write("REFUSED: predictions already exported; use the documented infrastructure-repeat procedure.\n")
        sys.exit(6)
    import pandas as pd
    a, f = load(list(TARGETS), allow_test=True)
    if tuple(sorted(set(f.asset_id))) != TARGETS:
        sys.stderr.write("REFUSED: returned feature IDs differ from the approved targets.\n")
        sys.exit(5)
    p = predict(f, a)
    problems = validate_submission(p, a)
    if problems:
        sys.stderr.write(f"Schema check failed: {problems}\n")
        sys.exit(7)
    write_csv(p, OUTPUT)
    digest = sha256(OUTPUT)
    audit = prefix_audit(f, a, pd.read_csv(OUTPUT))
    (OUT / "test_prefix_audit.json").write_text(json.dumps({
        "registered_offsets_from_window_start_s": list(PREFIX_OFFSETS_S), "plus_window_end_minus_s": PREFIX_END_MINUS_S,
        "checked": len(audit), "failures": sum(not r["pass"] for r in audit), "rows": audit}, indent=2) + "\n")
    (OUT / "predictions_test.sha256").write_text(f"{digest}  {OUTPUT.name}\n")
    (OUT / "execution_manifest.json").write_text(json.dumps({
        "manifest_sha256": gate["manifest_sha256"], "gate": gate, "rows": len(p),
        "rows_per_asset": p.asset_id.value_counts().sort_index().to_dict(), "predictions_sha256": digest,
        "schema_problems": problems, "prefix_audit_failures": sum(not r["pass"] for r in audit),
        "statement": "Test predictions exported; quality unknown",
        "executed_at": pd.Timestamp.now(tz="UTC").isoformat()}, indent=2) + "\n")
    print(f"exported {OUTPUT.relative_to(ROOT)} rows={len(p)} sha256={digest}")


def main(argv):
    ensure_pinned()
    ensure_environment(ROOT)
    _bootstrap()
    sys.path.insert(0, str(ROOT / "scripts"))
    mode = argv[1] if len(argv) > 1 else ""
    if mode == "dev-run":
        dev_run(argv[2])
    else:
        {"selfcheck": selfcheck, "dev-check": dev_check, "dev-prefix-audit": dev_prefix_audit, "repeat-check": repeat_check,
         "manifest": manifest, "export": export}[mode]()


if __name__ == "__main__":
    main(sys.argv)
