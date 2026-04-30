import { useEffect, useState } from 'react';
import { getQueryLog, clearQueryLog } from '../api';

export default function QueryLogPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = () => {
    setLoading(true);
    getQueryLog()
      .then(d => { setEntries(d.queries || []); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleClear = async () => {
    if (!confirm('Clear the entire query log? This cannot be undone.')) return;
    await clearQueryLog();
    load();
  };

  const filtered = entries.filter(e =>
    !search || e.query?.toLowerCase().includes(search.toLowerCase())
  );

  const fmt = (iso) => {
    if (!iso) return '—';
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
    } catch { return iso; }
  };

  return (
    <div className="h-full overflow-y-auto px-6 py-5">
      <div className="max-w-[1400px] mx-auto">
        <div className="flex items-end justify-between flex-wrap gap-3 mb-4">
          <div>
            <h1 className="text-[20px] font-extrabold tracking-tight" style={{ color: 'var(--text)' }}>
              Query Log
            </h1>
            <p className="text-[11.5px] mt-1" style={{ color: 'var(--text-dim)' }}>
              Every question the agent has answered, with its tool-call and SQL footprint.
              Useful for auditing and reproducibility.
            </p>
          </div>
          <div className="flex gap-2">
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search queries..."
              className="filter-input w-[260px]" />
            <button onClick={load}
              className="px-3 py-2 rounded-lg text-[11px] font-semibold transition-all hover:bg-[rgba(0,114,206,0.05)]"
              style={{ color: 'var(--gold)', border: '1px solid rgba(0,114,206,0.20)' }}>
              Refresh
            </button>
            <button onClick={handleClear}
              className="px-3 py-2 rounded-lg text-[11px] font-semibold transition-all hover:bg-[var(--red-bg)]"
              style={{ color: 'var(--red)', border: '1px solid rgba(192,57,43,0.22)' }}>
              Clear log
            </button>
          </div>
        </div>

        {loading ? (
          <p className="text-center py-16 text-sm" style={{ color: 'var(--text-faint)' }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-xl p-12 text-center"
            style={{ background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(0,114,206,0.10)' }}>
            <p className="text-[13px] font-semibold" style={{ color: 'var(--text-dim)' }}>
              {search ? 'No matching queries' : 'No queries logged yet'}
            </p>
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-faint)' }}>
              {!search && 'Ask the assistant something to populate this log.'}
            </p>
          </div>
        ) : (
          <div className="glass-card overflow-hidden">
            <table className="data-table" style={{ fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={{ width: 140 }}>Timestamp</th>
                  <th>Query</th>
                  <th style={{ width: 280 }}>Answer preview</th>
                  <th style={{ width: 80 }}>Tools</th>
                  <th style={{ width: 70 }}>SQL</th>
                  <th style={{ width: 80 }}>Cohort</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, i) => (
                  <tr key={i}>
                    <td className="font-mono text-[10.5px]" style={{ color: 'var(--text-dim)' }}>
                      {fmt(e.timestamp)}
                    </td>
                    <td style={{ color: 'var(--text)', maxWidth: 360 }}>
                      <div className="truncate font-semibold">{e.query}</div>
                    </td>
                    <td className="text-[11px]" style={{ color: 'var(--text-md)' }}>
                      <div className="truncate">{e.answer_preview || '—'}</div>
                    </td>
                    <td className="text-center">
                      <span className="badge" style={{
                        background: 'rgba(0,114,206,0.06)', color: 'var(--gold)',
                        border: '1px solid rgba(0,114,206,0.18)',
                      }}>{e.n_tool_calls ?? 0}</span>
                    </td>
                    <td className="text-center">
                      <span className="badge" style={{
                        background: 'rgba(12,110,122,0.06)', color: 'var(--teal)',
                        border: '1px solid rgba(12,110,122,0.18)',
                      }}>{e.n_sql ?? 0}</span>
                    </td>
                    <td className="text-center">
                      {e.cohort_built
                        ? <span className="badge badge-green">built</span>
                        : <span style={{ color: 'var(--text-faint)' }}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-[10px] mt-4" style={{ color: 'var(--text-faint)' }}>
          Stored at <code className="font-mono px-1 rounded"
            style={{ background: 'rgba(0,0,0,0.04)' }}>backend/data/query_log.json</code>.
          Last 500 entries retained.
        </p>
      </div>
    </div>
  );
}
