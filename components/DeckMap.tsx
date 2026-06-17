"use client";
import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ScatterplotLayer, PathLayer, PolygonLayer } from "@deck.gl/layers";
import { AQI_STOPS } from "@/lib/india";

type Mode = "aqi" | "gas" | "hotspots" | "transport";
type RGB = [number, number, number];
type LayerStatus = "loading" | "ready" | "partial" | "error";
type Hotspot = {
  id?: string;
  lon: number;
  lat: number;
  source: string;
  detail?: string;
  frp?: number;
  n?: number;
  _i?: number;
};

// Real dark basemap (CARTO dark — coastlines, state borders, cities) + a faint
// India outline highlight. CARTO public basemaps need attribution, no API key.
const CARTO = ["a", "b", "c", "d"].map(
  (s) => `https://${s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png`
);
const STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    carto: { type: "raster", tiles: CARTO, tileSize: 256, attribution: "© OpenStreetMap, © CARTO" },
    india: { type: "geojson", data: "/data/india.geojson" },
  },
  layers: [
    { id: "bg", type: "background", paint: { "background-color": "#07090c" } },
    { id: "carto", type: "raster", source: "carto", paint: { "raster-opacity": 0.85 } },
    { id: "iline", type: "line", source: "india", paint: { "line-color": "#5fe3d2", "line-width": 1, "line-opacity": 0.35 } },
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

const SOURCE_ACTION: Record<string, string> = {
  agri_burning: "Crop residue burning surveillance and downwind VOC precursor alert",
  industrial: "Industrial VOC inspection and stack-emission monitoring",
  urban: "Traffic, NO2 and urban VOC precursor monitoring",
  biogenic: "Ozone precursor watch during high-temperature periods",
  forest_fire: "Forest-fire smoke and VOC plume monitoring",
  other: "Ground validation required before attribution",
};

function confidenceFor(h: Hotspot): "High" | "Medium" | "Low" {
  const frp = h.frp ?? 0;
  if (h.source === "agri_burning" && frp > 100) return "High";
  if (frp > 0 || h.source !== "other") return "Medium";
  return "Low";
}

function confidenceClass(level: string) {
  return level === "High" ? "confidence-high" : level === "Medium" ? "confidence-medium" : "confidence-low";
}

function sourceLabel(source: string) {
  return source.replace(/_/g, " ");
}

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

function HotspotCard({ hotspot }: { hotspot: Hotspot | null }) {
  const h = hotspot ?? {
    lon: 77.1, lat: 28.65, source: "agri_burning", detail: "demo cluster", frp: 124, n: 8, _i: 0,
  };
  const confidence = confidenceFor(h);
  const id = h.id ?? `HCHO-${h.source.toUpperCase().slice(0, 4)}-${String((h._i ?? 0) + 1).padStart(3, "0")}`;
  return (
    <aside className="pointer-events-none absolute right-3 top-3 z-10 w-[min(320px,calc(100%-24px))] rounded-sm border p-4"
      style={{
        background: "rgba(14,18,23,0.92)",
        borderColor: "rgba(255,255,255,0.14)",
        color: "#ecece6",
        boxShadow: "0 18px 50px rgba(0,0,0,0.28)",
      }}>
      <div className="data text-[10px] uppercase" style={{ color: "#6b7480", letterSpacing: "0.14em" }}>Hotspot Intelligence</div>
      <div className="mt-3 flex items-start justify-between gap-3">
        <div>
          <div className="serif text-2xl capitalize leading-tight">{sourceLabel(h.source)}</div>
          <div className="data mt-1 text-[10px]" style={{ color: "#a7aeb6" }}>{id}</div>
        </div>
        <span className={`status-badge ${confidenceClass(confidence)}`}>{confidence}</span>
      </div>
      <div className="mt-4 grid gap-2 data text-[11px]" style={{ color: "#a7aeb6" }}>
        <div>Detail: {h.detail ?? "source attribution hypothesis"}</div>
        <div>Cluster size: {h.n ?? 1} cells</div>
        <div>FRP: {h.frp ?? 0} MW</div>
        <div>Coords: {h.lon.toFixed(2)}, {h.lat.toFixed(2)}</div>
      </div>
      <div className="mt-4 border-t pt-3 text-[12px] leading-5" style={{ borderColor: "rgba(255,255,255,0.12)", color: "#d6d8d2" }}>
        {SOURCE_ACTION[h.source] ?? SOURCE_ACTION.other}
      </div>
      {!hotspot && (
        <div className="data mt-3 text-[10px]" style={{ color: "#6b7480" }}>Hover a hotspot to inspect live demo evidence.</div>
      )}
    </aside>
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
  const [layerStatus, setLayerStatus] = useState<LayerStatus>("loading");
  const [layerMessage, setLayerMessage] = useState("Loading atmospheric layer...");
  const [selectedHotspot, setSelectedHotspot] = useState<Hotspot | null>(null);
  props.current = { mode, frame, gas };

  const build = () => {
    const d = data.current as Record<string, any>;
    const { mode: m, frame: fr, gas: g } = props.current;
    const layers: unknown[] = [];

    const HALF = 0.25; // 0.5° grid -> real geographic raster cells
    const cellPoly = (lon: number, lat: number) =>
      [[lon - HALF, lat - HALF], [lon + HALF, lat - HALF], [lon + HALF, lat + HALF], [lon - HALF, lat + HALF]];
    const grid = (rows: number[][], color: (v: number) => RGB, alpha = 185, id = "grid") =>
      new PolygonLayer({
        id, data: rows, getPolygon: (x: number[]) => cellPoly(x[0], x[1]),
        getFillColor: (x: number[]) => [...color(x[2]), alpha] as [number, number, number, number],
        stroked: false, filled: true, pickable: true,
        updateTriggers: { getFillColor: [id, fr, g] },
      });

    if (m === "aqi" && Array.isArray(d.aqi?.frames) && d.aqi.frames.length > 0) {
      const f = d.aqi.frames[Math.min(fr, d.aqi.frames.length - 1)];
      if (Array.isArray(f?.cells)) layers.push(grid(f.cells, aqiRGB, 200, "aqi"));
    }
    if (m === "gas" && Array.isArray(d.gas?.cells)) {
      const rows = d.gas.cells.map((c: any) => [c.lon, c.lat, c[g]]).filter((r: number[]) => Number.isFinite(r[2]));
      layers.push(grid(rows, (v) => rampColor(GAS_RAMP[g] ?? GAS_RAMP.hcho, v), 195, "gas"));
    }
    if (m === "hotspots" && Array.isArray(d.hcho)) {
      layers.push(grid(d.hcho, (v) => rampColor(GAS_RAMP.hcho, v), 150, "hcho-base"));
      if (Array.isArray(d.hotspots)) {
        const hotspots = d.hotspots.map((x: Hotspot, i: number) => ({ ...x, _i: i }));
        layers.push(new ScatterplotLayer({
          id: "hotspots", data: hotspots,
          getPosition: (x: Hotspot) => [x.lon, x.lat],
          getRadius: (x: Hotspot) => 14000 + Math.sqrt(x.n ?? 1) * 9000, radiusUnits: "meters",
          radiusMinPixels: 4,
          getFillColor: (x: Hotspot) => [...(SOURCE_RGB[x.source] ?? SOURCE_RGB.other), 235] as [number, number, number, number],
          stroked: true, getLineColor: [255, 255, 255, 120], lineWidthMinPixels: 1, pickable: true,
          onClick: ({ object }: { object?: Hotspot }) => {
            if (object) setSelectedHotspot(object);
            return true;
          },
        }));
      }
    }
    if (m === "transport") {
      if (Array.isArray(d.hcho)) layers.push(grid(d.hcho, (v) => rampColor(GAS_RAMP.hcho, v), 110, "hcho-base"));
      if (Array.isArray(d.fires))
        layers.push(new ScatterplotLayer({
          id: "fires", data: d.fires, getPosition: (x: number[]) => [x[0], x[1]],
          getRadius: 9000, radiusUnits: "meters", radiusMinPixels: 1,
          getFillColor: [255, 90, 50, 180],
        }));
      if (Array.isArray(d.traj))
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
    else if (layer.id === "hotspots") {
      setSelectedHotspot(object as Hotspot);
      txt = `${object.source}${object.detail ? " / " + object.detail : ""} · FRP ${object.frp}`;
    }
    onReadout?.(txt);
    return { html: `<div style="font:12px ui-monospace,monospace">${txt}</div>`,
      style: { background: "#0e1217", color: "#ECECE6", border: "1px solid rgba(255,255,255,.12)" } };
  };

  // init map once
  useEffect(() => {
    if (!wrap.current || map.current) return;
    const m = new maplibregl.Map({
      container: wrap.current, style: STYLE, center: [80.5, 22.5], zoom: 4,
      minZoom: 3.2, maxZoom: 8, attributionControl: false, dragRotate: false,
      maxBounds: [[58, -2], [104, 42]],
    });
    m.touchZoomRotate.disableRotation();
    m.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.current = m;
    m.on("load", async () => {
      setLayerStatus("loading");
      setLayerMessage("Loading atmospheric layer...");
      const need: Record<Mode, string[]> = {
        aqi: ["aqi_frames"], gas: ["gas_grids"],
        hotspots: ["hcho_grid", "hotspots"], transport: ["hcho_grid", "fires", "trajectory"],
      };
      const map2: Record<string, string> = {
        aqi_frames: "aqi", gas_grids: "gas", hcho_grid: "hcho",
        hotspots: "hotspots", fires: "fires", trajectory: "traj",
      };
      const files = need[props.current.mode];
      const loaded = await Promise.all(files.map(async (f) => {
        try {
          const response = await fetch(`/data/${f}.json`);
          if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
          return { file: f, json: await response.json(), ok: true };
        } catch {
          return { file: f, json: null, ok: false };
        }
      }));
      if (map.current !== m) return; // unmounted (React strict-mode double-invoke)
      let ok = 0;
      loaded.forEach(({ file, json, ok: didLoad }) => {
        if (!didLoad) return;
        data.current[map2[file]] = json;
        ok += 1;
      });
      if (ok === files.length) {
        setLayerStatus("ready");
        setLayerMessage("");
      } else if (ok > 0) {
        setLayerStatus("partial");
        setLayerMessage("Some prototype layers are unavailable.");
      } else {
        setLayerStatus("error");
        setLayerMessage("Layer unavailable in prototype mode.");
      }
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
      {layerStatus !== "ready" && (
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-sm border px-3 py-2 data text-[11px]"
          style={{
            background: "rgba(14,18,23,0.9)",
            borderColor: layerStatus === "error" ? "rgba(255,122,69,0.5)" : "rgba(255,255,255,0.12)",
            color: layerStatus === "loading" ? "#a7aeb6" : "#ffb48d",
          }}>
          {layerMessage}
        </div>
      )}
      {mode === "hotspots" && <HotspotCard hotspot={selectedHotspot} />}
      <MapLegend mode={mode} gas={gas} />
    </div>
  );
}
