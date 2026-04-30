import { useEffect, useState } from 'react';
import { getCdmSummary, listPersons, getPerson, runSql, searchConcepts } from '../api';

const SAMPLE_QUERIES = [
  {
    label: 'Top 10 conditions by person count',
    sql: `SELECT c.concept_name, COUNT(DISTINCT co.person_id) AS n_persons
FROM condition_occurrence co
JOIN concept c ON c.concept_id = co.condition_concept_id
GROUP BY c.concept_name
ORDER BY n_persons DESC
LIMIT 10`,
  },
  {
    label: 'Persons on metformin (RxNorm 1503297)',
    sql: `SELECT COUNT(DISTINCT person_id) AS n_metformin_users
FROM drug_exposure
WHERE drug_concept_id = 1503297`,
  },
  {
    label: 'Mean HbA1c by sex',
    sql: `SELECT
  CASE p.gender_concept_id WHEN 8507 THEN 'Male' WHEN 8532 THEN 'Female' END AS sex,
  ROUND(AVG(m.value_as_number), 2) AS mean_hba1c,
  COUNT(*) AS n_measurements
FROM measurement m
JOIN person p ON p.person_id = m.person_id
WHERE m.measurement_concept_id = 3004410
GROUP BY p.gender_concept_id`,
  },
  {
    label: 'SGLT2i users (descendants of ATC 21600765)',
    sql: `SELECT c.concept_name, COUNT(DISTINCT de.person_id) AS n_persons
FROM drug_exposure de
JOIN concept_ancestor ca ON ca.descendant_concept_id = de.drug_concept_id
JOIN concept c ON c.concept_id = de.drug_concept_id
WHERE ca.ancestor_concept_id = 21600765
GROUP BY c.concept_name
ORDER BY n_persons DESC`,
  },
];

function SummaryStrip({ summary }) {
  if (!summary) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
      {[
        ['Persons',     summary.n_persons,                                'persons'],
        ['Conditions',  summary.tables?.condition_occurrence,             'condition_occurrence'],
        ['Drugs',       summary.tables?.drug_exposure,                    'drug_exposure'],
        ['Measurements',summary.tables?.measurement,                      'measurement'],
        ['Visits',      summary.tables?.visit_occurrence,                 'visit_occurrence'],
        ['Concepts',    summary.tables?.concept,                          'concept'],
      ].map(([label, val, sub]) => (
        <div key={label} className="rounded-lg px-3 py-2"
          style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(0,114,206,0.12)' }}>
          <p className="text-[8.5px] font-bold tracking-[0.15em] uppercase" style={{ color: 'var(--text-faint)' }}>
            {label}
          </p>
          <p className="text-[16px] font-extrabold leading-none mt-0.5" style={{ color: 'var(--text)' }}>
            {(val ?? 0).toLocaleString()}
          </p>
          <p className="text-[9px] mt-0.5 font-mono" style={{ color: 'var(--text-dim)' }}>{sub}</p>
        </div>
      ))}
    </div>
  );
}

function SqlPlayground() {
  const [sql, setSql] = useState(SAMPLE_QUERIES[0].sql);
  const [result, setResult] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);

  const exec = async () => {
    setRunning(true); setError(null); setResult(null);
    try {
      const r = await runSql(sql);
      if (r.error) setError(r.error);
      else setResult(r);
    } catch (e) {
      setError(e.message);
    }
    setRunning(false);
  };

  return (
    <div className="glass-card p-4 mb-5">
      <div className="flex items-center justify-between mb-2.5">
        <div>
          <h3 className="text-[12px] font-bold" style={{ color: 'var(--text)' }}>SQL Playground</h3>
          <p className="text-[10.5px]" style={{ color: 'var(--text-dim)' }}>
            Read-only SELECT against the OMOP CDM SQLite. Mutating statements are blocked.
          </p>
        </div>
        <button onClick={exec} disabled={running}
          className="px-4 py-2 rounded-lg text-[11.5px] font-bold text-white transition-all hover:scale-[1.02] disabled:opacity-50"
          style={{ background: 'var(--gold-grad)', boxShadow: '0 3px 12px rgba(0,114,206,0.30)' }}>
          {running ? 'Running…' : 'Execute SQL'}
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2">
        {SAMPLE_QUERIES.map(q => (
          <button key={q.label} onClick={() => setSql(q.sql)}
            className="text-[10.5px] px-2.5 py-1 rounded-full transition-all hover:bg-[rgba(0,114,206,0.06)]"
            style={{ color: 'var(--gold)', border: '1px solid rgba(0,114,206,0.20)', background: 'rgba(255,255,255,0.5)' }}>
            {q.label}
          </button>
        ))}
      </div>

      <textarea value={sql} onChange={e => setSql(e.target.value)} rows={6}
        className="w-full font-mono text-[11.5px] p-3 rounded-lg outline-none resize-none"
        style={{ background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,114,206,0.15)',
                 color: 'var(--text)', tabSize: 2 }} />

      {error && (
        <div className="mt-2 px-3 py-2 rounded-lg text-[11px] font-mono"
          style={{ background: 'var(--red-bg)', color: 'var(--red)', border: '1px solid rgba(192,57,43,0.22)' }}>
          {error}
        </div>
      )}

      {result && (
        <div className="mt-3 rounded-lg overflow-hidden"
          style={{ border: '1px solid rgba(0,114,206,0.12)' }}>
          <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] font-bold tracking-widest uppercase"
            style={{ background: 'rgba(0,114,206,0.06)', color: 'var(--gold)' }}>
            <span>{result.row_count} row{result.row_count !== 1 ? 's' : ''}</span>
            <span>·</span>
            <span>{result.columns?.length || 0} columns</span>
          </div>
          <div className="overflow-x-auto max-h-[360px]">
            <table className="data-table" style={{ fontSize: 11.5 }}>
              <thead>
                <tr>
                  {result.columns?.map(c => <th key={c}>{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {result.rows?.map((row, i) => (
                  <tr key={i}>
                    {result.columns.map(col => (
                      <td key={col} className="font-mono">
                        {row[col] === null ? <span style={{ color: 'var(--text-faint)' }}>NULL</span>
                                            : String(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function PersonBrowser() {
  const [persons, setPersons] = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    listPersons(50, offset).then(d => setPersons(d.persons || []));
  }, [offset]);

  useEffect(() => {
    if (selected === null) return;
    setLoadingDetail(true);
    getPerson(selected)
      .then(setDetail)
      .finally(() => setLoadingDetail(false));
  }, [selected]);

  return (
    <div className="glass-card p-4">
      <h3 className="text-[12px] font-bold mb-3" style={{ color: 'var(--text)' }}>Person Browser</h3>
      <div className="flex gap-3" style={{ minHeight: 480 }}>
        {/* Person list */}
        <div className="w-[300px] shrink-0 rounded-lg overflow-hidden"
          style={{ border: '1px solid rgba(0,114,206,0.12)', background: 'rgba(255,255,255,0.55)' }}>
          <div className="flex items-center justify-between px-3 py-2"
            style={{ background: 'rgba(0,114,206,0.06)' }}>
            <span className="text-[9.5px] font-bold tracking-widest uppercase" style={{ color: 'var(--gold)' }}>
              Persons
            </span>
            <div className="flex gap-1">
              <button onClick={() => setOffset(Math.max(0, offset - 50))} disabled={offset === 0}
                className="text-[10px] px-1.5 py-0.5 rounded disabled:opacity-30"
                style={{ color: 'var(--gold)' }}>← prev</button>
              <button onClick={() => setOffset(offset + 50)}
                className="text-[10px] px-1.5 py-0.5 rounded"
                style={{ color: 'var(--gold)' }}>next →</button>
            </div>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: 440 }}>
            {persons.map(p => (
              <button key={p.person_id} onClick={() => setSelected(p.person_id)}
                className={`w-full text-left px-3 py-2 transition-all border-b border-[rgba(0,114,206,0.06)] hover:bg-[rgba(0,114,206,0.05)] ${
                  selected === p.person_id ? 'bg-[rgba(0,114,206,0.08)]' : ''
                }`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] font-bold" style={{ color: 'var(--gold-lo)' }}>
                    person_id={p.person_id}
                  </span>
                  <span className="text-[10px]" style={{ color: 'var(--text-md)' }}>
                    {p.sex}, {p.age}y
                  </span>
                </div>
                <div className="text-[9.5px] mt-0.5" style={{ color: 'var(--text-dim)' }}>
                  {p.n_conditions} cx · {p.n_drugs} drugs · {p.n_measurements} labs
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Detail */}
        <div className="flex-1 rounded-lg overflow-hidden"
          style={{ border: '1px solid rgba(0,114,206,0.12)', background: 'rgba(255,255,255,0.55)' }}>
          {selected === null ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-[11.5px]" style={{ color: 'var(--text-faint)' }}>
                Select a person to view their record
              </p>
            </div>
          ) : loadingDetail ? (
            <div className="h-full flex items-center justify-center">
              <div className="w-5 h-5 rounded-full border-2 border-transparent border-t-[var(--gold)] animate-spin" />
            </div>
          ) : detail && (
            <div className="overflow-y-auto h-full p-4 space-y-4" style={{ maxHeight: 480 }}>
              <div>
                <h4 className="text-[13px] font-bold" style={{ color: 'var(--text)' }}>
                  Person {detail.person?.person_id}
                </h4>
                <p className="text-[10.5px] mt-1 font-mono" style={{ color: 'var(--text-dim)' }}>
                  YOB {detail.person?.year_of_birth} ·
                  gender_concept_id {detail.person?.gender_concept_id} ·
                  race_concept_id {detail.person?.race_concept_id}
                </p>
              </div>
              {[
                ['Conditions',   detail.condition_occurrence,   'condition_concept_id', 'condition_start_date'],
                ['Drugs',        detail.drug_exposure,          'drug_concept_id',      'drug_exposure_start_date'],
                ['Measurements', detail.measurement,            'measurement_concept_id','measurement_date'],
                ['Visits',       detail.visit_occurrence,       'visit_concept_id',     'visit_start_date'],
              ].map(([label, rows, idCol, dateCol]) => (
                <div key={label}>
                  <p className="text-[9.5px] font-bold tracking-widest uppercase mb-1"
                    style={{ color: 'var(--gold)' }}>
                    {label} · {rows?.length || 0}
                  </p>
                  {!rows?.length ? (
                    <p className="text-[10.5px]" style={{ color: 'var(--text-faint)' }}>none</p>
                  ) : (
                    <div className="space-y-1">
                      {rows.slice(0, 8).map((r, i) => (
                        <div key={i} className="rounded px-2 py-1.5 text-[10.5px] flex items-center justify-between gap-2"
                          style={{ background: 'rgba(0,114,206,0.04)' }}>
                          <span className="truncate" style={{ color: 'var(--text)' }}>
                            {r.concept_name || `(concept ${r[idCol]})`}
                          </span>
                          <span className="font-mono shrink-0" style={{ color: 'var(--text-dim)' }}>
                            {r.value_as_number !== undefined && r.value_as_number !== null
                              ? <>val={r.value_as_number} · </> : null}
                            {r[dateCol]}
                          </span>
                        </div>
                      ))}
                      {rows.length > 8 && (
                        <p className="text-[10px] text-center" style={{ color: 'var(--text-dim)' }}>
                          … and {rows.length - 8} more
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConceptSearch() {
  const [q, setQ] = useState('diabetes');
  const [domain, setDomain] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  const doSearch = async () => {
    if (!q.trim()) return;
    setSearching(true);
    try {
      const r = await searchConcepts(q, domain);
      setResults(r.concepts || []);
    } catch {
      setResults([]);
    }
    setSearching(false);
  };

  useEffect(() => { doSearch(); /* eslint-disable-next-line */ }, []);

  return (
    <div className="glass-card p-4 mt-5">
      <h3 className="text-[12px] font-bold mb-3" style={{ color: 'var(--text)' }}>Concept Search</h3>
      <div className="flex gap-2 mb-3">
        <input value={q} onChange={e => setQ(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && doSearch()}
          placeholder='e.g. "metformin", "HbA1c", "type 2 diabetes"'
          className="filter-input flex-1" />
        <select value={domain} onChange={e => setDomain(e.target.value)} className="filter-select pl-3 pr-10">
          <option value="">All domains</option>
          <option value="Condition">Condition</option>
          <option value="Drug">Drug</option>
          <option value="Measurement">Measurement</option>
          <option value="Procedure">Procedure</option>
          <option value="Visit">Visit</option>
        </select>
        <button onClick={doSearch} disabled={searching}
          className="px-4 rounded-lg text-[11.5px] font-bold text-white"
          style={{ background: 'var(--gold-grad)' }}>
          {searching ? '…' : 'Search'}
        </button>
      </div>

      {results.length > 0 && (
        <div className="rounded-lg overflow-hidden"
          style={{ border: '1px solid rgba(0,114,206,0.12)' }}>
          <table className="data-table" style={{ fontSize: 11.5 }}>
            <thead>
              <tr>
                <th>concept_id</th>
                <th>concept_name</th>
                <th>domain</th>
                <th>vocabulary</th>
                <th>code</th>
              </tr>
            </thead>
            <tbody>
              {results.map(c => (
                <tr key={c.concept_id}>
                  <td className="font-mono" style={{ color: 'var(--gold-lo)', fontWeight: 600 }}>{c.concept_id}</td>
                  <td>{c.concept_name}</td>
                  <td>{c.domain_id}</td>
                  <td>{c.vocabulary_id}</td>
                  <td className="font-mono">{c.concept_code}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function OMOPBrowserPage() {
  const [summary, setSummary] = useState(null);
  useEffect(() => { getCdmSummary().then(setSummary).catch(() => {}); }, []);

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <div className="max-w-[1400px] mx-auto">
        <div className="mb-4">
          <h1 className="text-[20px] font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
            OMOP CDM Browser
          </h1>
          <p className="text-[11.5px] mt-1" style={{ color: 'var(--text-dim)' }}>
            {summary?.source?.cdm_source_name || 'OMOP CDM'} ·
            CDM {summary?.source?.cdm_version || 'v5.x'} ·
            {summary?.observation_window?.start} → {summary?.observation_window?.end}
          </p>
        </div>

        <SummaryStrip summary={summary} />
        <SqlPlayground />
        <PersonBrowser />
        <ConceptSearch />
      </div>
    </div>
  );
}
