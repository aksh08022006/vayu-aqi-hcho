"use client";
import { useEffect, useRef, useState } from "react";

const CHAPTERS = [
  ["01", "Hero", "hero"], ["02", "Snapshot", "mission-snapshot"],
  ["03", "Air Quality", "air-quality"], ["04", "Signals", "signals"],
  ["05", "Monitor Gap", "satellites"], ["06", "Pipeline", "pipeline"],
  ["07", "Observations", "observations"], ["08", "AQI Map", "aqi"],
  ["09", "HCHO", "hcho"], ["10", "Hotspots", "hotspots"],
  ["11", "Burning", "biomass"], ["12", "Transport", "transport"],
  ["13", "Action", "policy-action"], ["14", "Evidence", "evidence"],
  ["15", "Model", "model"], ["16", "Results", "results"],
  ["17", "Insights", "insights"], ["18", "Applications", "applications"],
  ["19", "Impact", "impact"],
];

export function ChapterRail() {
  const [progress, setProgress] = useState(0);
  const [active, setActive] = useState(0);
  const raf = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      cancelAnimationFrame(raf.current);
      raf.current = requestAnimationFrame(() => {
        const max = document.body.scrollHeight - window.innerHeight;
        setProgress(max > 0 ? window.scrollY / max : 0);
        // active chapter = nearest section in view
        let best = 0, bestDist = Infinity;
        CHAPTERS.forEach(([, , id], i) => {
          const el = document.getElementById(id);
          if (!el) return;
          const d = Math.abs(el.getBoundingClientRect().top - window.innerHeight * 0.35);
          if (d < bestDist) { bestDist = d; best = i; }
        });
        setActive(best);
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      aria-label="Chapters"
      className="fixed left-4 top-1/2 z-40 hidden -translate-y-1/2 lg:block"
    >
      <ol className="flex flex-col gap-3">
        {CHAPTERS.map(([num, label, id], i) => (
          <li key={id} className="group flex items-center gap-3">
            <a
              href={`#${id}`}
              className="data flex items-center gap-3 text-[11px]"
              style={{ color: i === active ? "var(--color-signal)" : "var(--color-text-3)" }}
            >
              <span
                className="block transition-all duration-300"
                style={{
                  width: i === active ? 24 : 12,
                  height: 2,
                  background: i === active ? "var(--color-signal)" : "rgba(255,255,255,0.25)",
                }}
              />
              <span className="opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                {num} · {label}
              </span>
            </a>
          </li>
        ))}
      </ol>
      <div className="data mt-5 text-[10px]" style={{ color: "var(--color-text-3)" }}>
        {String(Math.round(progress * 100)).padStart(3, "0")}%
      </div>
    </nav>
  );
}
