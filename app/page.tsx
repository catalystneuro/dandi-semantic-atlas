"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Dandiset = {
  id: string; title: string; description: string; x: number; y: number; z: number;
  cluster: number; keywords: string[]; species: string[]; approaches: string[];
  techniques: string[]; bytes: number; files: number; subjects: number;
  modified: string; url: string;
};

type Cluster = { id: number; label: string; count: number; color: string; terms: string[] };
type ArchiveData = { generatedAt: string; total: number; method: string; clusters: Cluster[]; dandisets: Dandiset[] };

const formatBytes = (bytes: number) => {
  if (!bytes) return "—";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1000)), units.length - 1);
  return `${(bytes / 1000 ** i).toFixed(i > 2 ? 1 : 0)} ${units[i]}`;
};

function MapCanvas({ data, activeClusters, query, selected, onSelect }: {
  data: ArchiveData; activeClusters: Set<number>; query: string; selected: Dandiset | null;
  onSelect: (d: Dandiset) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<Dandiset | null>(null);
  const defaultView = { zoom: 1, rotX: -0.18, rotY: 0.42 };
  const [view, setView] = useState(defaultView);
  const drag = useRef<{ x: number; y: number; rotX: number; rotY: number } | null>(null);
  const normalizedQuery = query.trim().toLowerCase();

  const visible = useMemo(() => data.dandisets.filter((d) => {
    if (!activeClusters.has(d.cluster)) return false;
    if (!normalizedQuery) return true;
    return `${d.id} ${d.title} ${d.description} ${d.keywords.join(" ")} ${d.species.join(" ")}`.toLowerCase().includes(normalizedQuery);
  }), [data, activeClusters, normalizedQuery]);

  const pointAt = (d: Dandiset, w: number, h: number) => {
    const px = (d.x - .5) * 2; const py = (d.y - .5) * 2; const pz = (d.z - .5) * 2;
    const cy = Math.cos(view.rotY); const sy = Math.sin(view.rotY);
    const cx = Math.cos(view.rotX); const sx = Math.sin(view.rotX);
    const x1 = px * cy - pz * sy; const z1 = px * sy + pz * cy;
    const y1 = py * cx - z1 * sx; const depth = py * sx + z1 * cx;
    const perspective = 1 / (1.7 - depth * .34);
    const size = Math.min(w, h) * .82 * view.zoom;
    return { x: w / 2 + x1 * size * perspective, y: h / 2 + y1 * size * perspective, depth, scale: Math.max(.72, Math.min(1.28, perspective * 1.7)) };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = frameRef.current;
    if (!canvas || !frame) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const draw = () => {
      const rect = frame.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      canvas.width = rect.width * ratio; canvas.height = rect.height * ratio;
      canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`;
      ctx.scale(ratio, ratio); ctx.clearRect(0, 0, rect.width, rect.height);
      ctx.fillStyle = "#f7f8f4"; ctx.fillRect(0, 0, rect.width, rect.height);
      ctx.strokeStyle = "rgba(25,42,38,.055)"; ctx.lineWidth = 1;
      for (let x = 0; x < rect.width; x += 42) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, rect.height); ctx.stroke(); }
      for (let y = 0; y < rect.height; y += 42) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(rect.width, y); ctx.stroke(); }
      const projected = visible.map((d) => ({ d, p: pointAt(d, rect.width, rect.height) })).sort((a, b) => a.p.depth - b.p.depth);
      projected.forEach(({ d, p }) => {
        const cluster = data.clusters.find((c) => c.id === d.cluster);
        const isSelected = selected?.id === d.id; const isHovered = hovered?.id === d.id;
        if (isSelected || isHovered) {
          ctx.beginPath(); ctx.arc(p.x, p.y, (isSelected ? 11 : 9) * p.scale, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(255,255,255,.9)"; ctx.fill();
        }
        ctx.beginPath(); ctx.arc(p.x, p.y, (isSelected ? 6.5 : isHovered ? 5.5 : 3.4) * p.scale, 0, Math.PI * 2);
        ctx.fillStyle = cluster?.color ?? "#55766f"; ctx.globalAlpha = isSelected || isHovered ? 1 : .55 + p.scale * .2; ctx.fill(); ctx.globalAlpha = 1;
      });
    };
    draw();
    const observer = new ResizeObserver(draw); observer.observe(frame);
    return () => observer.disconnect();
  }, [visible, data.clusters, selected, hovered, view]);

  const findPoint = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    let best: Dandiset | null = null; let distance = 13;
    visible.forEach((d) => { const p = pointAt(d, rect.width, rect.height); const n = Math.hypot(p.x - (clientX - rect.left), p.y - (clientY - rect.top)); if (n < distance) { best = d; distance = n; } });
    return best;
  };

  return <div className="map-frame" ref={frameRef}>
    <canvas ref={canvasRef} aria-label={`Rotatable three-dimensional map of ${visible.length} DANDI datasets`}
      onPointerMove={(e) => {
        if (drag.current) { setView((v) => ({ ...v, rotY: drag.current!.rotY + (e.clientX - drag.current!.x) * .008, rotX: Math.max(-1.35, Math.min(1.35, drag.current!.rotX + (e.clientY - drag.current!.y) * .008)) })); return; }
        setHovered(findPoint(e.clientX, e.clientY));
      }}
      onPointerDown={(e) => { const hit = findPoint(e.clientX, e.clientY); if (hit) onSelect(hit); else { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, rotX: view.rotX, rotY: view.rotY }; } }}
      onPointerUp={() => { drag.current = null; }} onPointerLeave={() => { drag.current = null; setHovered(null); }} />
    <div className="map-caption"><span className="pulse" /> {visible.length.toLocaleString()} datasets · drag to rotate</div>
    <div className="zoom-controls" aria-label="Map zoom controls">
      <button onClick={() => setView((v) => ({ ...v, zoom: Math.min(2.8, v.zoom * 1.22) }))} aria-label="Zoom in">+</button>
      <button onClick={() => setView((v) => ({ ...v, zoom: Math.max(.7, v.zoom / 1.22) }))} aria-label="Zoom out">−</button>
      <button className="reset" onClick={() => setView(defaultView)}>Reset</button>
    </div>
    {hovered && <div className="tooltip"><b>{hovered.title}</b><span>DANDI:{hovered.id}</span></div>}
  </div>;
}

export default function Home() {
  const [data, setData] = useState<ArchiveData | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Dandiset | null>(null);
  const [activeClusters, setActiveClusters] = useState<Set<number>>(new Set());
  const [showAbout, setShowAbout] = useState(false);

  useEffect(() => {
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    fetch(`${basePath}/data/dandisets.json`).then((r) => r.json()).then((d: ArchiveData) => { setData(d); setActiveClusters(new Set(d.clusters.map((c) => c.id))); });
  }, []);
  const suggestions = useMemo(() => !data || query.trim().length < 2 ? [] : data.dandisets.filter((d) => `${d.title} ${d.description} ${d.keywords.join(" ")}`.toLowerCase().includes(query.toLowerCase())).slice(0, 5), [data, query]);

  if (!data) return <main className="loading"><span className="mark">d</span><p>Charting the archive…</p></main>;

  const toggleCluster = (id: number) => setActiveClusters((old) => { const next = new Set(old); next.has(id) ? next.delete(id) : next.add(id); return next; });

  return <main className="app-shell">
    <header>
      <a className="brand" href="https://dandiarchive.org" target="_blank" rel="noreferrer"><span className="mark">d</span><span><b>DANDI Atlas</b><small>Explore the neuroscience archive</small></span></a>
      <div className="header-actions"><span className="updated">Updated {new Date(data.generatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span><button onClick={() => setShowAbout(true)}>About this map</button></div>
    </header>
    <section className="intro">
      <div><p className="eyebrow">A semantic field guide</p><h1>Find data by following ideas.</h1><p>Each point is a Dandiset. Nearby datasets share scientific language, species, methods, and anatomy.</p></div>
      <div className="search-wrap">
        <label htmlFor="search">Search titles, abstracts, species, or methods</label>
        <div className="search"><span>⌕</span><input id="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Try “hippocampus”, “zebrafish”, or “calcium imaging”" /><kbd>/</kbd></div>
        {suggestions.length > 0 && <div className="suggestions">{suggestions.map((d) => <button key={d.id} onClick={() => { setSelected(d); setQuery(d.title); }}><span>{d.title}</span><small>DANDI:{d.id}</small></button>)}</div>}
      </div>
    </section>
    <section className="workspace">
      <aside className="clusters">
        <div className="aside-title"><span>Topic regions</span><button onClick={() => setActiveClusters(activeClusters.size === data.clusters.length ? new Set() : new Set(data.clusters.map((c) => c.id)))}>{activeClusters.size === data.clusters.length ? "Clear" : "All"}</button></div>
        <div className="cluster-list">{data.clusters.map((c) => <button key={c.id} className={activeClusters.has(c.id) ? "cluster active" : "cluster"} onClick={() => toggleCluster(c.id)}><span className="dot" style={{ background: c.color }} /><span><b>{c.label}</b><small>{c.count} datasets · {c.terms.slice(0, 3).join(", ")}</small></span></button>)}</div>
        <div className="method-note"><b>How to read it</b><p>Distance suggests semantic similarity—not scientific quality. Colors show machine-found topic regions.</p></div>
      </aside>
      <MapCanvas data={data} activeClusters={activeClusters} query={query} selected={selected} onSelect={setSelected} />
      <aside className={selected ? "details open" : "details"}>
        {selected ? <>
          <button className="close" onClick={() => setSelected(null)} aria-label="Close details">×</button>
          <p className="dandi-id">DANDI:{selected.id}</p><h2>{selected.title}</h2>
          <p className="description">{selected.description || "No description supplied."}</p>
          <div className="stats"><div><b>{selected.files.toLocaleString()}</b><span>files</span></div><div><b>{formatBytes(selected.bytes)}</b><span>size</span></div><div><b>{selected.subjects || "—"}</b><span>subjects</span></div></div>
          {selected.species.length > 0 && <div className="meta"><span>Species</span><p>{selected.species.join(", ")}</p></div>}
          {selected.approaches.length > 0 && <div className="meta"><span>Approaches</span><p>{selected.approaches.join(", ")}</p></div>}
          {selected.techniques.length > 0 && <div className="meta"><span>Techniques</span><p>{selected.techniques.slice(0, 4).join(", ")}</p></div>}
          <div className="tags">{selected.keywords.slice(0, 6).map((k) => <span key={k}>{k}</span>)}</div>
          <a className="open-dandi" href={selected.url} target="_blank" rel="noreferrer">Open on DANDI <span>↗</span></a>
        </> : <div className="empty-detail"><span>◎</span><b>Select a point</b><p>Click any dataset on the map to read its abstract and metadata.</p></div>}
      </aside>
    </section>
    <footer><span>{data.total.toLocaleString()} Dandisets mapped</span><span>{data.method}</span><a href="https://github.com/dandi/dandi-archive" target="_blank" rel="noreferrer">About DANDI ↗</a></footer>
    {showAbout && <div className="modal-backdrop" onMouseDown={() => setShowAbout(false)}><section className="modal" onMouseDown={(e) => e.stopPropagation()}><button className="close" onClick={() => setShowAbout(false)}>×</button><p className="eyebrow">About the atlas</p><h2>A map made from meaning</h2><p>DANDI Atlas turns titles, descriptions, keywords, anatomy, species, and experimental methods into a numerical representation. Three-dimensional reduction places similar records near one another; broad topic regions are preserved, with only unusually large groups subdivided. Drag the map to see relationships hidden behind the initial view.</p><p>The source metadata comes directly from the DANDI Archive and is rebuilt nightly. This is an exploratory aid, not a taxonomy or ranking.</p><button className="modal-done" onClick={() => setShowAbout(false)}>Start exploring</button></section></div>}
  </main>;
}
