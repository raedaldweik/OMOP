import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import DynamicChart from './DynamicChart';
import CohortCanvas from './CohortCanvas';
import ReasoningTrace from './ReasoningTrace';

const markdownComponents = {
  p:    (p) => <p className="my-1 leading-[1.75]" {...p} />,
  strong:(p) => <strong style={{ color: 'var(--gold)', fontWeight: 700 }} {...p} />,
  em:   (p) => <em style={{ color: 'var(--gold-lo)' }} {...p} />,
  ul:   (p) => <ul className="my-1.5 space-y-0.5 pl-5 list-disc" {...p} />,
  ol:   (p) => <ol className="my-1.5 space-y-0.5 pl-5 list-decimal" {...p} />,
  li:   (p) => <li className="leading-[1.7]" {...p} />,
  h1:   (p) => <h1 className="text-[15px] font-bold my-2" style={{ color: 'var(--gold)' }} {...p} />,
  h2:   (p) => <h2 className="text-[14px] font-bold my-2" style={{ color: 'var(--gold)' }} {...p} />,
  h3:   (p) => <h3 className="text-[13px] font-semibold my-1.5" style={{ color: 'var(--gold-lo)' }} {...p} />,
  code: ({inline, ...p}) => inline
    ? <code className="px-1 py-0.5 rounded text-[12px]" style={{ background: 'rgba(0,114,206,0.06)', color: 'var(--gold)' }} {...p} />
    : <code className="block p-2 rounded my-1 text-[12px]" style={{ background: 'rgba(0,0,0,0.04)' }} {...p} />,
  blockquote: (p) => <blockquote className="pl-3 my-2 italic" style={{ borderLeft: '2px solid var(--gold-lo)', color: 'var(--text-md)' }} {...p} />,
  table:(p) => <div className="my-2 overflow-x-auto"><table className="border-collapse text-[12px] w-full" style={{ border: '1px solid rgba(0,114,206,0.15)' }} {...p} /></div>,
  th:   (p) => <th className="px-2 py-1.5 text-left font-semibold" style={{ border: '1px solid rgba(0,114,206,0.15)', color: 'var(--gold)' }} {...p} />,
  td:   (p) => <td className="px-2 py-1.5" style={{ border: '1px solid rgba(0,114,206,0.10)' }} {...p} />,
};

function CharacterizationSummary({ char }) {
  if (!char) return null;
  // Compose lightweight chart specs for the inline summary
  const sexChart = char.sex?.length ? {
    type: 'pie',
    title: 'Sex',
    data: char.sex.map(s => ({ name: s.sex, value: s.n })),
    xKey: 'name',
    yKeys: [{ key: 'value', label: 'Persons' }],
    height: 180,
  } : null;
  const ageChart = char.age_band?.length ? {
    type: 'bar',
    title: 'Age band',
    data: char.age_band,
    xKey: 'age_band',
    yKeys: [{ key: 'n', label: 'Persons', color: '#0072CE' }],
    height: 180,
  } : null;
  const condChart = char.top_conditions?.length ? {
    type: 'bar',
    title: 'Top conditions',
    data: char.top_conditions.slice(0, 8).map(c => ({
      name: c.concept_name?.length > 28 ? c.concept_name.slice(0, 27) + '…' : c.concept_name,
      n: c.n_persons,
    })),
    xKey: 'name',
    yKeys: [{ key: 'n', label: 'Persons', color: '#A42548' }],
    height: 220,
  } : null;

  return (
    <div className="rounded-xl p-3 space-y-3"
      style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(0,114,206,0.14)' }}>
      <div className="flex items-center gap-2">
        <span className="text-[8.5px] font-bold tracking-widest uppercase" style={{ color: 'var(--gold)' }}>
          Characterization
        </span>
        <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
          n = {char.cohort_size?.toLocaleString()} · mean age {char.age_stats?.mean_age?.toFixed(1)}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {sexChart && <DynamicChart spec={sexChart} />}
        {ageChart && <DynamicChart spec={ageChart} />}
      </div>
      {condChart && <DynamicChart spec={condChart} />}
      {char.measurements?.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {char.measurements.map(m => (
            <div key={m.concept_id} className="kpi-card" style={{ padding: '10px 12px' }}>
              <p className="text-[8px] font-bold tracking-widest uppercase mb-1" style={{ color: 'var(--text-faint)' }}>
                {m.label}
              </p>
              <p className="text-[16px] font-extrabold leading-none" style={{ color: 'var(--text)' }}>
                {m.mean ?? '—'}
              </p>
              <p className="text-[8.5px] mt-0.5" style={{ color: 'var(--text-dim)' }}>
                n={m.n?.toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SqlLog({ entries }) {
  const [open, setOpen] = useState(false);
  if (!entries || entries.length === 0) return null;
  return (
    <div className="rounded-lg overflow-hidden"
      style={{ background: 'rgba(0,0,0,0.02)', border: '1px solid rgba(0,114,206,0.10)' }}>
      <button onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[rgba(0,114,206,0.04)]">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{ color: 'var(--gold)' }}>
          <ellipse cx="12" cy="5" rx="9" ry="3"/>
          <path d="M3 5v14a9 3 0 0 0 18 0V5"/>
        </svg>
        <span className="text-[10px] font-bold tracking-widest uppercase" style={{ color: 'var(--gold)' }}>
          SQL executed · {entries.length}
        </span>
        <div className="flex-1" />
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
          style={{ color: 'var(--gold)', transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <div className="p-2 space-y-1.5">
          {entries.map((e, i) => (
            <div key={i} className="rounded p-2 text-[10.5px]"
              style={{ background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(0,114,206,0.08)' }}>
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold" style={{ color: 'var(--text)' }}>{e.purpose || '—'}</span>
                <span className="font-mono text-[9.5px]" style={{ color: e.error ? 'var(--red)' : 'var(--text-dim)' }}>
                  {e.error ? 'error' : `${e.row_count} rows`}
                </span>
              </div>
              <pre className="font-mono text-[10px] whitespace-pre-wrap break-all"
                style={{ color: 'var(--text-md)' }}>{e.sql}</pre>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ResponseCard({ data, onOpenSource }) {
  if (!data) return null;

  return (
    <div className="animate-slide-up space-y-2.5 max-w-[820px]">
      {/* Answer bubble */}
      {data.answer && (
        <div className="msg-bot-bubble px-4 py-3">
          <div className="text-[13px]" style={{ color: 'var(--text)' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {data.answer}
            </ReactMarkdown>
          </div>
        </div>
      )}

      {/* Cohort Canvas — appears whenever the agent built a cohort */}
      {data.cohort && (
        <CohortCanvas cohort={data.cohort} characterization={data.characterization} />
      )}

      {/* Characterization summary — only when not already inside cohort canvas, or as standalone */}
      {!data.cohort && data.characterization && (
        <CharacterizationSummary char={data.characterization} />
      )}

      {/* Agent-rendered charts */}
      {data.charts && data.charts.length > 0 && (
        <div className="space-y-2">
          {data.charts.map((chart, i) => <DynamicChart key={i} spec={chart} />)}
        </div>
      )}

      {/* Citations */}
      {data.citations && data.citations.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {data.citations.map((c, i) => (
            <button key={i} onClick={() => onOpenSource?.(c)}
              title={`${c.title} · ${c.section}`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] transition-all hover:shadow-md hover:-translate-y-[1px]"
              style={{ color: 'var(--gold-lo)', background: 'rgba(0,114,206,0.06)', border: '1px solid rgba(0,114,206,0.18)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              {c.title}
              <span className="opacity-60 text-[9.5px]">· {c.section}</span>
            </button>
          ))}
        </div>
      )}

      {/* SQL log */}
      {data.sql_log && data.sql_log.length > 0 && <SqlLog entries={data.sql_log} />}

      {/* Reasoning trace */}
      {data.trace && data.trace.length > 0 && <ReasoningTrace trace={data.trace} />}
    </div>
  );
}
