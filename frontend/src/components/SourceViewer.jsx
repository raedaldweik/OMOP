import { useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { getDocumentRaw, getChunk } from '../api';

/**
 * Markdown source viewer. Replaces the old PDFSourceViewer.
 *
 * Props:
 *   chunk: { doc_id, chunk_id, section, title } from a citation pill
 *   docId: open the whole document (from Documents page)
 *   onClose: () => void
 */
export default function SourceViewer({ chunk, docId, title, onClose }) {
  const [content, setContent] = useState(null);
  const [error, setError] = useState(null);
  const [meta, setMeta] = useState(null);

  const resolvedDocId = docId || chunk?.doc_id;
  const resolvedTitle = title || chunk?.title || resolvedDocId;
  const section = chunk?.section;

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    if (!resolvedDocId) return;
    setContent(null); setError(null);
    if (chunk?.chunk_id) {
      getChunk(chunk.chunk_id)
        .then(c => { setContent(c.text); setMeta(c); })
        .catch(e => setError(e.message));
    } else {
      getDocumentRaw(resolvedDocId)
        .then(setContent)
        .catch(e => setError(e.message));
    }
  }, [resolvedDocId, chunk?.chunk_id]);

  if (!resolvedDocId) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-fade-up"
      onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div className="relative w-full max-w-3xl max-h-[90vh] rounded-xl overflow-hidden shadow-2xl flex flex-col"
        style={{ background: '#fff', border: '1px solid rgba(0,114,206,0.20)' }}
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between px-5 py-3 border-b"
          style={{ background: 'var(--nav-grad)', borderColor: 'rgba(0,114,206,0.20)' }}>
          <div className="flex items-center gap-3 min-w-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2B95E8" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
              <polyline points="14 2 14 8 20 8"/>
            </svg>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-white truncate">{resolvedTitle}</div>
              {section && (
                <div className="text-[10.5px] text-white/70 truncate">
                  Section: {section}
                </div>
              )}
            </div>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition-all shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6 prose-styles">
          {error && <p className="text-sm" style={{ color: 'var(--red)' }}>{error}</p>}
          {!error && !content && (
            <p className="text-sm text-center py-12" style={{ color: 'var(--text-faint)' }}>Loading…</p>
          )}
          {content && (
            <div className="text-[13.5px] leading-[1.75]" style={{ color: 'var(--text)' }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                h1: (p) => <h1 className="text-[20px] font-extrabold mt-2 mb-3" style={{ color: 'var(--gold-lo)' }} {...p} />,
                h2: (p) => <h2 className="text-[16px] font-bold mt-5 mb-2" style={{ color: 'var(--gold)' }} {...p} />,
                h3: (p) => <h3 className="text-[14px] font-semibold mt-4 mb-1.5" style={{ color: 'var(--gold-lo)' }} {...p} />,
                p:  (p) => <p className="my-2" {...p} />,
                ul: (p) => <ul className="my-2 pl-5 list-disc space-y-1" {...p} />,
                code:(p) => <code className="px-1 py-0.5 rounded text-[12px]" style={{ background: 'rgba(0,114,206,0.06)', color: 'var(--gold)' }} {...p} />,
              }}>{content}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
