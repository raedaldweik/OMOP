import { useEffect, useState } from 'react';
import { getDocuments } from '../api';
import SourceViewer from '../components/SourceViewer';

export default function DocumentsPage() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [viewing, setViewing] = useState(null);

  useEffect(() => {
    getDocuments()
      .then(d => { setDocs(d.documents || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = docs.filter(d =>
    !search ||
    d.title?.toLowerCase().includes(search.toLowerCase()) ||
    d.section?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1100px] mx-auto px-8 py-6">
        <div className="mb-5">
          <h1 className="text-[20px] font-extrabold" style={{ color: 'var(--text)' }}>
            Knowledge Corpus
          </h1>
          <p className="text-[11.5px] mt-1" style={{ color: 'var(--text-dim)' }}>
            OMOP CDM specification, OHDSI methodology, and concept-set best practices —
            indexed by the agent's RAG layer. Click any document to view in full.
          </p>
        </div>

        <div className="flex gap-3 mb-5">
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search documents..."
            className="filter-input w-[280px]" />
          <span className="self-center text-[10.5px]" style={{ color: 'var(--text-dim)' }}>
            {filtered.length} of {docs.length} document{docs.length !== 1 ? 's' : ''} ·
            {' '}{docs.reduce((sum, d) => sum + (d.n_chunks || 0), 0)} chunks indexed
          </span>
        </div>

        {loading ? (
          <p className="text-center py-16 text-sm" style={{ color: 'var(--text-faint)' }}>Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-center py-20 text-sm" style={{ color: 'var(--text-faint)' }}>No documents found</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filtered.map(doc => (
              <button key={doc.doc_id}
                onClick={() => setViewing({ docId: doc.doc_id, title: doc.title })}
                className="glass-card p-4 text-left hover:shadow-lg transition-all group animate-fade-up"
                style={{ cursor: 'pointer' }}>
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center"
                    style={{ background: 'var(--gold-grad)', boxShadow: '0 2px 8px rgba(0,114,206,0.20)' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="9" y1="13" x2="15" y2="13"/>
                      <line x1="9" y1="17" x2="13" y2="17"/>
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-[13px] font-semibold leading-tight mb-1" style={{ color: 'var(--text)' }}>
                      {doc.title}
                    </h3>
                    <div className="flex items-center gap-2 flex-wrap mb-2">
                      <span className="badge" style={{
                        background: 'rgba(0,114,206,0.06)',
                        color: 'var(--gold)',
                        border: '1px solid rgba(0,114,206,0.18)',
                      }}>
                        {doc.section}
                      </span>
                      <span className="text-[10px]" style={{ color: 'var(--text-dim)' }}>
                        {doc.n_chunks} chunk{doc.n_chunks !== 1 ? 's' : ''} indexed
                      </span>
                    </div>
                    <p className="text-[10.5px]" style={{ color: 'var(--text-md)' }}>
                      Source: {doc.source}
                    </p>
                    <div className="flex items-center gap-1.5 text-[11px] font-medium mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      style={{ color: 'var(--gold)' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                      View document
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="mt-8 rounded-lg p-4"
          style={{ background: 'rgba(0,114,206,0.04)', border: '1px solid rgba(0,114,206,0.12)' }}>
          <p className="text-[10px] font-bold tracking-widest uppercase mb-2" style={{ color: 'var(--gold)' }}>
            Expanding the corpus
          </p>
          <p className="text-[11.5px]" style={{ color: 'var(--text-md)' }}>
            This Phase 1 corpus is a curated starter set. To extend it, drop additional
            markdown files into <code className="font-mono px-1 rounded"
              style={{ background: 'rgba(0,0,0,0.04)' }}>backend/data/corpus/</code> and
            register them in <code className="font-mono px-1 rounded"
              style={{ background: 'rgba(0,0,0,0.04)' }}>rag.py</code> →{' '}
            <code className="font-mono px-1 rounded"
              style={{ background: 'rgba(0,0,0,0.04)' }}>DOC_META</code>. The RAG index
            rebuilds at server startup. CC-licensed OHDSI Book chapters are good candidates.
          </p>
        </div>
      </div>

      {viewing && (
        <SourceViewer docId={viewing.docId} title={viewing.title} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}
