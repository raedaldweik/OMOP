import { useState } from 'react';
import { downloadLastCirce } from '../api';

const DOMAIN_COLORS = {
  Condition:   { bg: 'rgba(220, 53, 69, 0.08)',   border: 'rgba(220, 53, 69, 0.30)',  text: '#C0392B' },
  Drug:        { bg: 'rgba(0, 114, 206, 0.08)',   border: 'rgba(0, 114, 206, 0.30)',  text: '#0072CE' },
  Measurement: { bg: 'rgba(12, 110, 122, 0.08)',  border: 'rgba(12, 110, 122, 0.30)', text: '#0C6E7A' },
  Procedure:   { bg: 'rgba(184, 98, 10, 0.08)',   border: 'rgba(184, 98, 10, 0.30)',  text: '#B8620A' },
  Visit:       { bg: 'rgba(123, 97, 255, 0.08)',  border: 'rgba(123, 97, 255, 0.30)', text: '#7B61FF' },
};

function ConceptItem({ item }) {
  const c = item.concept || {};
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 px-2 rounded text-[10.5px]"
      style={{ background: 'rgba(0,114,206,0.04)' }}>
      <div className="flex-1 min-w-0">
        <div className="font-semibold truncate" style={{ color: 'var(--text)' }}>
          {c.CONCEPT_NAME || `Concept ${c.CONCEPT_ID}`}
        </div>
        <div className="font-mono text-[9.5px] mt-0.5" style={{ color: 'var(--text-dim)' }}>
          {c.VOCABULARY_ID} {c.CONCEPT_ID}
          {item.includeDescendants && ' · +descendants'}
        </div>
      </div>
    </div>
  );
}

function ConceptSetCard({ set, isPrimary }) {
  const items = set.expression?.items || [];
  const includesDesc = items.some(i => i.includeDescendants);
  return (
    <div className="rounded-lg overflow-hidden"
      style={{ background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(0,114,206,0.18)' }}>
      <div className="flex items-center gap-2 px-3 py-2"
        style={{ background: isPrimary ? 'rgba(0,114,206,0.10)' : 'rgba(0,114,206,0.04)',
                 borderBottom: '1px solid rgba(0,114,206,0.10)' }}>
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--gold)' }} />
        <span className="text-[11px] font-bold tracking-tight" style={{ color: 'var(--text)' }}>
          {set.name}
        </span>
        {isPrimary && (
          <span className="text-[8.5px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded ml-1"
            style={{ background: 'var(--gold)', color: 'white' }}>
            Primary
          </span>
        )}
        <div className="flex-1" />
        <span className="text-[9.5px]" style={{ color: 'var(--text-dim)' }}>
          {items.length} concept{items.length !== 1 ? 's' : ''}
          {includesDesc && ' · w/ descendants'}
        </span>
      </div>
      <div className="p-2 space-y-1 max-h-[200px] overflow-y-auto">
        {items.slice(0, 8).map((it, i) => <ConceptItem key={i} item={it} />)}
        {items.length > 8 && (
          <div className="text-[10px] text-center pt-1" style={{ color: 'var(--text-dim)' }}>
            … and {items.length - 8} more
          </div>
        )}
      </div>
    </div>
  );
}

function InclusionRule({ rule, idx }) {
  const cl = rule.expression?.CriteriaList || [];
  const block = cl[0] || {};
  const blockKey = Object.keys(block).find(k => k !== 'StartWindow' && k !== 'Occurrence');
  const occ = block.Occurrence || {};
  const win = block.StartWindow || {};
  const startDays = (win.Start?.Days ?? 0) * (win.Start?.Coeff ?? -1);
  const endDays   = (win.End?.Days   ?? 0) * (win.End?.Coeff   ??  1);

  return (
    <div className="rounded-lg p-2.5"
      style={{ background: 'rgba(200,164,74,0.04)', border: '1px solid rgba(200,164,74,0.20)' }}>
      <div className="flex items-start gap-2">
        <span className="text-[9px] font-bold tracking-widest uppercase shrink-0 mt-0.5"
          style={{ color: '#9B7F2F' }}>
          Rule {idx + 1}
        </span>
        <div className="flex-1 min-w-0">
          <div className="text-[11.5px] font-semibold" style={{ color: 'var(--text)' }}>
            {rule.name}
          </div>
          {rule.description && (
            <div className="text-[10.5px] mt-0.5" style={{ color: 'var(--text-md)' }}>
              {rule.description}
            </div>
          )}
          <div className="flex items-center gap-1.5 mt-1.5 text-[10px] font-mono"
            style={{ color: 'var(--text-dim)' }}>
            <span className="px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(200,164,74,0.10)' }}>
              {occ.Type || 'at_least'} {occ.Count ?? 1}
            </span>
            <span>·</span>
            <span>{blockKey}</span>
            <span>·</span>
            <span>[{startDays}d, {endDays >= 0 ? '+' + endDays : endDays}d] from index</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CohortCanvas({ cohort, characterization }) {
  const [showFullJson, setShowFullJson] = useState(false);
  if (!cohort) return null;

  const meta = cohort._meta || {};
  const conceptSets = cohort.ConceptSets || [];
  const primaryCriteria = cohort.PrimaryCriteria || {};
  const inclusionRules = cohort.InclusionRules || [];
  const primaryBlock = primaryCriteria.CriteriaList?.[0] || {};
  const primaryBlockName = Object.keys(primaryBlock)[0];
  const primaryCodesetId = primaryBlock[primaryBlockName]?.CodesetId;
  const primarySetName = conceptSets.find(cs => cs.id === primaryCodesetId)?.name || '—';
  const firstOccurrence = primaryBlock[primaryBlockName]?.First;
  const priorObs = primaryCriteria.ObservationWindow?.PriorDays;

  // Derive primary domain from Circe block name (e.g. "ConditionOccurrence" → "Condition")
  const blockToDomain = {
    ConditionOccurrence:'Condition', DrugExposure:'Drug',
    Measurement:'Measurement', ProcedureOccurrence:'Procedure',
    VisitOccurrence:'Visit',
  };
  const primaryDomain = blockToDomain[primaryBlockName] || 'Condition';
  const colors = DOMAIN_COLORS[primaryDomain] || DOMAIN_COLORS.Condition;

  return (
    <div className="rounded-xl overflow-hidden animate-slide-up"
      style={{ background: 'rgba(255,255,255,0.72)',
               border: `1px solid ${colors.border}`,
               boxShadow: 'var(--glass-shadow-lg)' }}>

      {/* Header */}
      <div className="px-4 py-3 flex items-start justify-between gap-3"
        style={{ background: colors.bg, borderBottom: `1px solid ${colors.border}` }}>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-[8.5px] font-bold tracking-widest uppercase"
              style={{ color: colors.text }}>
              Cohort Canvas
            </span>
            <span className="text-[8.5px] font-mono px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(0,0,0,0.04)', color: 'var(--text-dim)' }}>
              Circe v2 · CDM ≥ 5.0
            </span>
          </div>
          <h3 className="text-[14px] font-bold leading-tight" style={{ color: 'var(--text)' }}>
            {meta.name || 'Cohort definition'}
          </h3>
          {meta.description && (
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-md)' }}>
              {meta.description}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end shrink-0">
          {characterization?.cohort_size !== undefined && (
            <div className="text-right">
              <div className="text-[9px] font-bold tracking-widest uppercase"
                style={{ color: colors.text }}>Persons</div>
              <div className="text-[20px] font-extrabold leading-none" style={{ color: 'var(--text)' }}>
                {characterization.cohort_size.toLocaleString()}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        {/* Primary criteria summary */}
        <div className="flex items-center gap-2 flex-wrap text-[10.5px]">
          <span className="px-2 py-1 rounded-md font-semibold tracking-tight"
            style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}>
            Entry: {primaryDomain} → {primarySetName}
          </span>
          {firstOccurrence && (
            <span className="px-2 py-1 rounded-md font-semibold"
              style={{ background: 'rgba(26,122,69,0.08)', color: '#1A7A45', border: '1px solid rgba(26,122,69,0.25)' }}>
              First occurrence (incident user)
            </span>
          )}
          {priorObs ? (
            <span className="px-2 py-1 rounded-md font-mono text-[10px]"
              style={{ background: 'rgba(0,0,0,0.04)', color: 'var(--text-md)' }}>
              ≥ {priorObs}d prior obs
            </span>
          ) : null}
        </div>

        {/* Concept sets */}
        <div>
          <p className="text-[8.5px] font-bold tracking-widest uppercase mb-1.5"
            style={{ color: 'var(--text-dim)' }}>
            Concept Sets ({conceptSets.length})
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {conceptSets.map(cs => (
              <ConceptSetCard key={cs.id} set={cs} isPrimary={cs.id === primaryCodesetId} />
            ))}
          </div>
        </div>

        {/* Inclusion rules */}
        {inclusionRules.length > 0 && (
          <div>
            <p className="text-[8.5px] font-bold tracking-widest uppercase mb-1.5"
              style={{ color: 'var(--text-dim)' }}>
              Inclusion Rules ({inclusionRules.length})
            </p>
            <div className="space-y-2">
              {inclusionRules.map((rule, i) => <InclusionRule key={i} rule={rule} idx={i} />)}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1">
          <a href={downloadLastCirce()} download="cohort_definition.json"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-[11px] font-semibold text-white transition-all hover:scale-[1.02]"
            style={{ background: 'var(--gold-grad)', boxShadow: '0 3px 12px rgba(0,114,206,0.30)' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download Circe JSON
          </a>
          <button onClick={() => setShowFullJson(!showFullJson)}
            className="px-3 py-2 rounded-lg text-[11px] font-medium transition-all hover:bg-[rgba(0,114,206,0.05)]"
            style={{ color: 'var(--gold-lo)', border: '1px solid rgba(0,114,206,0.20)' }}>
            {showFullJson ? 'Hide' : 'Show'} raw JSON
          </button>
          <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
            Imports directly into ATLAS via WebAPI.
          </span>
        </div>

        {showFullJson && (
          <pre className="text-[10px] leading-relaxed font-mono p-3 rounded-lg overflow-x-auto max-h-[300px]"
            style={{ background: 'rgba(0,0,0,0.04)', color: 'var(--text-md)',
                     border: '1px solid rgba(0,114,206,0.10)' }}>
            {JSON.stringify(cohort, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
