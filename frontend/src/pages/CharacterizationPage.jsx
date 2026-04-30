import { useEffect, useState } from 'react';
import DynamicChart from '../components/DynamicChart';
import { getCdmCharacterization } from '../api';

function KpiTile({ label, value, suffix, sublabel }) {
  return (
    <div className="kpi-card" style={{ padding: '14px 16px' }}>
      <p className="text-[8.5px] font-bold tracking-[0.15em] uppercase mb-1" style={{ color: 'var(--text-faint)' }}>
        {label}
      </p>
      <p className="text-[22px] font-extrabold leading-none" style={{ color: 'var(--text)' }}>
        {value}
        {suffix && <span className="text-[13px] ml-0.5" style={{ color: 'var(--text-dim)' }}>{suffix}</span>}
      </p>
      {sublabel && (
        <p className="text-[9.5px] mt-1" style={{ color: 'var(--text-dim)' }}>{sublabel}</p>
      )}
    </div>
  );
}

function Panel({ title, children, className = '' }) {
  return (
    <div className={`glass-card flex flex-col h-full min-h-0 ${className}`}>
      <div className="glass-card-head shrink-0" style={{ padding: '8px 14px' }}>
        <h3 style={{ fontSize: '9.5px' }}>{title}</h3>
      </div>
      <div className="flex-1 min-h-0 px-2 pb-2 pt-1 relative">{children}</div>
    </div>
  );
}

export default function CharacterizationPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    getCdmCharacterization()
      .then(setData)
      .catch(e => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="max-w-md text-center">
          <p className="text-[13px] mb-2" style={{ color: 'var(--red)' }}>Characterization unavailable</p>
          <p className="text-[11.5px]" style={{ color: 'var(--text-md)' }}>{error}</p>
          <p className="text-[10.5px] mt-3" style={{ color: 'var(--text-faint)' }}>
            Ensure the FastAPI backend is running on port 8000.
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-full p-4 flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-transparent border-t-[var(--gold)] animate-spin" />
      </div>
    );
  }

  // Build chart specs
  const ageChart = {
    type: 'bar', title: 'Age distribution', data: data.age_band || [],
    xKey: 'age_band',
    yKeys: [{ key: 'n', label: 'Persons', color: '#0072CE' }],
  };
  const sexChart = {
    type: 'pie', title: 'Sex',
    data: (data.sex || []).map(s => ({ name: s.sex, value: s.n })),
    xKey: 'name',
    yKeys: [{ key: 'value', label: 'Persons' }],
  };
  const condChart = {
    type: 'bar', title: 'Top 10 conditions',
    data: (data.top_conditions || []).map(c => ({
      name: c.concept_name?.length > 28 ? c.concept_name.slice(0, 27) + '…' : c.concept_name,
      n: c.n_persons,
    })),
    xKey: 'name',
    yKeys: [{ key: 'n', label: 'Persons', color: '#A42548' }],
  };
  const drugChart = {
    type: 'bar', title: 'Top 10 drugs',
    data: (data.top_drugs || []).map(d => ({
      name: d.concept_name?.length > 22 ? d.concept_name.slice(0, 21) + '…' : d.concept_name,
      n: d.n_persons,
    })),
    xKey: 'name',
    yKeys: [{ key: 'n', label: 'Persons', color: '#0072CE' }],
  };
  const drugClassChart = data.drug_classes ? {
    type: 'bar', title: 'Persons by drug class (ATC)',
    data: data.drug_classes.map(d => ({
      name: d.class.length > 28 ? d.class.slice(0, 27) + '…' : d.class,
      n: d.n_persons,
    })),
    xKey: 'name',
    yKeys: [{ key: 'n', label: 'Persons', color: '#0C6E7A' }],
  } : null;
  const t2dmComorbChart = data.t2dm_comorbidities ? {
    type: 'bar', title: 'T2DM comorbidities (% of T2DM cohort)',
    data: data.t2dm_comorbidities.map(c => ({ name: c.condition, pct: c.pct })),
    xKey: 'name',
    yKeys: [{ key: 'pct', label: '%', color: '#B8620A' }],
    yAxisLabel: '%',
  } : null;

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <div className="max-w-[1400px] mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-end justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-[20px] font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
              CDM Characterization
            </h1>
            <p className="text-[11.5px] mt-1" style={{ color: 'var(--text-dim)' }}>
              Achilles-style profile of the entire OMOP cohort · n = {data.cohort_size?.toLocaleString()} persons
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full"
            style={{ background: 'rgba(0,114,206,0.06)', color: 'var(--gold)', border: '1px solid rgba(0,114,206,0.18)' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <ellipse cx="12" cy="5" rx="9" ry="3"/>
              <path d="M3 5v14a9 3 0 0 0 18 0V5"/>
            </svg>
            OMOP CDM v5.4
          </span>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiTile label="Cohort size" value={data.cohort_size?.toLocaleString()} sublabel="persons in CDM" />
          <KpiTile label="Mean age" value={data.age_stats?.mean_age?.toFixed(1)} suffix="y"
            sublabel={`range ${data.age_stats?.min_age}–${data.age_stats?.max_age}`} />
          <KpiTile label="T2DM cohort" value={data.t2dm_size?.toLocaleString()}
            sublabel={`${((data.t2dm_size / data.cohort_size) * 100).toFixed(1)}% prevalence`} />
          {(data.measurements || []).slice(0, 2).map(m => (
            <KpiTile key={m.concept_id} label={m.label} value={m.mean ?? '—'}
              sublabel={`n = ${m.n?.toLocaleString()}`} />
          ))}
        </div>

        {/* Demographics row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3" style={{ minHeight: 280 }}>
          <div className="md:col-span-2">
            <Panel title="Age distribution">
              <DynamicChart spec={ageChart} bare />
            </Panel>
          </div>
          <div>
            <Panel title="Sex">
              <DynamicChart spec={sexChart} bare />
            </Panel>
          </div>
        </div>

        {/* Conditions + drugs */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3" style={{ minHeight: 360 }}>
          <Panel title="Top conditions">
            <DynamicChart spec={condChart} bare />
          </Panel>
          <Panel title="Top drugs">
            <DynamicChart spec={drugChart} bare />
          </Panel>
        </div>

        {/* Drug classes + T2DM comorbidities */}
        {(drugClassChart || t2dmComorbChart) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3" style={{ minHeight: 320 }}>
            {drugClassChart && (
              <Panel title="Drug classes (ATC parent expansion)">
                <DynamicChart spec={drugClassChart} bare />
              </Panel>
            )}
            {t2dmComorbChart && (
              <Panel title="T2DM cohort comorbidity profile">
                <DynamicChart spec={t2dmComorbChart} bare />
              </Panel>
            )}
          </div>
        )}

        {/* Measurement summary */}
        {data.measurements?.length > 0 && (
          <div className="glass-card p-4">
            <h3 className="text-[10.5px] font-bold tracking-[0.1em] uppercase mb-3"
              style={{ color: 'var(--gold)' }}>
              Key measurements — distributions across the CDM
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {data.measurements.map(m => (
                <div key={m.concept_id} className="rounded-lg p-3"
                  style={{ background: 'rgba(0,114,206,0.04)', border: '1px solid rgba(0,114,206,0.10)' }}>
                  <p className="text-[10px] font-semibold mb-1" style={{ color: 'var(--text-md)' }}>
                    {m.label}
                  </p>
                  <p className="text-[18px] font-extrabold leading-none" style={{ color: 'var(--text)' }}>
                    {m.mean ?? '—'}
                  </p>
                  <p className="text-[9.5px] mt-1.5 font-mono" style={{ color: 'var(--text-dim)' }}>
                    range {m.min}–{m.max} · n={m.n?.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
