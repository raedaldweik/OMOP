import { useEffect, useRef, useState } from 'react';

// ─── Particle background canvas (same engine as old landing page) ───
function ParticleBg() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let W, H, animId;
    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      W = window.innerWidth; H = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    const particles = Array.from({ length: 90 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 1.3 + 0.3,
      vx: (Math.random() - 0.5) * 0.12,
      vy: (Math.random() - 0.5) * 0.12,
      alpha: Math.random() * 0.3 + 0.08,
      twinklePhase: Math.random() * Math.PI * 2,
      blue: Math.random() > 0.35,
    }));

    function draw() {
      ctx.clearRect(0, 0, W, H);
      const grad = ctx.createRadialGradient(W * 0.28, H * 0.5, 0, W * 0.28, H * 0.5, W * 0.32);
      grad.addColorStop(0, 'rgba(43,149,232,0.10)');
      grad.addColorStop(0.5, 'rgba(0,114,206,0.025)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

      const tSec = performance.now() * 0.001;
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        const twinkle = 0.5 + 0.5 * Math.sin(p.twinklePhase + tSec * 2);
        const a = p.alpha * twinkle;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = p.blue ? `rgba(43,149,232,${a})` : `rgba(245,250,255,${a * 0.55})`;
        ctx.fill();
        if (p.blue && p.r > 1) {
          ctx.shadowColor = 'rgba(43,149,232,0.6)';
          ctx.shadowBlur = 6; ctx.fill(); ctx.shadowBlur = 0;
        }
      }
      animId = requestAnimationFrame(draw);
    }
    draw();
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', resize); };
  }, []);

  return <canvas ref={canvasRef} id="bg" />;
}

// ─── Tab content blocks ─────────────────────────────────────────────

function CapabilitiesTab() {
  const items = [
    { title: 'Vocabulary lookup',         icon: 'M21 21l-4.35-4.35M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16z',
      body: 'Search SNOMED, RxNorm, LOINC, ATC by name. Expand parent classes to all descendants in one call. The agent grounds itself in real concept_ids before writing SQL.' },
    { title: 'Cohort building',           icon: 'M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11',
      body: 'Build new-user / active-comparator cohorts in plain English. Output is valid Circe JSON that imports straight into ATLAS via WebAPI. Live cohort canvas shows the spec assembling.' },
    { title: 'Achilles characterization', icon: 'M3 3v18h18 M7 14l4-4 4 4 5-5',
      body: 'Demographics, top conditions, drug-class utilization, key labs — for the entire CDM or any cohort the agent built. Every value is a real query, never fabricated.' },
    { title: 'SQL transparency',          icon: 'M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z',
      body: 'Every SQL the agent runs is captured with its purpose, runtime, and row count. Read-only execution against the CDM — mutating statements are blocked at the data layer.' },
    { title: 'OHDSI knowledge RAG',       icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M9 13h6 M9 17h6',
      body: 'Curated corpus over CDM specification, Circe expression language, concept-set patterns, and methodology canon (CohortMethod, PatientLevelPrediction, federation).' },
    { title: 'Federation-ready',          icon: 'M22 12h-4l-3 9L9 3l-3 9H2',
      body: 'Agent runs locally against any OMOP CDM. Use the bundled synthetic cohort, swap in Eunomia, or point at your own CDM SQLite. The same tools work everywhere.' },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
      {items.map(it => (
        <div key={it.title} className="rounded-lg p-3.5 transition-all hover:translate-y-[-1px]"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-start gap-2.5">
            <div className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center"
              style={{ background: 'rgba(43,149,232,0.12)', color: 'var(--gold-hi)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d={it.icon} />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11.5px] font-bold text-white mb-1">{it.title}</p>
              <p className="text-[10.5px] leading-[1.55]" style={{ color: 'rgba(255,255,255,0.62)' }}>{it.body}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ToolsTab() {
  const tools = [
    { name: 'lookup_concept',      tag: 'Vocab',         desc: 'Fuzzy concept search across SNOMED / RxNorm / LOINC / ATC' },
    { name: 'expand_concept_set',  tag: 'Vocab',         desc: 'Descendant expansion via concept_ancestor — class → ingredients' },
    { name: 'run_omop_sql',        tag: 'SQL',           desc: 'Read-only SELECT against the CDM (mutations blocked)' },
    { name: 'build_cohort',        tag: 'Cohort',        desc: 'Emit Circe-compatible JSON, importable to ATLAS via WebAPI' },
    { name: 'characterize_cohort', tag: 'Profile',       desc: 'Achilles-style demographics + comorbidities + drugs + labs' },
    { name: 'search_omop_docs',    tag: 'RAG',           desc: 'TF-IDF over the curated OHDSI / OMOP knowledge corpus' },
    { name: 'render_chart',        tag: 'Viz',           desc: 'Recharts-compatible bar / line / area / pie / scatter specs' },
  ];
  const tagColors = {
    Vocab:  ['rgba(0,114,206,0.10)',  'rgba(43,149,232,0.95)'],
    SQL:    ['rgba(12,110,122,0.10)', 'rgb(60, 196, 207)'],
    Cohort: ['rgba(220,53,69,0.10)',  'rgba(255,140,150,0.95)'],
    Profile:['rgba(184,98,10,0.10)',  'rgba(255,180,90,0.95)'],
    RAG:    ['rgba(123,97,255,0.10)', 'rgba(180,160,255,0.95)'],
    Viz:    ['rgba(218,184,102,0.10)','rgba(218,184,102,0.95)'],
  };
  return (
    <div className="space-y-1.5">
      {tools.map((t, i) => {
        const [bg, fg] = tagColors[t.tag] || ['rgba(255,255,255,0.05)','rgba(255,255,255,0.7)'];
        return (
          <div key={t.name} className="flex items-center gap-3 px-3 py-2.5 rounded-lg"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <span className="text-[9px] font-bold text-white/30 w-5 shrink-0">{String(i + 1).padStart(2, '0')}</span>
            <span className="font-mono text-[11px] font-bold text-white shrink-0" style={{ minWidth: 160 }}>
              {t.name}
            </span>
            <span className="text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded shrink-0"
              style={{ background: bg, color: fg }}>{t.tag}</span>
            <span className="text-[10.5px] flex-1" style={{ color: 'rgba(255,255,255,0.62)' }}>
              {t.desc}
            </span>
          </div>
        );
      })}
      <p className="text-[10px] mt-3 px-1" style={{ color: 'rgba(255,255,255,0.40)' }}>
        Tools are wired through Anthropic Claude's native tool-use. The agent loop runs up to 8 tool-call
        iterations per query. Every call is logged for audit.
      </p>
    </div>
  );
}

function ArchitectureTab() {
  const layers = [
    { tag: 'UI',       parts: ['React 19', 'Vite', 'Tailwind', 'Recharts', 'react-markdown'],
      note: 'Single-page app with a chat-first interface, Cohort Canvas, OMOP browser, characterization dashboard.' },
    { tag: 'API',      parts: ['FastAPI', 'Pydantic', 'uvicorn'],
      note: '20 endpoints across chat, cdm, characterization, documents, cohort, and audit routers.' },
    { tag: 'Agent',    parts: ['Anthropic Claude', 'Tool-use', '7 specialized tools'],
      note: 'System prompt enforces grounded reasoning — concept lookup before SQL, descendant verification, methodology citations.' },
    { tag: 'Data',     parts: ['OMOP CDM v5.4', 'SQLite', 'Eunomia-compatible'],
      note: '2,500-person synthetic cardiometabolic cohort ships pre-built. download_eunomia.py swaps in the canonical OHDSI tutorial dataset.' },
    { tag: 'Vocabulary', parts: ['SNOMED', 'RxNorm', 'LOINC', 'ATC', 'concept_ancestor'],
      note: 'Real concept IDs throughout. Hierarchical expansion via concept_ancestor for class → ingredients.' },
    { tag: 'RAG',      parts: ['TF-IDF', 'Markdown corpus', '4 documents · 23 chunks'],
      note: 'Curated OHDSI methodology corpus, indexed at startup. Drop more .md files in backend/data/corpus/ to extend.' },
  ];
  return (
    <div className="space-y-2">
      {layers.map(l => (
        <div key={l.tag} className="rounded-lg p-3"
          style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="text-[9px] font-bold tracking-widest uppercase px-2 py-0.5 rounded"
              style={{ background: 'rgba(43,149,232,0.12)', color: 'var(--gold-hi)' }}>{l.tag}</span>
            {l.parts.map(p => (
              <span key={p} className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.80)' }}>{p}</span>
            ))}
          </div>
          <p className="text-[10.5px]" style={{ color: 'rgba(255,255,255,0.62)' }}>{l.note}</p>
        </div>
      ))}
    </div>
  );
}

function RoadmapTab() {
  const phases = [
    { phase: 'Phase 1', state: 'shipped', title: 'Agentic core',
      bullets: [
        'Vocabulary lookup + descendant expansion',
        'Circe-compatible cohort builder',
        'Achilles-style characterization',
        'TF-IDF RAG over OHDSI methodology corpus',
        'Read-only SQL playground + person browser',
        'Full audit trail on every query',
      ]},
    { phase: 'Phase 2', state: 'planned', title: 'Network integration',
      bullets: [
        'ATLAS / WebAPI bidirectional sync',
        'Pre-cached Achilles results for instant load',
        'HADES R-package code generation (CohortMethod, PLP)',
        'Athena deep links from every concept',
        'Broadsea Docker integration',
      ]},
    { phase: 'Phase 3', state: 'planned', title: 'Federated execution',
      bullets: [
        'Self-contained Docker bundle for site installation',
        'Study-package authoring workflow',
        'Aggregate-result sharing protocol',
        'Multi-site dashboard for evidence synthesis',
      ]},
  ];
  return (
    <div className="space-y-2.5">
      {phases.map(p => {
        const shipped = p.state === 'shipped';
        return (
          <div key={p.phase} className="rounded-lg p-3.5"
            style={{ background: shipped ? 'rgba(26,122,69,0.06)' : 'rgba(255,255,255,0.04)',
                     border: shipped ? '1px solid rgba(26,122,69,0.30)' : '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] font-bold tracking-widest uppercase"
                style={{ color: shipped ? '#5cd394' : 'var(--gold-hi)' }}>{p.phase}</span>
              <span className="text-[9px] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded"
                style={{ background: shipped ? 'rgba(26,122,69,0.20)' : 'rgba(255,255,255,0.06)',
                         color: shipped ? '#5cd394' : 'rgba(255,255,255,0.55)' }}>
                {p.state}
              </span>
              <span className="text-[12.5px] font-bold text-white">{p.title}</span>
            </div>
            <ul className="space-y-1 ml-1">
              {p.bullets.map(b => (
                <li key={b} className="flex items-start gap-2 text-[10.5px]"
                  style={{ color: 'rgba(255,255,255,0.70)' }}>
                  <span className="shrink-0 mt-1.5 w-1 h-1 rounded-full"
                    style={{ background: shipped ? '#5cd394' : 'var(--gold-hi)' }} />
                  {b}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────

const TABS = [
  { id: 'capabilities', label: 'Capabilities' },
  { id: 'tools',        label: 'Agent Tools' },
  { id: 'arch',         label: 'Architecture' },
  { id: 'roadmap',      label: 'Roadmap' },
];

export default function LandingPage({ setActiveTab }) {
  const [view, setView] = useState('capabilities');

  return (
    <div className="health-landing">
      <ParticleBg />
      <div className="vignette" />

      <div className="page">
        <nav className="top-nav">
          <div className="nav-brand">
            <div className="bar" />
            <div>
              <div className="label">Population Health AI</div>
              <div className="sub">OMOP CDM · Agentic Research</div>
            </div>
          </div>

          <div className="nav-tabs">
            <button className="tab active">Home</button>
            <button className="tab" onClick={() => setActiveTab('chat')}>Assistant</button>
            <button className="tab" onClick={() => setActiveTab('characterization')}>Characterization</button>
            <button className="tab" onClick={() => setActiveTab('browser')}>OMOP Browser</button>
            <button className="tab" onClick={() => setActiveTab('documents')}>Documents</button>
          </div>

          <div className="nav-logo">
            <img src="/logo.png" alt="SAS" style={{ height: 36, width: 'auto', opacity: 0.9 }} />
          </div>
        </nav>

        <section className="main">

          <div className="hero">
            <div className="logo-stage">
              <div className="ring ring-1" />
              <div className="ring ring-2" />
              <div className="ring ring-3" />
              <div className="ring-spin" />
              <div className="orbit orbit-1" />
              <div className="orbit orbit-2" />
              <img src="/logo.png" alt="Population Health AI" className="logo-img" />
            </div>

            <span className="eyebrow">Agentic Intelligence · OHDSI Research</span>
            <h1 className="hero-title">Population Health AI</h1>
            <p className="hero-subtitle">OMOP Common Data Model</p>
            <p className="hero-desc">
              An agentic AI research assistant on top of the OMOP CDM — looks up concepts,
              builds Circe-compatible cohorts, characterizes populations Achilles-style,
              and grounds every answer in OHDSI methodology. Every SQL query is auditable;
              every cohort exports as importable JSON.
            </p>
            <div className="gold-bar" />
            <div className="ctas">
              <button onClick={() => setActiveTab('chat')} className="cta cta-primary">
                <span>Open the Assistant</span>
                <span className="cta-arrow">›</span>
              </button>
              <button onClick={() => setActiveTab('characterization')} className="cta cta-ghost">
                <span>See Characterization</span>
                <span className="cta-arrow">›</span>
              </button>
            </div>
          </div>

          <div className="disc-col">
            <div className="disc-head">
              <div>
                <span className="tag">Phase 1 · Shipped</span>
                <h2>What this assistant can do</h2>
              </div>
              <div className="disc-tabs">
                {TABS.map(t => (
                  <button key={t.id}
                    onClick={() => setView(t.id)}
                    className={`disc-tab ${view === t.id ? 'active' : ''}`}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="disc-body">
              {view === 'capabilities' && <CapabilitiesTab />}
              {view === 'tools'        && <ToolsTab />}
              {view === 'arch'         && <ArchitectureTab />}
              {view === 'roadmap'      && <RoadmapTab />}
            </div>
          </div>
        </section>
      </div>

      <style>{styles}</style>
    </div>
  );
}

const styles = `
.health-landing, .health-landing * { box-sizing: border-box; }
.health-landing {
  --blue: #0072CE;
  --blue-hi: #2B95E8;
  --blue-lo: #005299;
  --blue-grad: linear-gradient(135deg, #2B95E8 0%, #0072CE 50%, #005299 100%);
  --bg-0: #061629;
  --ink-hi: rgba(245,250,255,0.96);
  --ink: rgba(245,250,255,0.72);
  --ink-lo: rgba(245,250,255,0.45);
  --ink-faint: rgba(245,250,255,0.28);
  --stage: 220px;
  --logo: 130px;

  position: fixed; inset: 0;
  width: 100%; height: 100vh;
  background: var(--bg-0);
  font-family: 'Inter', system-ui, sans-serif;
  color: var(--ink);
  overflow: hidden;
  z-index: 1000;
}

.health-landing #bg {
  position: absolute; inset: 0; width: 100%; height: 100%;
  z-index: 0; pointer-events: none;
}

.health-landing .vignette {
  position: absolute; inset: 0; z-index: 1; pointer-events: none;
  background:
    radial-gradient(ellipse 55% 60% at 28% 50%, rgba(43,149,232,0.13) 0%, rgba(6,22,41,0) 60%),
    linear-gradient(180deg, rgba(6,22,41,0.3) 0%, rgba(6,22,41,0) 40%, rgba(6,22,41,0.3) 100%);
}

.health-landing .page {
  position: relative; z-index: 5;
  height: 100vh;
  display: flex; flex-direction: column;
}

.health-landing .top-nav {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 44px; flex-shrink: 0; gap: 24px; position: relative;
}
.health-landing .nav-brand { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
.health-landing .nav-brand .bar { width: 3px; height: 28px; background: var(--blue-grad); border-radius: 2px; }
.health-landing .nav-brand .label {
  font-size: 10px; font-weight: 700; letter-spacing: 0.32em;
  color: var(--blue-hi); text-transform: uppercase;
}
.health-landing .nav-brand .sub {
  font-size: 9px; font-weight: 400; color: var(--ink-faint);
  letter-spacing: 0.2em; margin-top: 3px; text-transform: uppercase;
}
.health-landing .nav-tabs {
  display: flex; gap: 34px;
  position: absolute; left: 50%; transform: translateX(-50%);
}
.health-landing .tab {
  background: none; border: none; cursor: pointer;
  color: var(--ink-lo);
  font-size: 12.5px; font-weight: 500; letter-spacing: 0.03em;
  padding: 8px 0; position: relative; transition: color 0.3s ease;
  white-space: nowrap;
}
.health-landing .tab:hover { color: var(--ink-hi); }
.health-landing .tab.active { color: var(--blue-hi); font-weight: 700; }
.health-landing .tab.active::after {
  content: ''; position: absolute; bottom: -4px; left: 0; right: 0;
  height: 2px; background: var(--blue-grad);
  box-shadow: 0 0 10px rgba(43,149,232,0.6); border-radius: 2px;
}
.health-landing .nav-logo { display: flex; align-items: center; flex-shrink: 0; }

.health-landing .main {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1.15fr;
  gap: 40px;
  padding: 0 56px 24px;
  align-items: center;
  min-height: 0; position: relative;
}

.health-landing .hero {
  position: relative;
  display: flex; flex-direction: column;
  align-items: center; text-align: center;
  animation: hl-fadeUp 0.9s 0.1s ease forwards; opacity: 0;
  height: 100%; justify-content: center; gap: 4px;
}
.health-landing .logo-stage {
  position: relative;
  width: var(--stage); height: var(--stage);
  margin-bottom: 10px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.health-landing .logo-stage::before {
  content: '';
  position: absolute; inset: -25px;
  background: radial-gradient(circle, rgba(43,149,232,0.18) 0%, rgba(0,114,206,0.06) 35%, rgba(6,22,41,0) 70%);
  z-index: 0; pointer-events: none;
  animation: hl-breathe 5s ease-in-out infinite;
}
@keyframes hl-breathe {
  0%,100% { opacity: 1; transform: scale(1); }
  50%     { opacity: 0.65; transform: scale(1.05); }
}
/* Force-reset box model so Tailwind preflight doesn't bleed in */
.health-landing .ring,
.health-landing .ring-spin {
  box-sizing: border-box;
  background: transparent;
  margin: 0; padding: 0;
}

/* Use box-shadow instead of borders — renders thinner & smoother
   because the browser doesn't rasterize a 1px border on a curved edge,
   it renders a sub-pixel inset shadow. Matches the HTML mock's airy feel. */
.health-landing .ring {
  position: absolute; border-radius: 50%; pointer-events: none;
  border: 0 !important;
}
.health-landing .ring-1 {
  inset: 0;
  box-shadow: inset 0 0 0 1px rgba(43,149,232,0.22);
  animation: hl-ringPulse 6s ease-in-out infinite;
}
.health-landing .ring-2 {
  inset: 24px;
  box-shadow: inset 0 0 0 1px rgba(43,149,232,0.14);
  animation: hl-ringPulse 6s ease-in-out infinite 1s;
}
.health-landing .ring-3 {
  inset: 48px;
  box-shadow: inset 0 0 0 1px rgba(43,149,232,0.08);
  animation: hl-ringPulse 6s ease-in-out infinite 2s;
}
.health-landing .ring-spin {
  position: absolute; inset: -6px; border-radius: 50%;
  border-style: solid !important;
  border-width: 1px !important;
  border-top-color: rgba(43,149,232,0.42) !important;
  border-right-color: rgba(43,149,232,0.12) !important;
  border-bottom-color: transparent !important;
  border-left-color: transparent !important;
  animation: hl-spin 18s linear infinite;
}
@keyframes hl-spin { to { transform: rotate(360deg); } }
@keyframes hl-ringPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50%      { transform: scale(1.02); opacity: 0.55; }
}
.health-landing .logo-stage .logo-img {
  position: relative; z-index: 3;
  height: var(--logo); width: auto;
  max-width: calc(var(--stage) - 20px);
  object-fit: contain;
  filter: drop-shadow(0 0 14px rgba(43,149,232,0.5)) drop-shadow(0 0 30px rgba(0,114,206,0.3));
}
.health-landing .orbit {
  position: absolute;
  top: 50%; left: 50%;
  width: 5px; height: 5px;
  border-radius: 50%;
  background: var(--blue-hi);
  box-shadow: 0 0 10px rgba(43,149,232,0.9);
  z-index: 2;
  margin: -2.5px 0 0 -2.5px;
}
.health-landing .orbit-1 { animation: hl-orbit1 14s linear infinite; }
.health-landing .orbit-2 { width: 3px; height: 3px; opacity: 0.7; margin: -1.5px 0 0 -1.5px; animation: hl-orbit2 22s linear infinite; }
@keyframes hl-orbit1 {
  from { transform: rotate(0deg) translateX(calc(var(--stage) / 2 + 6px)); }
  to   { transform: rotate(360deg) translateX(calc(var(--stage) / 2 + 6px)); }
}
@keyframes hl-orbit2 {
  from { transform: rotate(120deg) translateX(calc(var(--stage) / 2 + 6px)); }
  to   { transform: rotate(480deg) translateX(calc(var(--stage) / 2 + 6px)); }
}

.health-landing .eyebrow {
  display: inline-flex; align-items: center; gap: 12px;
  font-size: 9.5px; font-weight: 600; letter-spacing: 0.32em;
  color: var(--blue-hi); text-transform: uppercase;
  margin-bottom: 4px;
}
.health-landing .eyebrow::before, .health-landing .eyebrow::after {
  content: ''; width: 22px; height: 1px;
  background: linear-gradient(90deg, transparent, var(--blue-hi), transparent);
}
.health-landing h1.hero-title {
  font-size: clamp(26px, 2.6vw, 38px);
  font-weight: 900; line-height: 1.05;
  letter-spacing: -0.02em;
  background: linear-gradient(180deg, #E8F4FF 0%, #2B95E8 55%, #005299 120%);
  -webkit-background-clip: text; background-clip: text;
  color: transparent;
  margin: 0 0 2px;
}
.health-landing .hero-subtitle {
  font-size: 11.5px; font-weight: 600;
  color: var(--blue-hi); letter-spacing: 0.12em;
  margin: 0 0 4px; text-transform: uppercase;
}
.health-landing .hero-desc {
  font-size: 12px; font-weight: 400; color: var(--ink);
  line-height: 1.7; max-width: 460px; margin-top: 4px;
}
.health-landing .gold-bar {
  width: 50px; height: 2px; background: var(--blue-grad);
  border-radius: 2px; margin: 14px auto;
  box-shadow: 0 0 12px rgba(43,149,232,0.5);
}
.health-landing .ctas { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
.health-landing .cta {
  display: inline-flex; align-items: center; gap: 10px;
  padding: 11px 22px; border-radius: 4px;
  text-decoration: none;
  font-weight: 700; font-size: 12px; letter-spacing: 0.02em;
  transition: all 0.25s ease; cursor: pointer; border: none;
  min-width: 180px; justify-content: center;
}
.health-landing .cta-primary {
  background: var(--blue-grad); color: #FFFFFF;
  box-shadow: 0 0 0 1px rgba(43,149,232,0.35), 0 6px 22px rgba(0,114,206,0.32);
}
.health-landing .cta-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 0 0 1px rgba(43,149,232,0.6), 0 10px 30px rgba(0,114,206,0.5);
}
.health-landing .cta-ghost {
  background: rgba(43,149,232,0.06); color: var(--blue-hi);
  border: 1px solid rgba(43,149,232,0.35);
}
.health-landing .cta-ghost:hover {
  background: rgba(43,149,232,0.10);
  border-color: rgba(43,149,232,0.55);
  transform: translateY(-2px);
}
.health-landing .cta-arrow { font-size: 14px; transition: transform 0.25s ease; }
.health-landing .cta:hover .cta-arrow { transform: translateX(3px); }

.health-landing .disc-col {
  display: flex; flex-direction: column;
  animation: hl-fadeUp 0.9s 0.3s ease forwards; opacity: 0;
  max-height: 100%; min-height: 0;
}
.health-landing .disc-head {
  margin-bottom: 14px;
  display: flex; align-items: flex-end; justify-content: space-between;
  gap: 12px; flex-wrap: wrap;
}
.health-landing .disc-head .tag {
  display: inline-block; font-size: 9px; font-weight: 700;
  letter-spacing: 0.3em; text-transform: uppercase;
  color: var(--blue-hi); padding: 4px 10px;
  background: rgba(43,149,232,0.08);
  border: 1px solid rgba(43,149,232,0.25);
  border-radius: 2px; margin-bottom: 8px;
}
.health-landing .disc-head h2 {
  font-size: 17px; font-weight: 700;
  color: var(--ink-hi); letter-spacing: -0.01em;
  line-height: 1.3; margin: 0;
}
.health-landing .disc-tabs {
  display: flex; gap: 4px;
  background: rgba(43,149,232,0.06);
  border: 1px solid rgba(43,149,232,0.18);
  padding: 3px; border-radius: 4px;
  flex-shrink: 0;
}
.health-landing .disc-tab {
  background: transparent; color: var(--ink-lo);
  border: none; padding: 6px 14px; border-radius: 3px;
  font-size: 10.5px; font-weight: 600; letter-spacing: 0.06em;
  cursor: pointer; transition: all 0.2s ease; text-transform: uppercase;
}
.health-landing .disc-tab:hover { color: var(--ink-hi); }
.health-landing .disc-tab.active {
  background: var(--blue-grad); color: white;
  box-shadow: 0 2px 8px rgba(0,114,206,0.35);
}

.health-landing .disc-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 4px 4px 0;
  min-height: 0;
}
.health-landing .disc-body::-webkit-scrollbar { width: 4px; }
.health-landing .disc-body::-webkit-scrollbar-thumb {
  background: rgba(43,149,232,0.25); border-radius: 4px;
}

@keyframes hl-fadeUp {
  from { opacity: 0; transform: translateY(20px); }
  to   { opacity: 1; transform: translateY(0); }
}

@media (max-width: 1100px) {
  .health-landing .nav-tabs { display: none; }
  .health-landing .main { grid-template-columns: 1fr; padding: 0 24px 16px; gap: 18px; }
  .health-landing { --stage: 190px; --logo: 110px; }
}
`;
