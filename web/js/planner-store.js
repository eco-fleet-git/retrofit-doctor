// Per-pump planner drafts in this browser only (Web Storage interface injected for testing).
// Saving is not sending, approving, purchasing or deploying. Nothing leaves the browser.
import { emptyEconomics, economicsProblems, CHOICES, CANDIDATES, COMMON_GATES } from './planner-content.js';

export const DRAFT_SCHEMA = 'retrofit-doctor-planner';
export const DRAFT_VERSION = 1;

export function newDraft(assetId, now) {
  return {
    schema: DRAFT_SCHEMA, version: DRAFT_VERSION, assetId, createdAt: now, updatedAt: now, savedAt: null,
    choice: null, candidates: [], answers: {}, notes: '', economics: emptyEconomics(),
  };
}

// Unversioned drafts (pre-release shape) are completed from defaults; content is kept.
function migrate(raw, assetId, now) {
  const base = newDraft(assetId, raw.createdAt ?? now);
  const economics = raw.economics ? { ...base.economics, ...raw.economics, options: { ...base.economics.options, ...(raw.economics.options ?? {}) } } : base.economics;
  return { ...base, ...raw, schema: DRAFT_SCHEMA, version: DRAFT_VERSION, economics, candidates: raw.candidates ?? [], answers: raw.answers ?? {} };
}

function draftProblems(d) {
  const p = [];
  if (!Array.isArray(d.candidates) || !d.candidates.every((c) => c && typeof c.id === 'string')) p.push('candidates malformed');
  if (d.answers == null || typeof d.answers !== 'object' || Array.isArray(d.answers)) p.push('answers malformed');
  if (d.choice != null && !CHOICES[d.choice]) p.push('unknown review path');
  if (d.notes != null && typeof d.notes !== 'string') p.push('notes malformed');
  return [...p, ...economicsProblems(d.economics)];
}

export function createDraftStore(storage, prefix = 'retrofit-doctor.planner.') {
  const key = (assetId) => `${prefix}${assetId}`;
  const unreadable = {}; // assetId -> raw text kept until it is backed up on the next save
  const fresh = (assetId) => newDraft(assetId, new Date().toISOString());
  return {
    key,
    load(assetId) {
      let text;
      try { text = storage.getItem(key(assetId)); } catch (e) {
        return { status: 'unavailable', draft: fresh(assetId), message: `Browser storage is unavailable (${e.message}). Edits stay in this tab only.` };
      }
      if (text == null) return { status: 'none', draft: fresh(assetId) };
      const corrupt = (why) => {
        unreadable[assetId] = text;
        return { status: 'corrupt', draft: fresh(assetId), message: `The stored draft could not be read (${why}). It is left untouched; a new draft is shown, and saving keeps the old one as a backup.` };
      };
      let raw;
      try { raw = JSON.parse(text); } catch { return corrupt('not valid JSON'); }
      if (!raw || typeof raw !== 'object' || raw.assetId !== assetId) return corrupt('different pump or unknown shape');
      if (raw.version != null && typeof raw.version !== 'number') return corrupt('incompatible version field');
      if (raw.version > DRAFT_VERSION) {
        return { status: 'newer', draft: { ...fresh(assetId), blockedByNewer: true }, message: `A newer draft format (v${raw.version}) is stored. It is left untouched; this version cannot edit it.` };
      }
      const draft = raw.version == null ? migrate(raw, assetId, new Date().toISOString()) : raw;
      const problems = draftProblems(draft);
      if (problems.length) return corrupt(`incompatible: ${problems.slice(0, 2).join('; ')}`);
      return raw.version == null
        ? { status: 'migrated', draft, message: 'An older draft format was upgraded. Save to keep the upgraded version.' }
        : { status: 'loaded', draft };
    },
    save(draft, now) {
      if (draft.blockedByNewer) return { ok: false, message: 'Draft could not be saved: a newer draft format is stored for this pump and would be overwritten.' };
      const toStore = { ...draft, updatedAt: now, savedAt: now };
      const backupKey = `${key(draft.assetId)}.backup-${now}`;
      const hadUnreadable = unreadable[draft.assetId] != null;
      try {
        if (hadUnreadable) storage.setItem(backupKey, unreadable[draft.assetId]);
        storage.setItem(key(draft.assetId), JSON.stringify(toStore));
      } catch (e) {
        return { ok: false, message: `Draft could not be saved (${e.message}). Your edits are kept in this tab; free browser storage or allow site data, then save again.` };
      }
      delete unreadable[draft.assetId];
      draft.updatedAt = now; draft.savedAt = now;
      return { ok: true, message: hadUnreadable ? `Draft saved in this browser. The unreadable earlier draft was kept as backup "${backupKey}".` : 'Draft saved in this browser' };
    },
    remove(assetId) {
      try { storage.removeItem(key(assetId)); return { ok: true }; } catch (e) { return { ok: false, message: e.message }; }
    },
  };
}

export function addCandidate(draft, candidateId, now) {
  if (!CANDIDATES.some((c) => c.id === candidateId) || draft.candidates.some((c) => c.id === candidateId)) return draft;
  draft.candidates.push({ id: candidateId, addedAt: now });
  return draft;
}

export function removeCandidate(draft, candidateId) {
  draft.candidates = draft.candidates.filter((c) => c.id !== candidateId);
  for (const k of Object.keys(draft.answers)) if (k.startsWith(`${candidateId}.`)) delete draft.answers[k];
  return draft;
}

export function draftQuestions(draft) {
  const qs = [];
  if (draft.choice && CHOICES[draft.choice]) {
    for (const [id, label] of CHOICES[draft.choice].gates) qs.push({ key: `choice-${draft.choice}.${id}`, label, scope: CHOICES[draft.choice].title });
  }
  for (const c of draft.candidates) {
    const tpl = CANDIDATES.find((t) => t.id === c.id);
    if (!tpl) continue;
    for (const [id, label] of [...COMMON_GATES, ...tpl.questions]) qs.push({ key: `${c.id}.${id}`, label, scope: tpl.title });
  }
  return qs;
}

const answered = (a) => a && ((a.state === 'drafted' || a.state === 'na') && String(a.text ?? '').trim() !== '');

// UX draft completeness only. Separate from the economic conclusion; never implies approval.
export function reviewReadiness(draft) {
  const questions = draftQuestions(draft);
  if (!draft.choice && draft.candidates.length === 0) {
    return { state: 'NO_SELECTION', label: 'Select an option to prepare a draft', questions, missing: [] };
  }
  const missing = questions.filter((q) => !answered(draft.answers[q.key]));
  return missing.length
    ? { state: 'NEEDS_EVIDENCE', label: 'Needs evidence', questions, missing }
    : { state: 'READY_FOR_REVIEW', label: 'Ready for engineering review', questions, missing };
}

const VALUE_FIELDS = new Set(['quantity', 'unitCost', 'mode', 'includedIn', 'currency', 'allocation.projectTotal']);

// COST_MODEL_SPEC input contract: an edited value becomes a user assumption dated today; the first
// sourced original (basis, source, dates, values) is preserved. The reviewer may then set another
// basis and source when evidence is supplied.
export function editLineValue(line, field, value, today) {
  if (!VALUE_FIELDS.has(field)) { line[field] = value; return line; }
  const get = () => (field === 'allocation.projectTotal' ? line.allocation?.projectTotal : line[field]);
  if (get() === value) return line;
  const sourced = line.basis !== 'unknown' && line.basis !== 'user assumption';
  if (!line.original && sourced) {
    const { basis, source, sourceDate, entryDate, quantity, unitCost, mode, includedIn, currency, quoteScope, quoteValidUntil, taxBasis } = line;
    line.original = { basis, source, sourceDate, entryDate, quantity, unitCost, mode, includedIn, currency, quoteScope, quoteValidUntil, taxBasis, projectTotal: line.allocation?.projectTotal ?? null };
  }
  if (field === 'allocation.projectTotal') line.allocation = { ...(line.allocation ?? { basis: '' }), projectTotal: value };
  else line[field] = value;
  // The new number is unsourced until the reviewer supplies evidence: no inherited source or quote terms.
  if (line.basis !== 'user assumption') Object.assign(line, { basis: 'user assumption', source: '', sourceDate: '', quoteScope: '', quoteValidUntil: '' });
  line.entryDate = today;
  return line;
}

export function editGroupValue(option, group, field, value, today) {
  const values = option[group];
  if (values[field] === value) return option;
  const prov = (option[`${group}Provenance`] ??= { basis: 'unknown', source: '', sourceDate: '', entryDate: '', original: null });
  const sourced = prov.basis !== 'unknown' && prov.basis !== 'user assumption';
  if (!prov.original && sourced) prov.original = { basis: prov.basis, source: prov.source, sourceDate: prov.sourceDate, entryDate: prov.entryDate, values: { ...values } };
  values[field] = value;
  if (prov.basis !== 'user assumption') Object.assign(prov, { basis: 'user assumption', source: '', sourceDate: '' });
  prov.entryDate = today;
  return option;
}
