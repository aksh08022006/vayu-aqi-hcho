#!/usr/bin/env python
"""Streamlit dashboard (Phase 14).

Interactive explorer for the full project: pick a date and layer, view the AQI /
pollutant / HCHO / fire / hotspot map, and inspect HCHO source attribution and
transport trajectories.

    streamlit run dashboard/app.py

Tabs:
    AQI        daily AQI map + dominant-pollutant + category legend
    Pollutants per-pollutant surface concentration maps
    HCHO       HCHO column + PHV/Gi*/DBSCAN hotspots (method selector)
    Fire       VIIRS/MODIS fire density + FRP
    Hotspots   attributed hotspot table (urban/industrial/agri/forest) + map
    Transport  back-trajectory overlay for a chosen receptor/date

This file is intentionally thin: it reads the artifacts produced by the pipelines
(outputs/maps, data/processed) so the dashboard never does heavy compute itself.
"""

from __future__ import annotations

from datetime import date

import streamlit as st

from isro_aqi.config import load_config

st.set_page_config(page_title="India AQI & HCHO Atlas", layout="wide")


@st.cache_resource
def get_config():
    try:
        return load_config("config/config.yaml")
    except FileNotFoundError:
        st.warning("config/config.yaml not found -- copy config/config.example.yaml.")
        return None


def main():
    cfg = get_config()
    st.title("🛰️ India Satellite AQI & HCHO Hotspot Atlas")
    st.caption("INSAT-3D · Sentinel-5P TROPOMI · CPCB · ERA5 · MODIS/VIIRS")

    with st.sidebar:
        st.header("Controls")
        sel_date = st.date_input("Date", value=date(2021, 11, 5))
        layer = st.radio("Layer", ["AQI", "Pollutants", "HCHO", "Fire", "Hotspots", "Transport"])
        if layer == "Pollutants":
            st.selectbox("Pollutant", ["PM2.5", "PM10", "NO2", "SO2", "CO", "O3"])
        if layer == "HCHO":
            st.selectbox("Hotspot method", ["PHV", "Getis-Ord Gi*", "DBSCAN", "P95"])
        if layer == "Transport":
            receptors = list((cfg.regions.get("receptors", {}) if cfg else {}).keys()) or ["delhi"]
            st.selectbox("Receptor", receptors)

    tabs = st.tabs(["Map", "Statistics", "About"])
    with tabs[0]:
        st.subheader(f"{layer} — {sel_date}")
        # Load the pre-rendered artifact for (layer, date) from outputs/.
        # e.g. st.image(f"outputs/maps/aqi_{sel_date}.png")
        st.info("Point this at outputs/maps/* produced by the pipelines (see docstring).")
    with tabs[1]:
        st.write("Category distribution, dominant pollutant frequency, trends.")
    with tabs[2]:
        st.markdown(
            "Built from the `isro_aqi` package. See `docs/` for the full methodology "
            "and `docs/15_dashboard.md` for wiring details."
        )


if __name__ == "__main__":
    main()
