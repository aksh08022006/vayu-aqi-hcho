"use client";
import { useEffect, useRef } from "react";
import maplibregl from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ScatterplotLayer, PathLayer } from "@deck.gl/layers";
import { AQI_STOPS } from "@/lib/india";

type Mode = "aqi" | "gas" | "hotspots" | "transport";
type RGB = [number, number, number];

// minimal, offline dark basemap: void + India outline (no external tiles)
const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: { india: { type: "geojson", data: "/data/india.geojson" } },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#07090c" } },
    { id: "ifill", type: "fill", source: "india", paint: { "fill-color": "#0e1217", "fill-opacity": 0.55 } },
    { id: "iline", type: "line", source: "india", paint: { "line-color": "#3a4753", "line-width": 1 } },
  ],
};

const aqiRGB = (v: number): RGB =>
  v <= 50 ? [0, 152, 101] : v <= 100 ? [132, 207, 51] : v <= 200 ? [255, 210, 31]
    : v <= 300 ? [242, 169, 59] : v <= 400 ? [234, 51, 36] : [156, 46, 44];

const GAS_RAMP: Record<string, RGB[]> = {
  aod: [[12, 18, 22], [232, 195, 158], [138, 90, 43]],
  no2: [[12, 18, 22], [140, 40, 120], [255, 180, 120]],
  so2: [[12, 18, 22], [40, 90, 90], [150, 230, 200]],
  co: [[12, 18, 22], [40, 70, 120], [140, 200, 255]],
  o3: [[12, 18, 22], [40, 90, 40], [160, 230, 120]],
  hcho: [[24, 18, 14], [255, 210, 31], [234, 51, 36]],
};
function rampColor(stops: RGB[], t: number): RGB {
  const n = stops.length - 1;
  const f = Math.min(0.999, Math.max(0, t)) * n;
  const i = Math.floor(f), k = f - i, a = stops[i], b = stops[i + 1];
  return [0, 1, 2].map((j) => Math.round(a[j] + (b[j] - a[j]) * k)) as RGB;
}
const SOURCE_RGB: Record<string, RGB> = {
  agri_burning: [255, 122, 69], urban: [95, 227, 210], industrial: [242, 169, 59],
  forest_fire: [255, 90, 60], biogenic: [127, 191, 127], other: [150, 156, 164],
};

const GAS_LABEL: Record<string, string> = {
  aod: "AOD", no2: "NO₂", so2: "SO₂", co: "CO", o3: "O₃", hcho: "HCHO",
};
const grad = (stops: RGB[]) =>
  `linear-gradient(90deg, ${stops
    .map((c, i) => `rgb(${c[0]},${c[1]},${c[2]}) ${(i / (stops.length - 1)) * 100}%`)
    .join(", ")})`;

function MapLegend({ mode, gas }: { mode: Mode; gas: string }) {
  const box: React.CSSProperties = {
    position: "absolute", left: 12, bottom: 12, zIndex: 10, pointerEvents: "none",
    background: "rgba(14,18,23,0.9)", border: "1px solid rgba(255,255,255,0.12)",
    borderRadius: 4, padding: "8px 10px", fontFamily: "var(--font-mono)", color: "#ECECE6",
  };
  const title: React.CSSProperties = { fontSize: 10, letterSpacing: "0.12em", color: "#6b7480", marginBottom: 6 };

  if (mode === "aqi")
    return (
      <div style={box}>
        <div style={title}>AQI · CPCB</div>
        {AQI_STOPS.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, lineHeight: "16px" }}>
            <span style={{ width: 11, height: 11, background: s.color, borderRadius: 2, display: "inline-block" }} />
            <span style={{ color: "#a7aeb6" }}>{s.label}</span>
            <span style={{ color: "#6b7480", marginLeft: "auto", paddingLeft: 10 }}>≤{s.max}</span>
          </div>
        ))}
      </div>
    );

  const rampStops = mode === "gas" ? GAS_RAMP[gas] ?? GAS_RAMP.hcho : GAS_RAMP.hcho;
  const label = mode === "gas" ? `${GAS_LABEL[gas] ?? gas} column` : "HCHO column";
  return (
    <div style={box}>
      <div style={title}>{label}</div>
      <div style={{ width: 132, height: 9, borderRadius: 2, background: grad(rampStops) }} />
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#6b7480", marginTop: 4 }}>
        <span>low</span><span>high</span>
      </div>
      {mode === "transport" && (
        <div style={{ marginTop: 8, fontSize: 11, color: "#a7aeb6", display: "flex", flexDirection: "column", gap: 3 }}>
          <span><span style={{ color: "#ff7a45" }}>—</span> back-trajectory</span>
          <span><span style={{ color: "#ff5a32" }}>●</span> fire pixel</span>
        </div>
      )}
    </div>
  );
}

export function DeckMap({
  mode, frame = 0, gas = "hcho", height = 560, onReadout,
}: {
  mode: Mode;
  frame?: number;
  gas?: string;
  height?: number;
  onReadout?: (s: string | null) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const overlay = useRef<MapboxOverlay | null>(null);
  const data = useRef<Record<string, unknown>>({});
  const props = useRef({ mode, frame, gas });
  props.current = { mode, frame, gas };

  const build = () => {
    const d = data.current as Record<string, any>;
    const { mode: m, frame: fr, gas: g } = props.current;
    const layers: unknown[] = [];

    const grid = (rows: number[][], color: (v: number) => RGB, r = 27000, alpha = 200, id = "grid") =>
      new ScatterplotLayer({
        id, data: rows, getPosition: (x: number[]) => [x[0], x[1]],
        getRadius: r, radiusUnits: "meters", radiusMinPixels: 1.5,
        getFillColor: (x: number[]) => [...color(x[2]), alpha] as [number, number, number, number],
        pickable: true,
      });

    if (m === "aqi" && d.aqi) {
      const f = d.aqi.frames[Math.min(fr, d.aqi.frames.length - 1)];
      layers.push(grid(f.cells, aqiRGB, 27000, 210, "aqi"));
    }
    if (m === "gas" && d.gas) {
      const rows = d.gas.cells.map((c: any) => [c.lon, c.lat, c[g]]);
      layers.push(grid(rows, (v) => rampColor(GAS_RAMP[g] ?? GAS_RAMP.hcho, v), 27000, 200, "gas"));
    }
    if (m === "hotspots" && d.hcho) {
      layers.push(grid(d.hcho, (v) => rampColor(GAS_RAMP.hcho, v), 26000, 150, "hcho-base"));
      if (d.hotspots)
        layers.push(new ScatterplotLayer({
          id: "hotspots", data: d.hotspots,
          getPosition: (x: any) => [x.lon, x.lat],
          getRadius: (x: any) => 14000 + Math.sqrt(x.n) * 9000, radiusUnits: "meters",
          radiusMinPixels: 4,
          getFillColor: (x: any) => [...(SOURCE_RGB[x.source] ?? SOURCE_RGB.other), 235] as [number, number, number, number],
          stroked: true, getLineColor: [255, 255, 255, 120], lineWidthMinPixels: 1, pickable: true,
        }));
    }
    if (m === "transport") {
      if (d.hcho) layers.push(grid(d.hcho, (v) => rampColor(GAS_RAMP.hcho, v), 26000, 110, "hcho-base"));
      if (d.fires)
        layers.push(new ScatterplotLayer({
          id: "fires", data: d.fires, getPosition: (x: number[]) => [x[0], x[1]],
          getRadius: 9000, radiusUnits: "meters", radiusMinPixels: 1,
          getFillColor: [255, 90, 50, 180],
        }));
      if (d.traj)
        layers.push(new PathLayer({
          id: "traj", data: [{ path: d.traj }], getPath: (x: any) => x.path,
          getColor: [255, 122, 69, 230], getWidth: 2.5, widthUnits: "pixels", capRounded: true,
        }));
    }
    return layers;
  };

  const tooltip = ({ object, layer }: any) => {
    if (!object) { onReadout?.(null); return null; }
    let txt = "";
    if (layer.id === "aqi") txt = `AQI ${object[2]} · ${object[0]}, ${object[1]}`;
    else if (layer.id === "gas") txt = `${props.current.gas.toUpperCase()} ${(object[2] * 100).toFixed(0)}% · ${object[0]}, ${object[1]}`;
    else if (layer.id === "hotspots") txt = `${object.source}${object.detail ? " / " + object.detail : ""} · FRP ${object.frp}`;
    onReadout?.(txt);
    return { html: `<div style="font:12px ui-monospace,monospace">${txt}</div>`,
      style: { background: "#0e1217", color: "#ECECE6", border: "1px solid rgba(255,255,255,.12)" } };
  };

  // init map once
  useEffect(() => {
    if (!wrap.current || map.current) return;
    const m = new maplibregl.Map({
      container: wrap.current, style: STYLE, center: [81, 22.5], zoom: 3.4,
      minZoom: 3, maxZoom: 7, attributionControl: false, dragRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    map.current = m;
    m.on("load", async () => {
      const need: Record<Mode, string[]> = {
        aqi: ["aqi_frames"], gas: ["gas_grids"],
        hotspots: ["hcho_grid", "hotspots"], transport: ["hcho_grid", "fires", "trajectory"],
      };
      const map2: Record<string, string> = {
        aqi_frames: "aqi", gas_grids: "gas", hcho_grid: "hcho",
        hotspots: "hotspots", fires: "fires", trajectory: "traj",
      };
      const files = need[props.current.mode];
      const loaded = await Promise.all(files.map((f) => fetch(`/data/${f}.json`).then((r) => r.json())));
      if (map.current !== m) return; // unmounted (React strict-mode double-invoke)
      files.forEach((f, i) => (data.current[map2[f]] = loaded[i]));
      const ov = new MapboxOverlay({ interleaved: false, layers: build() as any, getTooltip: tooltip });
      m.addControl(ov as unknown as maplibregl.IControl);
      overlay.current = ov;
    });
    return () => { m.remove(); map.current = null; overlay.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // update layers on prop change
  useEffect(() => {
    overlay.current?.setProps({ layers: build() as any });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frame, gas, mode]);

  return (
    <div className="relative overflow-hidden rounded-sm" style={{ width: "100%", height }}>
      <div ref={wrap} style={{ width: "100%", height: "100%" }} />
      <MapLegend mode={mode} gas={gas} />
    </div>
  );
}
