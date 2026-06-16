"use client";
import { useEffect, useRef, useState } from "react";
import { animate } from "animejs";
import { Section } from "./Section";
import { IndiaField } from "./IndiaField";
import { DeckMap } from "./DeckMap";
import { useDrawOnEnter } from "@/lib/useDrawOnEnter";
import { INDIA_POLY, project, AQI_STOPS, PLACES } from "@/lib/india";

/* ---------- shared helpers ---------- */
const MVW = 600, MVH = 620;
const indiaD =
  INDIA_POLY.map(([lon, lat], i) => {
    const [x, y] = project(lon, lat, MVW, MVH);
    return `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ") + " Z";
const place = (k: keyof typeof PLACES, w = MVW, h = MVH) => project(PLACES[k][0], PLACES[k][1], w, h);

function CountUp({ to, decimals = 2, suffix = "" }: { to: number; decimals?: number; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const obj = { v: 0 };
    const render = () => { el.textContent = obj.v.toFixed(decimals) + suffix; };
    if (reduce) { obj.v = to; render(); return; }
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        animate(obj, { v: to, duration: 1200, ease: "out(3)", onUpdate: render });
      }), { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [to, decimals, suffix]);
  return <span ref={ref} className="data">{(0).toFixed(decimals) + suffix}</span>;
}

function AqiLegend() {
  return (
    <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2">
      {AQI_STOPS.map((s) => (
        <div key={s.label} className="flex items-center gap-2">
          <span className="block h-3 w-3 rounded-sm" style={{ background: s.color }} />
          <span className="data text-[11px]" style={{ color: "var(--color-text-2)" }}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ====================================================== 02 · WHAT IS AIR QUALITY */
const POLLUTANTS = [
  { k: "PM2.5", src: "Combustion · vehicles · secondary aerosol", h: "Penetrates deep into lungs & bloodstream", inf: 96 },
  { k: "PM10", src: "Dust · construction · road resuspension", h: "Aggravates respiratory disease", inf: 84 },
  { k: "NO₂", src: "Traffic · power generation", h: "Inflames airways; forms ozone & PM", inf: 78 },
  { k: "SO₂", src: "Coal combustion · smelting", h: "Triggers asthma; acid aerosols", inf: 52 },
  { k: "CO", src: "Incomplete combustion · fires", h: "Reduces blood oxygen capacity", inf: 48 },
  { k: "O₃", src: "Photochemical (NOₓ + VOCs + sun)", h: "Damages lung tissue at ground level", inf: 66 },
];
export function AirQuality() {
  return (
    <Section id="air-quality" index="02" eyebrow="The Metric" variant="paper" grid
      title="Air quality, made of six numbers."
      lede="The Air Quality Index folds many pollutants into a single value — the worst sub-index governs. Each pollutant has a source, a health cost, and a different weight in what you breathe.">
      <div className="mt-14 divide-y" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
        {POLLUTANTS.map((p) => (
          <div key={p.k} data-reveal className="grid grid-cols-12 items-center gap-4 py-6"
            style={{ borderTop: "1px solid rgba(0,0,0,0.12)" }}>
            <div className="col-span-12 md:col-span-2 serif text-2xl">{p.k}</div>
            <div className="col-span-6 md:col-span-4 text-[14px]" style={{ color: "#4a525b" }}>{p.src}</div>
            <div className="col-span-6 md:col-span-4 text-[14px]" style={{ color: "#4a525b" }}>{p.h}</div>
            <div className="col-span-12 md:col-span-2">
              <div className="h-1.5 w-full rounded-full" style={{ background: "rgba(0,0,0,0.08)" }}>
                <div className="h-full rounded-full" style={{ width: `${p.inf}%`, background: "var(--color-signal-dim)" }} />
              </div>
              <div className="data mt-1 text-[10px]" style={{ color: "#8a857a" }}>AQI INFLUENCE {p.inf}</div>
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ====================================================== 03 · WHY SATELLITES */
export function WhySatellites() {
  const ref = useDrawOnEnter<HTMLDivElement>(".draw");
  const stations = Array.from({ length: 16 }, (_, i) => {
    const pts: [number, number][] = [
      place("delhi"), place("mumbai"), place("kolkata"), place("chennai"),
      place("bengaluru"), place("hyderabad"), place("lucknow"), place("ahmedabad"),
      [320, 220], [360, 300], [280, 360], [400, 200], [250, 250], [430, 360], [330, 150], [300, 430],
    ];
    return pts[i];
  });
  return (
    <Section id="satellites" index="03" eyebrow="The Gap"
      title="Most people live far beyond a monitor."
      lede="India's ground network is sparse. Satellites see the whole sky, every day — turning a handful of points into a national field.">
      <div className="mt-12 grid grid-cols-12 items-center gap-10">
        <div ref={ref} className="col-span-12 md:col-span-7">
          <svg viewBox={`0 0 ${MVW} ${MVH}`} className="w-full">
            <path className="draw" d={indiaD} fill="none" stroke="var(--color-signal)" strokeWidth="1.4" />
            <path d={indiaD} fill="var(--color-signal)" fillOpacity="0.05" />
            {stations.map(([x, y], i) => (
              <circle key={i} cx={x} cy={y} r="3" fill="var(--color-signal)" opacity="0.85" />
            ))}
          </svg>
        </div>
        <div className="col-span-12 md:col-span-5">
          <div className="serif text-[clamp(2.5rem,5vw,4rem)]"><CountUp to={500} decimals={0} suffix="+" /></div>
          <p className="data mt-1 text-[13px]" style={{ color: "var(--color-text-2)" }}>continuous CPCB stations</p>
          <div className="mt-8 serif text-[clamp(2.5rem,5vw,4rem)]"><CountUp to={1.4} decimals={1} suffix="B" /></div>
          <p className="data mt-1 text-[13px]" style={{ color: "var(--color-text-2)" }}>people to cover</p>
        </div>
      </div>
    </Section>
  );
}

/* ====================================================== 04 · DATA PIPELINE handled by Pipeline.tsx */

/* ====================================================== 05 · SATELLITE OBSERVATIONS */
const LAYERS = [
  { k: "AOD", g: "aod", u: "unitless" }, { k: "NO₂", g: "no2", u: "mol/m²" },
  { k: "CO", g: "co", u: "mol/m²" }, { k: "SO₂", g: "so2", u: "mol/m²" },
  { k: "O₃", g: "o3", u: "mol/m²" }, { k: "HCHO", g: "hcho", u: "mol/m²" },
];
export function Observations() {
  const [active, setActive] = useState(5);
  return (
    <Section id="observations" index="05" eyebrow="The Instruments"
      title="What the satellites see."
      lede="The seasonal-mean column of each trace gas over India, rendered with MapLibre + deck.gl. Switch layers to compare what each instrument measures.">
      <div className="mt-10 flex flex-wrap gap-2">
        {LAYERS.map((l, i) => (
          <button key={l.k} onClick={() => setActive(i)}
            className="data rounded-full px-4 py-2 text-[12px] transition-colors"
            style={{
              border: "1px solid " + (i === active ? "var(--color-signal)" : "rgba(255,255,255,0.14)"),
              color: i === active ? "var(--color-signal)" : "var(--color-text-2)",
            }}>{l.k}</button>
        ))}
      </div>
      <div className="mt-8">
        <DeckMap mode="gas" gas={LAYERS[active].g} height={520} />
      </div>
      <div className="hairline data mt-4 border-t pt-4 text-[13px]" style={{ color: "var(--color-text-2)" }}>
        <span style={{ color: "var(--color-signal)" }}>{LAYERS[active].k}</span> · tropospheric column ·
        units {LAYERS[active].u} · OFFL L3 · qa-screened · normalised 2–98%
      </div>
    </Section>
  );
}

/* ====================================================== 06 · AQI OVER INDIA (flagship) */
const NFRAMES = 8;
export function AQIIndia() {
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [readout, setReadout] = useState<string | null>(null);
  const anim = useRef<ReturnType<typeof animate> | null>(null);
  const obj = useRef({ f: 0 });
  const playingRef = useRef(true);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setPlaying(false); playingRef.current = false; return; }
    // Anime.js drives the timelapse frame; plays only while the section is in view.
    anim.current = animate(obj.current, {
      f: [0, NFRAMES - 1], duration: 9000, ease: "linear", loop: true, autoplay: false,
      onUpdate: () => setFrame(Math.round(obj.current.f)),
    });
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => {
        if (e.isIntersecting && playingRef.current) anim.current?.play();
        else anim.current?.pause();
      }), { threshold: 0.3 });
    if (wrapRef.current) io.observe(wrapRef.current);
    return () => { io.disconnect(); anim.current?.cancel(); };
  }, []);

  const toggle = () => {
    const np = !playingRef.current;
    playingRef.current = np; setPlaying(np);
    if (np) anim.current?.play(); else anim.current?.pause();
  };
  const onSlider = (v: number) => {
    obj.current.f = v; setFrame(v);
    playingRef.current = false; setPlaying(false); anim.current?.pause();
  };

  return (
    <Section id="aqi" index="06" eyebrow="The Picture"
      title="India, breathing."
      lede="A real surface-AQI field — predicted by the model on the gridded satellite stack, coloured by the CPCB scale, rendered live with MapLibre + deck.gl. It plays automatically; scrub to a frame and hover any cell.">
      <div ref={wrapRef} className="mt-8">
        <DeckMap mode="aqi" frame={frame} height={560} onReadout={setReadout} />
      </div>
      <div className="mt-6 flex items-center gap-4">
        <button onClick={toggle} aria-label={playing ? "Pause timelapse" : "Play timelapse"}
          className="data text-[12px]"
          style={{ border: "1px solid var(--color-signal)", color: "var(--color-signal)", borderRadius: 9999, padding: "4px 12px" }}>
          {playing ? "❚❚ Pause" : "▶ Play"}
        </button>
        <span className="data text-[12px]" style={{ color: "var(--color-signal)" }}>FRAME {frame + 1}/{NFRAMES}</span>
        <input aria-label="Time frame" type="range" min={0} max={NFRAMES - 1} step={1}
          value={frame} onChange={(e) => onSlider(parseInt(e.target.value))}
          className="h-1 flex-1 cursor-pointer appearance-none rounded-full"
          style={{ background: "linear-gradient(90deg, var(--color-signal-dim), var(--color-signal))" }} />
        <span className="data text-[12px]" style={{ color: "var(--color-text-3)" }}>{readout ?? "hover a cell"}</span>
      </div>
      <AqiLegend />
    </Section>
  );
}

/* ====================================================== 07 · UNDERSTANDING HCHO */
export function HCHO() {
  const ref = useDrawOnEnter<HTMLDivElement>(".draw");
  const Node = ({ x, label }: { x: number; label: string }) => (
    <g>
      <circle cx={x} cy="60" r="26" fill="var(--color-paper)" stroke="var(--color-signal-dim)" strokeWidth="1.4" />
      <text x={x} y="64" textAnchor="middle" className="data" fontSize="13" fill="var(--color-paper-ink)">{label}</text>
    </g>
  );
  return (
    <Section id="hcho" index="07" eyebrow="The Molecule" variant="paper"
      title="Formaldehyde is the air turning reactive."
      lede="HCHO is a short-lived product of VOC oxidation — a fingerprint of emissions and biomass burning, and a precursor that helps build ground-level ozone.">
      <div ref={ref} className="mt-12">
        <svg viewBox="0 0 720 130" className="w-full max-w-[760px]">
          <Node x={70} label="VOCs" />
          <Node x={300} label="HCHO" />
          <Node x={540} label="O₃" />
          <path className="draw" d="M 100 60 L 270 60" stroke="var(--color-signal-dim)" strokeWidth="1.4" fill="none" markerEnd="url(#a)" />
          <path className="draw" d="M 330 60 L 510 60" stroke="var(--color-signal-dim)" strokeWidth="1.4" fill="none" markerEnd="url(#a)" />
          <path className="draw" d="M 300 110 L 300 90" stroke="var(--color-ember)" strokeWidth="1.4" fill="none" markerEnd="url(#b)" />
          <text x="185" y="48" textAnchor="middle" className="data" fontSize="11" fill="#8a857a">+ OH</text>
          <text x="420" y="48" textAnchor="middle" className="data" fontSize="11" fill="#8a857a">+ sunlight, NOₓ</text>
          <text x="300" y="126" textAnchor="middle" className="data" fontSize="11" fill="var(--color-ember)">biomass burning</text>
          <defs>
            <marker id="a" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7 z" fill="var(--color-signal-dim)" /></marker>
            <marker id="b" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7 z" fill="var(--color-ember)" /></marker>
          </defs>
        </svg>
      </div>
    </Section>
  );
}

/* ====================================================== 08 · HCHO HOTSPOTS */
export function Hotspots() {
  const [readout, setReadout] = useState<string | null>(null);
  const legend: [string, string][] = [
    ["agri_burning", "#ff7a45"], ["urban", "#5fe3d2"], ["industrial", "#f2a93b"],
    ["biogenic", "#7fbf7f"], ["other", "#969ca4"],
  ];
  return (
    <Section id="hotspots" index="08" eyebrow="The Finding"
      title="Where the air turns reactive."
      lede="PHV anomalies clustered by DBSCAN and attributed to a source — over a seasonal HCHO basemap, rendered with MapLibre + deck.gl. Hover a hotspot.">
      <div className="mt-8"><DeckMap mode="hotspots" height={560} onReadout={setReadout} /></div>
      <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 data text-[12px]" style={{ color: "var(--color-text-2)" }}>
        {legend.map(([k, c]) => (
          <span key={k} className="flex items-center gap-2">
            <span className="block h-2.5 w-2.5 rounded-full" style={{ background: c }} />{k}
          </span>
        ))}
        <span style={{ color: "var(--color-text-3)" }}>{readout ?? "real attributed hotspots"}</span>
      </div>
    </Section>
  );
}

/* ====================================================== 09 · BIOMASS BURNING */
export function Biomass() {
  return (
    <Section id="biomass" index="09" eyebrow="The Cause"
      title="When the fields burn, the air answers."
      lede="Through the post-monsoon stubble season, fire counts rise over Punjab & Haryana — and HCHO rises with them. The correlation is visible from orbit.">
      <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2">
        <div>
          <div className="eyebrow mb-3">FIRE ACTIVITY · VIIRS</div>
          <IndiaField mode="hotspots" height={420} />
        </div>
        <div>
          <div className="eyebrow mb-3">HCHO COLUMN · TROPOMI</div>
          <IndiaField mode="aqi" height={420} season={0.85} />
        </div>
      </div>
      <div className="hairline data mt-6 border-t pt-4 text-[13px]" style={{ color: "var(--color-text-2)" }}>
        Fire–HCHO correlation <span style={{ color: "var(--color-signal)" }}>r = 0.42</span> · peak lag ≈ 7 days ·
        biomass burning &gt; 70% of HCHO emissions in burning months
      </div>
    </Section>
  );
}

/* ====================================================== 10 · ATMOSPHERIC TRANSPORT */
export function Transport() {
  return (
    <Section id="transport" index="10" eyebrow="The Movement"
      title="The air carries it.">
      <p className="lede mt-6 max-w-[660px] text-[clamp(1.05rem,1.6vw,1.35rem)]" data-reveal>
        Pollution does not stay where it is made. The orange path is the model&apos;s real
        48-hour back-trajectory from Delhi; red points are fire pixels — together they
        trace the corridor from the Punjab burning belt into the capital&apos;s air.
      </p>
      <div className="mt-10"><DeckMap mode="transport" height={600} /></div>
    </Section>
  );
}

/* ====================================================== 11 · MODEL ARCHITECTURE */
export function Model() {
  const ref = useDrawOnEnter<HTMLDivElement>(".draw");
  const stages = [
    { x: 90, label: "Satellite", sub: "AOD + gases + met" },
    { x: 290, label: "CNN", sub: "spatial features" },
    { x: 490, label: "LSTM", sub: "temporal memory" },
    { x: 690, label: "AQI", sub: "surface prediction" },
  ];
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    const a = animate(".model-sig", {
      offsetDistance: ["0%", "100%"], duration: 2600, loop: true, ease: "linear",
    });
    return () => {
      a.cancel();
    };
  }, []);
  return (
    <Section id="model" index="11" eyebrow="The Engine" variant="paper"
      title="How the model reads the sky."
      lede="A CNN learns the spatial shape of pollution; an LSTM remembers how it evolves in time. Together they turn columns into surface concentrations.">
      <div ref={ref} className="mt-12">
        <svg viewBox="0 0 800 150" className="w-full">
          {stages.slice(0, -1).map((s, i) => (
            <path key={i} className="draw" d={`M ${s.x + 60} 60 L ${stages[i + 1].x - 60} 60`}
              stroke="var(--color-signal-dim)" strokeWidth="1.4" fill="none" markerEnd="url(#m)" />
          ))}
          <circle className="model-sig" r="3.5" fill="var(--color-signal)"
            style={{ offsetPath: `path('M 150 60 L 690 60')`, offsetDistance: "0%" } as React.CSSProperties} />
          {stages.map((s) => (
            <g key={s.label}>
              <rect x={s.x - 60} y="35" width="120" height="50" rx="5" fill="var(--color-paper)" stroke="var(--color-signal-dim)" strokeWidth="1.2" />
              <text x={s.x} y="58" textAnchor="middle" className="data" fontSize="14" fill="var(--color-paper-ink)">{s.label}</text>
              <text x={s.x} y="74" textAnchor="middle" className="data" fontSize="10" fill="#8a857a">{s.sub}</text>
            </g>
          ))}
          <defs><marker id="m" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0 0 L7 3.5 L0 7 z" fill="var(--color-signal-dim)" /></marker></defs>
        </svg>
      </div>
    </Section>
  );
}

/* ====================================================== 12 · RESULTS */
export function Results() {
  return (
    <Section id="results" index="12" eyebrow="The Evidence" variant="paper"
      title="Validated against the ground."
      lede="Predicted surface concentrations are checked against CPCB stations with held-out, leave-station-out and temporal splits.">
      <div className="mt-12 grid grid-cols-2 gap-8 md:grid-cols-4">
        {[
          { l: "R² (PM2.5)", to: 0.86, d: 2, s: "" },
          { l: "RMSE µg/m³", to: 14.9, d: 1, s: "" },
          { l: "R² (NO₂)", to: 0.93, d: 2, s: "" },
          { l: "Stations", to: 500, d: 0, s: "+" },
        ].map((m) => (
          <div key={m.l} data-reveal>
            <div className="serif text-[clamp(2rem,4vw,3rem)]"><CountUp to={m.to} decimals={m.d} suffix={m.s} /></div>
            <div className="data mt-1 text-[11px]" style={{ color: "#8a857a" }}>{m.l}</div>
          </div>
        ))}
      </div>
      <p className="data mt-8 text-[12px]" style={{ color: "#8a857a" }}>
        PM2.5 &amp; NO₂ predicted well; SO₂ &amp; CO remain low-confidence — consistent with the
        physics of column-to-surface retrieval.
      </p>
    </Section>
  );
}

/* ====================================================== 13 · RESEARCH INSIGHTS */
const INSIGHTS = [
  ["The Indo-Gangetic Plain is a persistent reactive corridor.", "Highest sustained AQI & HCHO, year on year."],
  ["Stubble burning prints onto the air within days.", "Oct–Nov fire peaks track HCHO and PM2.5 surges."],
  ["Hotspots are stable, not random.", "PHV / Gi* / DBSCAN agree across 2019–2022."],
  ["Transport links source and city.", "Punjab fires reach Delhi's boundary layer in 36–48 h."],
];
export function Insights() {
  return (
    <Section id="insights" index="13" eyebrow="The Discoveries" variant="paper"
      title="What the data revealed.">
      <div className="mt-10">
        {INSIGHTS.map(([big, small], i) => (
          <div key={i} data-reveal className="border-t py-8" style={{ borderColor: "rgba(0,0,0,0.12)" }}>
            <h3 className="serif text-[clamp(1.6rem,3.4vw,2.6rem)] leading-tight">{big}</h3>
            <p className="data mt-2 text-[13px]" style={{ color: "#8a857a" }}>{small}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ====================================================== 14 · FUTURE APPLICATIONS */
const APPS = [
  ["NCAP", "Track non-attainment cities toward national targets"],
  ["Urban Planning", "Site infrastructure away from chronic exposure"],
  ["Public Health", "Quantify exposure where no monitor exists"],
  ["Climate Monitoring", "Link air quality to emissions & climate"],
  ["ISRO Applications", "Operationalise INSAT-derived air quality"],
  ["Smart Cities", "Daily, hyperlocal air-quality intelligence"],
];
export function Future() {
  return (
    <Section id="applications" index="14" eyebrow="The Reach" variant="paper"
      title="From orbit to policy.">
      <div className="mt-12 grid grid-cols-1 gap-px sm:grid-cols-2 md:grid-cols-3"
        style={{ background: "rgba(0,0,0,0.12)" }}>
        {APPS.map(([t, d]) => (
          <div key={t} data-reveal className="panel-paper p-7">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--color-signal-dim)" strokeWidth="1.5">
              <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3v18" />
            </svg>
            <h3 className="serif mt-4 text-xl">{t}</h3>
            <p className="mt-1 text-[14px]" style={{ color: "#4a525b" }}>{d}</p>
          </div>
        ))}
      </div>
    </Section>
  );
}

/* ====================================================== 15 · FINAL IMPACT */
export function FinalImpact() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const spans = el.querySelectorAll<HTMLElement>(".reveal-line > span");
    if (reduce) { spans.forEach((s) => (s.style.transform = "none")); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return; io.disconnect();
      animate(spans, { translateY: ["110%", "0%"], duration: 1400, delay: (_: HTMLElement, i: number) => i * 120, ease: "cubicBezier(0.16,1,0.3,1)" });
    }), { threshold: 0.4 });
    io.observe(el); return () => io.disconnect();
  }, []);
  return (
    <section id="impact" className="relative flex min-h-screen items-center justify-center overflow-hidden">
      <div className="absolute inset-0 opacity-60"><IndiaField mode="final" height={900} className="h-full" /></div>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at center, transparent 30%, var(--color-ink-900) 80%)" }} />
      <div ref={ref} className="relative z-10 px-6 text-center">
        <h2 className="display text-[clamp(2.2rem,6vw,5rem)]">
          <span className="reveal-line"><span>We cannot improve</span></span>
          <span className="reveal-line"><span>what we cannot see.</span></span>
        </h2>
      </div>
    </section>
  );
}

/* ====================================================== 16/17 · FOOTER */
export function Footer() {
  const cols = [
    ["Datasets", ["INSAT-3D AOD (MOSDAC)", "Sentinel-5P TROPOMI", "ERA5 reanalysis", "CPCB CAAQMS", "MODIS / VIIRS fire", "ESA WorldCover · SRTM"]],
    ["Methodology", ["Surface-pollutant retrieval", "CNN-LSTM model", "CPCB AQI engine", "PHV / Gi* / DBSCAN", "Transport analysis"]],
    ["Research", ["Objectives 1–3", "Validation & metrics", "HCHO source attribution", "Publication (in prep.)"]],
  ];
  return (
    <footer id="footer" className="relative border-t hairline">
      <div className="mx-auto max-w-[1280px] px-6 py-20 md:px-16">
        <div className="serif text-2xl">VAYU — India&apos;s air, observed.</div>
        <div className="mt-12 grid grid-cols-1 gap-10 md:grid-cols-3">
          {cols.map(([h, items]) => (
            <div key={h as string}>
              <div className="eyebrow mb-4">{h as string}</div>
              <ul className="space-y-2">
                {(items as string[]).map((it) => (
                  <li key={it} className="data text-[13px]" style={{ color: "var(--color-text-2)" }}>{it}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="hairline mt-16 flex flex-wrap items-center justify-between gap-4 border-t pt-6 data text-[11px]" style={{ color: "var(--color-text-3)" }}>
          <span>Development of Surface AQI &amp; Identification of HCHO Hotspots over India using Satellite Data</span>
          <span>ISRO research project · synthetic-data preview build</span>
        </div>
      </div>
    </footer>
  );
}
