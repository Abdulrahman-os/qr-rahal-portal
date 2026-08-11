import { useState, useRef, useCallback } from 'react';
import Head from 'next/head';
import { ENDPOINTS, TAGS } from '../lib/endpoints';

// ─── Constants ───────────────────────────────────────────────────────────────
const METHOD_STYLE = {
  GET:    { bg:'#0D3520', color:'#2ECC7A', border:'#1A5A38' },
  POST:   { bg:'#0D2035', color:'#4A9EFF', border:'#1A3A5C' },
  PUT:    { bg:'#2A1A00', color:'#F0A030', border:'#4A3000' },
  DELETE: { bg:'#2A0D0D', color:'#FF5A5A', border:'#4A1A1A' },
};
const STATUS_STYLE = {
  2: { bg:'#0D3520', color:'#2ECC7A', border:'#1A5A38' },
  3: { bg:'#1A2A00', color:'#C8FF50', border:'#3A5A00' },
  4: { bg:'#2A1A00', color:'#FF8C00', border:'#5A3A00' },
  5: { bg:'#2A0D0D', color:'#FF5A5A', border:'#4A1A1A' },
};

// ─── Components ──────────────────────────────────────────────────────────────
function MethodBadge({ method, size = 'md' }) {
  const s = METHOD_STYLE[method] || METHOD_STYLE.GET;
  const pad = size === 'sm' ? '1px 6px' : '3px 9px';
  const fs  = size === 'sm' ? 10 : 11;
  return (
    <span style={{ background:s.bg, color:s.color, border:`1px solid ${s.border}`, borderRadius:4, padding:pad, fontSize:fs, fontWeight:700, fontFamily:'monospace', letterSpacing:1, minWidth:size==='sm'?44:56, textAlign:'center', display:'inline-block' }}>
      {method}
    </span>
  );
}

function StatusBadge({ code }) {
  const cat = Math.floor(code / 100);
  const s = STATUS_STYLE[cat] || STATUS_STYLE[5];
  return (
    <span style={{ background:s.bg, color:s.color, border:`1px solid ${s.border}`, borderRadius:4, padding:'2px 8px', fontSize:11, fontWeight:700, fontFamily:'monospace' }}>
      {code}
    </span>
  );
}

function JsonView({ data }) {
  const str = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return (
    <pre style={{ background:'#050810', color:'#7EC8A4', borderRadius:6, padding:'12px 14px', fontSize:11.5, lineHeight:1.65, overflowX:'auto', margin:0, border:'1px solid #1F2A3D', fontFamily:"'Fira Code','Courier New',monospace", whiteSpace:'pre-wrap', wordBreak:'break-all' }}>
      {str}
    </pre>
  );
}

function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(text).then(()=>{ setCopied(true); setTimeout(()=>setCopied(false),1500); }); };
  return (
    <button onClick={copy} style={{ background:'#1F2A3D', color:copied?'#2ECC7A':'#6B7A99', border:'1px solid #2A3A50', borderRadius:4, padding:'3px 8px', fontSize:10, cursor:'pointer' }}>
      {copied ? '✓ Copied' : '⎘ Copy'}
    </button>
  );
}

function Spinner() {
  return <span className="spin" style={{ display:'inline-block', width:14, height:14, border:'2px solid #1F2A3D', borderTop:'2px solid #C8A96E', borderRadius:'50%' }} />;
}

// ─── Endpoint Card ────────────────────────────────────────────────────────────
function EndpointCard({ ep, token, setToken }) {
  const [open, setOpen]         = useState(false);
  const [formVals, setFormVals] = useState({});
  const [loading, setLoading]   = useState(false);
  const [response, setResponse] = useState(null);
  const [captchaImg, setCaptchaImg] = useState(null);
  const [captchaToken, setCaptchaToken] = useState('');
  const [devOtp, setDevOtp]     = useState('');
  const responseRef = useRef(null);

  const needsCaptcha = ep.fields?.some(f => f.name === 'captchaCode');
  const needsToken   = ep.auth;

  const loadCaptcha = useCallback(async () => {
    try {
      const r = await fetch('/api/captcha/generate');
      const d = await r.json();
      setCaptchaImg(d.imageBase64);
      setCaptchaToken(d.captchaToken);
      setFormVals(v => ({ ...v, captchaToken: d.captchaToken }));
      if (d._dev_code) setFormVals(v => ({ ...v, captchaCode: d._dev_code }));
    } catch {}
  }, []);

  const handleOpen = () => {
    const next = !open;
    setOpen(next);
    if (next && needsCaptcha && !captchaImg) loadCaptcha();
  };

  const buildUrl = () => {
    let path = ep.path;
    // Replace path params
    (ep.params || []).filter(p => p.in === 'path').forEach(p => {
      const val = formVals[p.name] || `:${p.name}`;
      path = path.replace(`:${p.name}`, val).replace(`{${p.name}}`, val);
    });
    // Also replace from fields
    (ep.fields || []).filter(f => f.name !== 'captchaToken' && f.name !== 'captchaCode').forEach(f => {
      if (path.includes(`:${f.name}`)) path = path.replace(`:${f.name}`, formVals[f.name] || `:${f.name}`);
    });
    // Query params for GET
    if (ep.method === 'GET') {
      const qParams = (ep.fields || []).filter(f => !path.includes(f.name) && !['captchaToken','captchaCode'].includes(f.name) && formVals[f.name]);
      if (qParams.length) path += '?' + qParams.map(f => `${f.name}=${encodeURIComponent(formVals[f.name])}`).join('&');
    }
    return path;
  };

  const buildBody = () => {
    if (ep.method === 'GET' || ep.method === 'DELETE') return null;
    const body = {};
    (ep.fields || []).forEach(f => {
      const v = formVals[f.name];
      if (v === undefined || v === '') return;
      if (f.type === 'boolean') body[f.name] = v === 'true' || v === true;
      else body[f.name] = v;
    });
    // Always include captchaToken if needed
    if (needsCaptcha && captchaToken) body.captchaToken = captchaToken;
    return body;
  };

  const execute = async () => {
    setLoading(true); setResponse(null);
    const url = buildUrl();
    const body = buildBody();
    const headers = { 'Content-Type': 'application/json' };
    if (needsToken && token) headers['Authorization'] = `Bearer ${token}`;

    const t0 = Date.now();
    try {
      const r = await fetch(url, { method: ep.method, headers, body: body ? JSON.stringify(body) : undefined });
      const elapsed = Date.now() - t0;
      let data;
      try { data = await r.json(); } catch { data = { raw: await r.text() }; }
      setResponse({ status: r.status, data, elapsed, url, body });

      // Auto-store token if login response
      if (data?.accessToken && !ep.auth) setToken(data.accessToken);
      // Store OTP for dev
      if (data?._dev_otp) setDevOtp(data._dev_otp);
      // Auto-fill captchaToken from generate
      if (data?.captchaToken) { setCaptchaImg(data.imageBase64); setCaptchaToken(data.captchaToken); }

      setTimeout(() => responseRef.current?.scrollIntoView({ behavior:'smooth', block:'nearest' }), 100);
    } catch (err) {
      setResponse({ status: 0, data: { code:'NETWORK_ERROR', message: err.message }, elapsed: Date.now()-t0, url, body });
    }
    setLoading(false);
  };

  const isStar = ep.star;
  const ms = METHOD_STYLE[ep.method] || METHOD_STYLE.GET;

  return (
    <div style={{ border:`1px solid ${isStar?'#4A3000':'#1F2A3D'}`, borderRadius:10, marginBottom:10, overflow:'hidden', background:isStar?'#0C0900':'#111825', boxShadow:isStar?'0 0 0 1px #3A2000':'none' }}>
      {/* Header */}
      <div onClick={handleOpen} style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 16px', cursor:'pointer', userSelect:'none', borderLeft:`3px solid ${open ? ms.color : 'transparent'}` }}>
        <MethodBadge method={ep.method} />
        <code style={{ color:'#A8C8F0', fontSize:12.5, flex:'0 0 auto', maxWidth:340, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{ep.path}</code>
        <span style={{ color:'#C8D4E8', fontSize:12.5, flex:1 }}>{ep.summary}</span>
        {isStar && <span style={{ fontSize:10, color:'#C8A96E', background:'#1A0F00', border:'1px solid #4A3000', borderRadius:3, padding:'1px 6px', flexShrink:0 }}>KEY OP</span>}
        {!ep.auth && <span style={{ fontSize:9.5, color:'#6B7A99', background:'#0D1020', border:'1px solid #1F2A3D', borderRadius:3, padding:'1px 5px', flexShrink:0 }}>No auth</span>}
        <span style={{ color:'#4A5A70', fontSize:12, marginLeft:'auto', flexShrink:0 }}>{open ? '▲' : '▼'}</span>
      </div>

      {/* Body */}
      {open && (
        <div style={{ borderTop:'1px solid #1F2A3D', padding:'16px 16px 14px' }} className="fade-in">
          <p style={{ color:'#8A9AB8', fontSize:12.5, lineHeight:1.65, marginBottom:14 }}>{ep.desc}</p>

          {/* Auth notice */}
          {ep.auth && (
            <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 12px', background:'#08101E', border:'1px solid #1A2A40', borderRadius:6, marginBottom:14, fontSize:12 }}>
              <span>🔒</span>
              <span style={{ color:'#4A9EFF' }}>Requires <code style={{ color:'#7EC8A4' }}>Authorization: Bearer &lt;JWT&gt;</code></span>
              {token
                ? <span style={{ marginLeft:'auto', color:'#2ECC7A', fontSize:11 }}>✓ Token set</span>
                : <span style={{ marginLeft:'auto', color:'#FF8C00', fontSize:11 }}>⚠ No token — login first</span>}
            </div>
          )}

          {/* Dev OTP notice */}
          {devOtp && (
            <div style={{ padding:'7px 12px', background:'#0A1A00', border:'1px solid #1A5A00', borderRadius:6, marginBottom:14, fontSize:12, color:'#6EE880' }}>
              🔑 Dev OTP: <strong>{devOtp}</strong> — paste into /api/auth/otp/verify
            </div>
          )}

          {/* Fields */}
          {ep.fields && ep.fields.length > 0 && (
            <div style={{ marginBottom:14 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#C8A96E', letterSpacing:1, textTransform:'uppercase', marginBottom:8 }}>Parameters & Body</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:8 }}>
                {ep.fields.filter(f => !['captchaToken'].includes(f.name)).map(f => (
                  <div key={f.name}>
                    <label style={{ display:'block', fontSize:10.5, color:'#6B7A99', marginBottom:3 }}>
                      <code style={{ color:'#A8C5F0' }}>{f.name}</code>
                      {f.required && <span style={{ color:'#FF5A5A', marginLeft:4 }}>*</span>}
                      <span style={{ marginLeft:4, color:'#3A4A60' }}>({f.type})</span>
                    </label>
                    {f.type === 'select' ? (
                      <select value={formVals[f.name]||''} onChange={e=>setFormVals(v=>({...v,[f.name]:e.target.value}))}
                        style={{ width:'100%', background:'#0D1420', color:'#E8ECF4', border:'1px solid #1F2A3D', borderRadius:5, padding:'7px 9px', fontSize:12 }}>
                        <option value="">— select —</option>
                        {f.options.map(o=><option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : f.type === 'boolean' ? (
                      <select value={formVals[f.name]===undefined?'':String(formVals[f.name])} onChange={e=>setFormVals(v=>({...v,[f.name]:e.target.value==='true'}))}
                        style={{ width:'100%', background:'#0D1420', color:'#E8ECF4', border:'1px solid #1F2A3D', borderRadius:5, padding:'7px 9px', fontSize:12 }}>
                        <option value="">— select —</option>
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : (
                      <input type={f.type === 'password' ? 'password' : f.type === 'date' ? 'date' : 'text'}
                        value={formVals[f.name]||''}
                        onChange={e=>setFormVals(v=>({...v,[f.name]:e.target.value}))}
                        placeholder={f.desc}
                        style={{ width:'100%', background:'#0D1420', color:'#E8ECF4', border:'1px solid #1F2A3D', borderRadius:5, padding:'7px 9px', fontSize:12, outline:'none' }}
                      />
                    )}
                    <div style={{ fontSize:9.5, color:'#3A4A60', marginTop:2 }}>{f.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* CAPTCHA */}
          {needsCaptcha && (
            <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:14, padding:'10px 12px', background:'#080C18', border:'1px solid #1A2A40', borderRadius:6 }}>
              {captchaImg
                ? <img src={captchaImg} alt="captcha" style={{ borderRadius:4, height:44 }} />
                : <div style={{ width:160, height:44, background:'#111', borderRadius:4, display:'flex', alignItems:'center', justifyContent:'center', color:'#3A4A60', fontSize:11 }}>Loading...</div>}
              <button onClick={loadCaptcha} style={{ background:'#1F2A3D', color:'#C8A96E', border:'1px solid #2A3A50', borderRadius:5, padding:'6px 10px', fontSize:11 }}>↻ Refresh</button>
              <div style={{ flex:1 }}>
                <label style={{ fontSize:10, color:'#6B7A99', display:'block', marginBottom:3 }}>CAPTCHA Code <span style={{color:'#FF5A5A'}}>*</span></label>
                <input value={formVals.captchaCode||''} onChange={e=>setFormVals(v=>({...v,captchaCode:e.target.value}))}
                  placeholder="Enter the code shown"
                  style={{ width:'100%', background:'#0D1420', color:'#E8ECF4', border:'1px solid #1F2A3D', borderRadius:5, padding:'6px 9px', fontSize:12, outline:'none' }}
                />
              </div>
            </div>
          )}

          {/* Request preview */}
          <div style={{ marginBottom:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:5 }}>
              <span style={{ fontSize:10, fontWeight:700, color:'#C8A96E', letterSpacing:1, textTransform:'uppercase' }}>Request Preview</span>
              <CopyButton text={`${ep.method} ${buildUrl()}\n${buildBody() ? '\n' + JSON.stringify(buildBody(), null, 2) : ''}`} />
            </div>
            <div style={{ background:'#050810', borderRadius:6, padding:'10px 13px', border:'1px solid #1F2A3D', fontSize:11, fontFamily:'monospace' }}>
              <span style={{ color: ms.color }}>{ep.method}</span> <span style={{ color:'#B8D4F0' }}>{buildUrl()}</span>
              {needsToken && token && <div style={{ color:'#3A5A40', marginTop:4 }}>Authorization: Bearer {token.slice(0,20)}...</div>}
              {buildBody() && <div style={{ color:'#7EC8A4', marginTop:6 }}>{JSON.stringify(buildBody(), null, 2)}</div>}
            </div>
          </div>

          {/* Execute button */}
          <button onClick={execute} disabled={loading}
            style={{ background: loading ? '#1A2A3A' : 'linear-gradient(135deg,#5C0931,#8B1445)', color:'#fff', border:'none', borderRadius:7, padding:'9px 24px', fontSize:13, fontWeight:600, cursor:loading?'not-allowed':'pointer', display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
            {loading ? <><Spinner /> Executing…</> : `▶ Execute ${ep.method} Request`}
          </button>

          {/* Response */}
          {response && (
            <div ref={responseRef} className="fade-in">
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                <StatusBadge code={response.status} />
                <span style={{ color:'#6B7A99', fontSize:11 }}>{response.elapsed}ms</span>
                <span style={{ color:'#3A4A60', fontSize:11, fontFamily:'monospace' }}>{response.url}</span>
                <CopyButton text={JSON.stringify(response.data, null, 2)} />
              </div>
              <JsonView data={response.data} />

              {/* Helpful hints */}
              {response.status === 200 && response.data?.accessToken && (
                <div style={{ marginTop:8, padding:'8px 12px', background:'#0A1A00', border:'1px solid #1A5A00', borderRadius:5, fontSize:11.5, color:'#6EE880' }}>
                  ✓ Token saved automatically — protected endpoints are now unlocked.
                </div>
              )}
              {response.status === 201 && response.data?.pnr && (
                <div style={{ marginTop:8, padding:'8px 12px', background:'#0A1A1A', border:'1px solid #005A5A', borderRadius:5, fontSize:11.5, color:'#50E8E8' }}>
                  ✓ Booking created — PNR: <strong>{response.data.pnr}</strong> · E-ticket: <strong>{response.data.tickets?.[0]?.ticketNumber}</strong>
                </div>
              )}
              {response.data?._dev_otp && (
                <div style={{ marginTop:8, padding:'8px 12px', background:'#0A1A00', border:'1px solid #1A5A00', borderRadius:5, fontSize:11.5, color:'#6EE880' }}>
                  🔑 Dev OTP: <strong style={{fontSize:16}}>{response.data._dev_otp}</strong> — use in /api/auth/otp/verify
                </div>
              )}
            </div>
          )}

          {/* Example response */}
          <details style={{ marginTop:14 }}>
            <summary style={{ fontSize:10, color:'#3A4A60', cursor:'pointer', letterSpacing:1, textTransform:'uppercase', fontWeight:700 }}>Example Response Schema</summary>
            <div style={{ marginTop:8 }}><JsonView data={ep.example_response} /></div>
          </details>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function Home() {
  const [activeTag, setActiveTag] = useState('Booking');
  const [search, setSearch]       = useState('');
  const [token, setToken]         = useState('');
  const [showTokenPanel, setShowTokenPanel] = useState(false);

  const filtered = ENDPOINTS.filter(ep => {
    const matchTag    = activeTag === 'ALL' || ep.tag === activeTag;
    const q           = search.toLowerCase();
    const matchSearch = !q || ep.path.toLowerCase().includes(q) || ep.summary.toLowerCase().includes(q) || ep.tag.toLowerCase().includes(q) || ep.desc.toLowerCase().includes(q);
    return matchTag && matchSearch;
  });

  const countByTag = t => ENDPOINTS.filter(e => e.tag === t).length;

  return (
    <>
      <Head>
        <title>RAHAL API Portal — Qatar Airways Staff Travel</title>
        <meta name="description" content="RAHAL Qatar Airways Staff Travel System — Interactive REST API Portal" />
        <meta name="robots" content="noindex,nofollow" />
        <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='6' fill='%235C0931'/><text x='16' y='22' text-anchor='middle' fill='%23C8A96E' font-size='14' font-weight='bold' font-family='sans-serif'>QR</text></svg>" />
      </Head>

      {/* ─── Header ─── */}
      <header style={{ background:'#5C0931', borderBottom:'3px solid #C8A96E', position:'sticky', top:0, zIndex:100 }}>
        <div style={{ maxWidth:1200, margin:'0 auto', padding:'0 20px', display:'flex', alignItems:'center', height:58, gap:14 }}>
          <div style={{ width:34, height:34, borderRadius:'50%', background:'#C8A96E', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <span style={{ color:'#5C0931', fontWeight:900, fontSize:13 }}>QR</span>
          </div>
          <div>
            <div style={{ fontWeight:700, fontSize:15, letterSpacing:.3 }}>RAHAL Staff Travel System</div>
            <div style={{ fontSize:10, color:'rgba(255,255,255,.6)', letterSpacing:.5 }}>Interactive REST API Portal · Internal Technical Reference</div>
          </div>
          <div style={{ marginLeft:'auto', display:'flex', gap:10, alignItems:'center' }}>
            <span style={{ background:'rgba(0,0,0,.3)', color:'#C8A96E', border:'1px solid #C8A96E', borderRadius:4, padding:'2px 8px', fontSize:10, fontWeight:700 }}>v2.6</span>
            <span style={{ background:'rgba(0,0,0,.3)', color:'#7EC8A4', border:'1px solid #1A5A38', borderRadius:4, padding:'2px 8px', fontSize:10 }}>OpenAPI 3.1</span>
            <button onClick={()=>setShowTokenPanel(p=>!p)}
              style={{ background: token ? '#0D3520' : '#1A0A10', color: token ? '#2ECC7A' : '#C8A96E', border:`1px solid ${token?'#1A5A38':'#5C0931'}`, borderRadius:5, padding:'5px 12px', fontSize:11, cursor:'pointer' }}>
              {token ? '🔓 Token Set' : '🔐 Set Token'}
            </button>
          </div>
        </div>

        {/* Token panel */}
        {showTokenPanel && (
          <div style={{ background:'#0A0C14', borderTop:'1px solid #1F2A3D', padding:'10px 20px' }}>
            <div style={{ maxWidth:1200, margin:'0 auto', display:'flex', gap:10, alignItems:'center' }}>
              <span style={{ fontSize:11, color:'#6B7A99', whiteSpace:'nowrap' }}>Bearer Token:</span>
              <input value={token} onChange={e=>setToken(e.target.value)} placeholder="Paste JWT from /api/auth/otp/verify or /api/auth/login/oal …"
                style={{ flex:1, background:'#111520', color:'#E8ECF4', border:'1px solid #1F2A3D', borderRadius:5, padding:'6px 10px', fontSize:11, fontFamily:'monospace', outline:'none' }}
              />
              <button onClick={()=>setToken('')} style={{ background:'#2A0D0D', color:'#FF5A5A', border:'1px solid #4A1A1A', borderRadius:5, padding:'6px 10px', fontSize:11, cursor:'pointer' }}>Clear</button>
              <button onClick={()=>setShowTokenPanel(false)} style={{ background:'#1F2A3D', color:'#6B7A99', border:'1px solid #2A3A50', borderRadius:5, padding:'6px 10px', fontSize:11, cursor:'pointer' }}>✕</button>
            </div>
          </div>
        )}
      </header>

      {/* ─── Info bar ─── */}
      <div style={{ background:'#0A1020', borderBottom:'1px solid #1F2A3D', padding:'7px 20px' }}>
        <div style={{ maxWidth:1200, margin:'0 auto', display:'flex', gap:24, flexWrap:'wrap', fontSize:11, color:'#6B7A99' }}>
          <span>🌐 <strong style={{color:'#E8ECF4'}}>Base URL:</strong> <code style={{color:'#7EC8A4'}}>/api</code></span>
          <span>🔐 <strong style={{color:'#E8ECF4'}}>Auth:</strong> <code style={{color:'#7EC8A4'}}>Authorization: Bearer &lt;JWT&gt;</code></span>
          <span>📋 <strong style={{color:'#E8ECF4'}}>Content-Type:</strong> <code style={{color:'#7EC8A4'}}>application/json</code></span>
          <span>💡 <strong style={{color:'#C8A96E'}}>Tip:</strong> Login first → OTP shows in response → paste token → execute protected endpoints</span>
        </div>
      </div>

      {/* ─── Layout ─── */}
      <div style={{ maxWidth:1200, margin:'0 auto', padding:'18px 20px', display:'flex', gap:18 }}>

        {/* Sidebar */}
        <nav style={{ width:198, flexShrink:0 }}>
          <div style={{ background:'#111825', borderRadius:8, border:'1px solid #1F2A3D', overflow:'hidden', position:'sticky', top:80 }}>
            <div style={{ padding:'8px 12px', background:'#0D1020', borderBottom:'1px solid #1F2A3D', fontSize:9, fontWeight:700, color:'#6B7A99', letterSpacing:1.5, textTransform:'uppercase' }}>API Sections</div>
            {['ALL', ...TAGS].map(tag => (
              <div key={tag} onClick={()=>setActiveTag(tag)}
                style={{ padding:'8px 12px', cursor:'pointer', fontSize:11.5, display:'flex', justifyContent:'space-between', alignItems:'center', borderLeft:`3px solid ${activeTag===tag?'#C8A96E':'transparent'}`, borderBottom:'1px solid #1F2A3D', background:activeTag===tag?'#1A1030':'transparent', color:activeTag===tag?'#C8A96E':'#C8D4E8', transition:'all .1s' }}>
                <span>{tag}</span>
                {tag !== 'ALL' && <span style={{ background:'#1A2030', color:'#6B7A99', borderRadius:10, padding:'1px 6px', fontSize:9.5 }}>{countByTag(tag)}</span>}
              </div>
            ))}
          </div>
        </nav>

        {/* Main */}
        <main style={{ flex:1, minWidth:0 }}>
          {/* Search */}
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search endpoints, paths, tags, or descriptions…"
            style={{ width:'100%', background:'#111825', border:'1px solid #1F2A3D', borderRadius:7, color:'#E8ECF4', padding:'9px 14px', fontSize:13, outline:'none', marginBottom:14, boxSizing:'border-box' }}
          />

          {/* Legend */}
          <div style={{ display:'flex', gap:8, marginBottom:12, flexWrap:'wrap', alignItems:'center' }}>
            {['GET','POST','PUT','DELETE'].map(m=>(
              <span key={m} style={{ display:'flex', alignItems:'center', gap:5 }}><MethodBadge method={m} size="sm" /><span style={{fontSize:10.5,color:'#6B7A99'}}>{m}</span></span>
            ))}
            <span style={{ color:'#C8A96E', fontSize:10.5, marginLeft:6 }}>★ KEY OP = critical ticket / refund / print operation</span>
          </div>

          {/* Count */}
          <div style={{ color:'#6B7A99', fontSize:11, marginBottom:12 }}>
            Showing <strong style={{color:'#E8ECF4'}}>{filtered.length}</strong> of <strong style={{color:'#E8ECF4'}}>{ENDPOINTS.length}</strong> endpoints
            {activeTag !== 'ALL' && <span style={{color:'#C8A96E'}}> · {activeTag}</span>}
          </div>

          {/* Quick-start flow */}
          {activeTag === 'ALL' && !search && (
            <div style={{ background:'#0C0F1A', border:'1px solid #1F2A3D', borderRadius:8, padding:'14px 16px', marginBottom:16, fontSize:12 }}>
              <div style={{ color:'#C8A96E', fontWeight:700, letterSpacing:.5, marginBottom:10, fontSize:11, textTransform:'uppercase' }}>▶ Quick-Start: Issue a Staff Ticket</div>
              {[
                ['1','GET /api/captcha/generate','Get a CAPTCHA token and image'],
                ['2','POST /api/auth/login/qr-staff','Login with staffNumber: 123456, password: P@ssword1!'],
                ['3','POST /api/auth/otp/send','Send OTP (dev OTP shown in response)'],
                ['4','POST /api/auth/otp/verify','Verify OTP → JWT token auto-saved'],
                ['5','POST /api/flights/search','Search DOH→LHR, get flightOptionId'],
                ['6','POST /api/bookings','Issue ticket → PNR + e-ticket number returned'],
                ['7','GET /api/bookings/{pnr}/eticket/print','Download e-ticket PDF'],
              ].map(([n,path,hint]) => (
                <div key={n} style={{ display:'flex', gap:10, marginBottom:7, alignItems:'flex-start' }}>
                  <span style={{ background:'#1A1030', color:'#C8A96E', borderRadius:'50%', width:18, height:18, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:700, flexShrink:0, marginTop:1 }}>{n}</span>
                  <div><code style={{color:'#7EC8A4',fontSize:11.5}}>{path}</code> <span style={{color:'#6B7A99',fontSize:11}}>— {hint}</span></div>
                </div>
              ))}
            </div>
          )}

          {/* Endpoint cards */}
          {filtered.length === 0
            ? <div style={{color:'#6B7A99',textAlign:'center',padding:'40px 0',fontSize:14}}>No endpoints match your search.</div>
            : filtered.map((ep, i) => <EndpointCard key={`${ep.method}-${ep.path}`} ep={ep} token={token} setToken={setToken} />)
          }

          {/* Footer */}
          <div style={{ marginTop:28, paddingTop:14, borderTop:'1px solid #1F2A3D', display:'flex', justifyContent:'space-between', fontSize:10.5, color:'#6B7A99' }}>
            <span>© 2022–2026 Qatar Airways. All Rights Reserved. Confidential — Internal Use Only.</span>
            <span style={{color:'#C8A96E'}}>RAHAL v2.6 · {ENDPOINTS.length} Live Endpoints</span>
          </div>
        </main>
      </div>
    </>
  );
}
