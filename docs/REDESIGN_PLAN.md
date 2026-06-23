# VAYU Redesign Plan — High-Resolution India AQI (Hong Kong RAPI × Shanghai spatial engine)

**Status:** proposed (awaiting approval to build)
**Author:** redesign per problem-statement re-read + fact-checked deep research
**Scope:** Objective 1 (surface AQI) and Objective 2 (HCHO hotspots), aligned to the
ISRO problem statement and the 4 reference papers, with 6 targeted upgrades.

---

## 0. Why this redesign

The current repo runs end-to-end but (a) skips the *precision* steps the reference
papers rely on, (b) targets 0.1° (~11 km) when 1 km is the competitive standard,
and (c) carries modules outside the ISRO evaluation criteria. This plan keeps what
maps to the problem statement, adds the missing precision stages, and removes scope
creep.

### The two-formula fusion (the core idea)

The four references split into two jobs. We fuse them:

| Paper | Job | Used for |
|-------|-----|----------|
| **Wang 2023 [C]** (Shanghai) | **HIGH-RESOLUTION SPATIAL ENGINE** — gap-fill → trend + kriging residual → 1 km pixels | *how we get pollutants at every 1 km cell* |
| **Lu 2011 [D]** (Hong Kong) | **AQI INDEX FORMULA** — entropy-weighted RAPI combining all pollutants | *how we turn pollutants into the index number* |
| **Dong 2026 [A]** (BTH) | PHV HCHO hotspot ratio index | Objective 2 detection |
| **Kuttippurath 2022 [B]** (India) | India HCHO context, anthropogenic-dominated over IGP | Objective 2 attribution |

> **Pipeline:** Shanghai engine produces 1 km pollutant maps → Hong Kong RAPI + CPCB
> AQI convert each pixel into an index → 1 km India AQI/RAPI maps (daily + seasonal).

### Hong Kong formulas (verbatim from the PDF)

Sub-index (Eq. 1 — identical to CPCB):
```
I_p = (PI_high − PI_low)/(BP_high − BP_low) · (C_p − BP_low) + PI_low
```
Revised API (Eq. 2 — the entropy upgrade): the standard max sub-index scaled up when
co-pollutants are also elevated, via Shannon entropy. Pixel-friendly implementable form
(already present in `aqi/engine.py::aggregate_entropy`):
```
p_k  = I_k / Σ I_j
H    = −Σ p_k·ln(p_k) / ln(K)          # normalised entropy 0..1
RAPI = max(I) · (1 + (mean(I)/max(I)) · H)
```

---

## 1. Dual-index output design (decision: both, two views)

Every pixel **always computes both** CPCB AQI (max-aggregation) **and** RAPI (entropy).
We publish two views from the same numbers:

| View | Headline index | Secondary | Audience |
|------|----------------|-----------|----------|
| **Main / compliance** | **CPCB AQI** | RAPI | ISRO evaluation, official AQI compliance |
| **USP / novelty** | **RAPI** | CPCB AQI | the differentiator — multi-pollutant burden |

Plus a **divergence map** `RAPI − CPCB` that highlights where the entropy index would
reclassify cells the CPCB max rule misses (the headline novelty figure).

CPCB colour ramp is non-negotiable (official hex). RAPI maps reuse the same CPCB bands
so the two views are directly comparable.

---

## 2. Target architecture

```
DATA
  MAIAC AOD 1km (MCD19A2) · INSAT-3D AOD 10km · TROPOMI NO2/SO2/CO/O3/HCHO
  CPCB stations (ground truth) · ERA5/IMDAA met · MODIS/VIIRS fire · landcover · DEM
        │
        ▼
PREPROCESS                                                   ── CHANGES 1,2,4
  ① AOD gap-fill   residual autoencoder (R²≈0.94) | RF (R²≈0.87)   [gapfill_aod.py]
       MAIAC is 41% missing; skipping biases PM2.5 +19.1% over India (Katoch 2023)
  ② NO2 calibrate  TROPOMI→surface bias correction vs CPCB (raw ≈4× low) [calibrate_no2.py]
  ④ Regrid to 1 km backbone (was 0.1°); QA filter; collocate to CPCB
        │
        ▼
OBJECTIVE 1 — SURFACE POLLUTANTS → AQI                       ── CHANGES 3,6
  ③ Hybrid model   C(s,t) = μ(s,t) + v(s,t)                    [models/hybrid.py]
       trend  μ: CNN-LSTM (ISRO-specified) + RF/XGB ensemble option
       resid  v: kriging on residuals (Shanghai structure; near-station gain)
       → 1 km maps: PM2.5, PM10, NO2, SO2, CO, O3
  INDEX            CPCB AQI (max) + RAPI (entropy), both per pixel  [aqi/engine.py]
       → Main view (CPCB headline) + USP view (RAPI headline) + divergence map
  ⑥ Validation     spatial-CV + temporal-CV R²/RMSE/MAE vs India benchmarks
        │
        ▼
OBJECTIVE 2 — HCHO HOTSPOTS                                  ── CHANGE 5
  ⑤ PHV (ratio index) + Getis-Ord Gi*  — complementary, not "PHV provably best"
       biomass-burning periods from MODIS/VIIRS fire counts
       source attribution → anthropogenic-dominated over IGP (Kuttippurath)
       fire–HCHO correlation + ERA5 wind transport
```

---

## 3. The six changes — implementation detail

### Change 1 — AOD gap-fill (highest priority)
- **New module** `src/isro_aqi/preprocessing/gapfill_aod.py`.
- Two backends behind one interface:
  - `ResidualAutoencoderGapFiller` (preferred; Li 2020 RSE, R²≈0.94) — covariates: lat/lon, DOY (sin/cos), ERA5 met, elevation, landcover, neighbouring valid AOD.
  - `RandomForestGapFiller` (fallback; simpler, R²≈0.87 India) — same covariates.
- **CV done right:** spatially-clustered holdouts that mimic the observed cloud-gap
  pattern (random holdout overstates skill). Report gap-fill R²/RMSE separately.
- Wire into `pipelines/02_preprocess.py` *before* collocation and feature build.
- **Demo path:** `synthetic.py` injects realistic missingness (≈41%, winter>summer)
  so the gap-fill stage is exercised credential-free.

### Change 2 — TROPOMI NO2 bias correction
- **New module** `src/isro_aqi/preprocessing/calibrate_no2.py`.
- Fit a correction (regression-kriging style: ML trend + kriging on residuals;
  Valerio 2025) mapping TROPOMI tropospheric NO2 column → surface NO2 using collocated
  CPCB NO2. Persist the fitted transform; apply to the full grid.
- Report calibration R²/slope/intercept and pre/post bias. Raw TROPOMI ≈ 4× low.

### Change 3 — Hybrid model (don't oversell)
- **New module** `src/isro_aqi/models/hybrid.py`: wraps any trend learner
  (`PollutantCNNLSTM`, RF, or a stacked ensemble) and adds an Ordinary/Universal
  Kriging stage on the residuals at CPCB stations, interpolated to the grid.
- Framing in docs/figures: CNN-LSTM stays the ISRO-specified learner; kriging-residual
  is an *additive correction* that helps near stations (<~100 km). **No claim** that
  PLS+kriging replaces CNN-LSTM.
- Ensemble option (CNN-LSTM + RF + XGB combined) noted as the empirically strongest
  configuration; selectable via config, default = CNN-LSTM + kriging.

### Change 4 — 1 km backbone
- `config/config.example.yaml`: `grid.aqi_resolution_deg: 0.1 → 0.01` (1 km backbone
  for the AOD/PM2.5 layer). Gases may stay coarser and be resampled.
- **Compute note (honest):** full-India daily 1 km ≈ 9 M cells/day — heavy. Plan: tile
  by region or run season-at-a-time on real data; keep the synthetic demo coarse
  (0.5°) for speed but label outputs as 1 km-capable. Document the tiling strategy.
- `train.py::spatial_blocks` block size revisited so blocks ≫ 1 km (leakage-free).

### Change 5 — HCHO: PHV + Gi*, drop "provably best", IGP anthropogenic
- Keep `hcho/phv.py` (correct it to a **ratio** index: centre ÷ vicinity, >1 = hotspot)
  and `hcho/getis_ord.py` as complementary detectors.
- **Remove** `hcho/dbscan_hotspots.py`, `hcho/percentile.py`, `hcho/ozone_relationship.py`
  (FNR) — trim to the two methods the problem statement implies ("statistical thresholds
  or clustering").
- Source attribution leans on Kuttippurath: anthropogenic VOC dominates over IGP; keep
  `source_attribution.py` + `transport.py` (fire–HCHO + ERA5 wind).
- Evaluation by threshold-sensitivity + inter-method agreement (and MAD in molec/cm²),
  **not** R²/RMSE — those don't apply to hotspot masks.

### Change 6 — Spatial-CV reporting vs India benchmarks
- Extend `models/train.py` reporting to always emit per-pollutant R²/RMSE/MAE under
  random / **spatial** / temporal CV, plus AQI R².
- Benchmark table baked into the results report:

| Pollutant | Target R² (India-competitive) | Source |
|-----------|:-----------------------------:|--------|
| PM2.5 | daily ≥0.86 / annual ≥0.92 | Science Adv 2024 / Katoch 2023 |
| PM10  | 0.84–0.91 | Wang 2023 |
| NO2   | ~0.83 (post-calibration) | Wang 2023 |
| O3    | 0.47–0.79 (hard) | Wang 2023 |
| SO2   | 0.23–0.43 (hardest) | Wang 2023 |
| CO    | 0.55–0.62 | Wang 2023 |

---

## 4. File-level migration

### ADD
| Path | Purpose |
|------|---------|
| `src/isro_aqi/preprocessing/gapfill_aod.py` | residual-autoencoder + RF AOD gap-fill (Change 1) |
| `src/isro_aqi/preprocessing/calibrate_no2.py` | TROPOMI→surface NO2 bias correction (Change 2) |
| `src/isro_aqi/models/hybrid.py` | trend + kriging-residual wrapper (Change 3) |
| `tests/test_gapfill.py`, `tests/test_calibrate_no2.py`, `tests/test_rapi.py` | unit coverage for new cores |

### MODIFY
| Path | Change |
|------|--------|
| `config/config.example.yaml` | 1 km backbone; gap-fill + calibration + hybrid + dual-index settings (Changes 1,2,3,4) |
| `src/isro_aqi/aqi/engine.py` | wire RAPI into a grid method; emit CPCB + RAPI + divergence together |
| `src/isro_aqi/models/train.py` | always report 3-scheme CV incl. spatial; benchmark table (Change 6) |
| `src/isro_aqi/hcho/phv.py` | document/confirm ratio-index semantics (Change 5) |
| `src/isro_aqi/synthetic.py` | inject AOD missingness; mark 1 km-capable |
| `pipelines/02_preprocess.py` | call gap-fill + NO2 calibration |
| `pipelines/05_generate_aqi.py` | produce Main + USP + divergence map sets |
| `pipelines/06_hcho_analysis.py` | drop DBSCAN/P95/FNR calls |
| `pipelines/run_demo.py` | reflect new stages; drop SHAP/FNR |
| `README.md` / `ABOUT.md` | re-scope claims to match this plan |

### REMOVE (verify import graph first — do not break the hybrid)
| Path | Reason |
|------|--------|
| `src/isro_aqi/explain/shap_analysis.py` | not in ISRO evaluation criteria |
| `src/isro_aqi/hcho/ozone_relationship.py` | FNR ozone regimes out of scope |
| `src/isro_aqi/hcho/dbscan_hotspots.py` | trim to PHV + Gi* |
| `src/isro_aqi/hcho/percentile.py` | trim to PHV + Gi* |
| `tests/test_dbscan.py` | follows DBSCAN removal |
| `src/isro_aqi/models/lstm.py` | **only if** `cnn_lstm.py` does not import it (else keep) |
| XGBoost path in `models/baselines.py` | optional; keep RF as the single tree baseline |
| `web/` (Next.js 17-section site) | **keep on disk, drop from scope** for the research milestone — not deleted |

> `models/cnn.py` is **kept** — `PollutantCNNLSTM` depends on `PollutantCNN.embed()`.

---

## 5. New pipeline order

```
01_ingest        MAIAC AOD + INSAT + TROPOMI + ERA5 + fire + landcover + CPCB
02_preprocess    regrid→1km · QA filter · ① AOD gap-fill · ② NO2 calibrate · collocate
03_build_db      unified 1 km training table
04_train         ③ hybrid (CNN-LSTM + kriging residual) · ⑥ 3-scheme CV + benchmarks
05_generate_aqi  1 km pollutant maps → CPCB AQI + RAPI + divergence (Main + USP views)
06_hcho          ⑤ PHV + Gi* hotspots · fire windows · anthropogenic IGP attribution
07_transport     fire–HCHO correlation + ERA5 back-trajectories
```

---

## 6. Build order (milestones)

1. **M1 — Config + cleanup.** 1 km config; remove out-of-scope modules (after import-graph
   check); fix tests. *Green `pytest` before proceeding.*
2. **M2 — Index core.** Wire RAPI into `engine.py`; dual-view + divergence; `test_rapi.py`.
3. **M3 — Gap-fill.** `gapfill_aod.py` (RF first, autoencoder second) + clustered-CV; demo missingness.
4. **M4 — NO2 calibration.** `calibrate_no2.py` + report.
5. **M5 — Hybrid model.** `models/hybrid.py`; integrate kriging residual; benchmark table.
6. **M6 — HCHO trim.** PHV ratio-fix + Gi*; attribution; remove DBSCAN/P95/FNR.
7. **M7 — Docs + demo.** Update README/ABOUT; `make demo` produces Main + USP + divergence + benchmark report.

Each milestone is independently testable on synthetic data (no credentials).

---

## 7. Risks & honest caveats

- **1 km over all India is compute-heavy** (~9 M cells/day). Mitigation: tiling /
  season-at-a-time on real data; coarse synthetic demo. Documented, not hidden.
- **Katoch 2023 flagged train/test gap (overfit risk)** in gap-fill — we report
  clustered-holdout CV, not optimistic random CV.
- **Kriging helps mainly <~100 km from a station**; India is sparse, so its benefit is
  regional, not national — we state this, no overclaiming.
- **PHV has no published head-to-head vs Gi*/DBSCAN** — present as complementary,
  evidence-honest.
- **SO2/O3 stay hard** (literature ceiling) — flagged advisory-confidence.

---

## 8. Objective-1 — End-to-End Model Building (complete spec)

> **Current state (important):** the building blocks exist — `PatchSequenceDataset`,
> `PollutantCNNLSTM`, `train_model`, `RandomForestModel`, `AQIEngine`. But the
> **deep-model path in `pipelines/04_train.py` and all of `pipelines/05_generate_aqi.py`
> are stubs** (TODO comments, not wired). "End-to-end model building" = implementing
> these orchestrations for real, plus the trend+kriging hybrid and dual-index output.

### 8.0 Data flow at a glance
```
raw → regrid(1km) → QA → ①gapfill_aod → ②calibrate_no2 → daily.zarr (time,lat,lon,channels)
                                                              │
                          collocate@CPCB ──────────────────────┤→ training.parquet (long table)
                                                              │
   features (engineering.py) ────────────────────────────────┤
                                                              ▼
              ③ TREND μ(s,t): CNN-LSTM (+RF/XGB)  ──┐
                                                   ├─→ residual kriging v(s,t) ─→ ŷ(s,t)=μ+v
              station residuals r=y−μ  ────────────┘
                                                              ▼
              1km pollutant grids (PM2.5,PM10,NO2,SO2,CO,O3)
                                                              ▼
              AQI engine: CPCB(max) + RAPI(entropy) + divergence  ─→ Main & USP map sets
                                                              ▼
              ⑥ 3-scheme CV report vs India benchmarks
```

### 8.1 The unified table (already schema'd — `database/schema.py`)
- One row per `(date, lat, lon)`. `PREDICTORS` = model inputs; `TARGETS`
  (`pm25, pm10, no2_obs, so2_obs, o3_obs, co_obs`) populated only where a cell
  collocates with a CPCB station, NaN elsewhere (the unlabelled cells are what we
  predict to draw maps).
- Partitioned parquet by `year, month`.

### 8.2 Complete feature set (grounded in `PREDICTORS`)
| Group | Features |
|-------|----------|
| Satellite columns | `aod` (gap-filled MAIAC/INSAT), `no2` (bias-corrected), `so2`, `co`, `o3`, `hcho` |
| Meteorology (ERA5/IMDAA) | `temperature`, `rh`, `u_wind`, `v_wind`, `wind_speed`, `pressure`, `precipitation`, `solar_radiation`, `blh` |
| Fire / biomass | `frp_mean`, `frp_max`, `fire_count`, `burned`, `evi` |
| Static | `elevation`, `slope`, `aspect`, `lc_{tree,shrub,grass,crop,built,bare,water,wetland}` |
| Spatial context | `lat`, `lon` |
| Engineered (`features/engineering.py`) | `fnr` (HCHO/NO₂), `doy_sin`, `doy_cos`, `aod_blh`, `photo_index`, lags `{1,2,3}` + `roll3` on key drivers |

> Note: `fnr` stays as a **predictor feature** (cheap, physically motivated). Only the
> standalone *FNR ozone-regime analysis module* (`hcho/ozone_relationship.py`) is removed.

### 8.3 Preprocessing chain (`pipelines/02_preprocess.py`)
1. **Regrid** every source to the 1 km backbone (`regrid.py`, bilinear; nearest for
   categorical land cover).
2. **QA filter** (`qa_filter.py`): cloud fraction < 0.4; HCHO `qa_value` > 0.5;
   VIIRS FRP > 5 MW.
3. **① AOD gap-fill** (`gapfill_aod.py`) — fills MAIAC's ~41% gaps; **clustered-holdout
   CV** reported separately. Output: complete daily AOD field.
4. **② NO₂ calibration** (`calibrate_no2.py`) — TROPOMI column → surface NO₂ via
   regression-kriging fit on collocated CPCB; persists the transform.
5. **Temporal compositing** (`temporal.py`) with the **CPCB averaging-window fix**
   (see 8.7): 24-h mean for PM/NO₂/SO₂; 8-h rolling for O₃/CO.
6. **Collocate** (`collocate.py::sample_at_stations` + `join_targets`) → `training.parquet`.
7. Persist the gridded predictor cube to `data/interim/daily.zarr` (dims `time,lat,lon`,
   one var per channel) for patch/sequence assembly.

### 8.4 The hybrid model — trend μ + kriging residual v  (`models/hybrid.py`, NEW)
Regression-kriging, exactly Wang/Shanghai's `C(s,t)=μ(s,t)+v(s,t)`:

**Training**
1. Train the **trend** learner μ on collocated station rows:
   - default **CNN-LSTM** (`PollutantCNNLSTM`, ISRO-specified) via
     `PatchSequenceDataset` + `train_model` (Adam, masked-MSE, early stop);
   - **and** RF/XGB (`_PerTargetModel`) as a fast pointwise trend + ensemble option.
2. Compute **station residuals** per target: `r(sᵢ,t) = y_obs(sᵢ,t) − μ̂(sᵢ,t)`.
3. Fit a **variogram** on residuals (per day, or pooled per season for stability) and
   **krige** them to the full grid → `v̂(s,t)`. Ordinary kriging; range≈50 km
   (Shanghai), nugget/sill fit from data.
4. **Final field:** `ŷ(s,t) = μ̂(s,t) + v̂(s,t)`. Near stations v̂ corrects local bias;
   far away v̂→0 so ŷ→trend (matches Lee 2012: kriging helps <~100 km). **No overclaim.**

**Pseudo-code**
```python
trend = CNNLSTMTrend(cfg) or RFTrend(cfg)        # μ
trend.fit(train_stations)
res = obs - trend.predict(stations)              # r at stations
krig = ResidualKriging(range_km=50).fit(stations_xy, res_by_day)   # v
def predict_grid(date):
    mu = trend.predict_grid(date)                # (lat,lon,6)
    v  = krig.predict_grid(date, grid)           # (lat,lon,6), →0 away from stns
    return mu + v
```

### 8.5 Standardisation & target handling (existing, reused)
- `Standardizer` z-scores each predictor channel using **train-split stats only**
  (no leakage); reused for val/test/inference.
- Optional **per-target z-scoring** so the largest-magnitude pollutant doesn't dominate
  multi-target MSE; de-standardise for RMSE reporting.
- `masked_mse` skips NaN targets so partially-reporting stations still contribute.

### 8.6 1 km inference & tiling (the compute-honest part)
- Full-India 1 km daily ≈ 9 M cells. Two-track inference:
  - **Full-grid maps:** use the **pointwise RF/ensemble trend** (vectorised over all
    cells) + kriged residual — tractable nationally.
  - **CNN-LSTM:** patch-based; run **tiled** (e.g. 512×512-cell tiles with a
    `patch_size//2` halo, reflect-padded, batched) for representative regions and for
    the validation benchmark; optionally on a coarser backbone then downscale.
- Document which model produced each published map. Default operational map =
  RF/ensemble + kriging; CNN-LSTM = ISRO-specified learner, benchmarked + tiled demos.

### 8.7 AQI computation — CPCB + RAPI, both views (`05_generate_aqi.py`, wire it)
1. Predict the six pollutant grids for each day (8.4/8.6).
2. **CPCB averaging windows (fix):** PM2.5/PM10/NO₂/SO₂ = 24-h mean; **CO & O₃ = max of
   8-h rolling mean** (currently `temporal.py` does plain means only — add the rolling
   step before sub-indexing).
3. **Sub-indices** (`engine.sub_indices`) → **CPCB AQI** (`engine.aqi_grid`, max-rule) +
   **RAPI** (wire `aggregate_entropy` into a new `engine.rapi_grid`).
4. Emit per pixel: `aqi_cpcb`, `aqi_rapi`, `dominant`, `category`, and
   `divergence = rapi − cpcb`.
5. **Render two map sets** (CPCB colour ramp for both):
   - **Main view** — CPCB headline (+ RAPI inset)
   - **USP view** — RAPI headline (+ CPCB inset) + divergence map
6. **Aggregate** daily → monthly → seasonal → annual (`temporal.py`, IMD seasons).

### 8.8 Validation harness (`models/train.py` → results report)  ⑥
- Always emit per-pollutant **R²/RMSE/MAE** under **three schemes**:
  `random_kfold` (optimistic), `spatial_blocks` (leave-location-out, honest spatial),
  `temporal_split` (held-out years, honest temporal). Plus overall **AQI R²**.
- Print against the India benchmark table (§3, Change 6); flag SO₂/O₃ advisory.
- Save `outputs/validation_report.{md,json}`.

### 8.9 Artifacts & reproducibility
| Artifact | Path |
|----------|------|
| Trend (CNN-LSTM) | `models/cnn_lstm.pt` |
| Trend (RF/XGB) | `models/rf.joblib`, `models/xgb.joblib` |
| Residual-kriging params | `models/residual_kriging.joblib` |
| NO₂ calibration transform | `models/no2_calibration.joblib` |
| AOD gap-fill model | `models/aod_gapfill.{pt,joblib}` |
| Standardiser stats | `models/standardizer.npz` |
| Validation report | `outputs/validation_report.md` |
- Single `random_seed` from config threads through NumPy/torch/sklearn. Each pipeline
  stage is idempotent and re-runnable.

---

## 9. Objective-2 — End-to-End HCHO Hotspots (complete spec)

### 9.1 Inputs & composites
- TROPOMI **HCHO** column (QA `qa_value>0.5`, cloud<0.4), VIIRS/MODIS **fire**, ERA5
  **winds**, land cover. Build **seasonal composites** on the 0.01° (1 km) HCHO grid,
  focused on burning windows (post-monsoon Oct–Nov IGP paddy; pre-monsoon Apr–May wheat
  + forest fire).

### 9.2 Fire-window extraction
- From MODIS/VIIRS fire counts, derive per-cell `fire_count`/`frp` per window; flag
  active biomass-burning days. Feeds both attribution and the HCHO–fire correlation.

### 9.3 Detection — PHV + Getis-Ord Gi* (complementary)
- **PHV** (`hcho/phv.py`) — **ratio index**: `PHV = HCHO_centre / mean(HCHO_vicinity)`;
  `PHV>1` ⇒ local anomaly; HVA confirmed where column ≥ `1e16` molec/cm² and PHV exceeds
  threshold. (Correct any "percentage-excess" wording to **ratio**.)
- **Getis-Ord Gi\*** (`hcho/getis_ord.py`) — z-scores + Benjamini-Hochberg FDR for
  statistical significance.
- **Output:** hotspot masks from each method + an **agreement layer**; report
  threshold-sensitivity and inter-method agreement (NOT R²/RMSE — these are masks).

### 9.4 Source attribution (IGP anthropogenic-dominated)
- Overlay confirmed hotspots with `config/regions.yaml` source boxes + land cover +
  fire to label: `agri_burning / forest_fire / urban / industrial / biogenic`.
- Lean on Kuttippurath [B]: over the **IGP, anthropogenic VOC dominates** (37–50% of
  regional VOC, exceeding biogenic) — state this in the attribution narrative.
- Output: `outputs/hcho_hotspots_attributed.csv` (centroid, method, label, FRP).

### 9.5 Transport influence (`hcho/transport.py`)
- ERA5 kinematic **back-trajectories** from receptor cities (e.g. Delhi); count VIIRS
  fire pixels within 50 km of the parcel path during the burning window → directional,
  mechanistic fire→HCHO evidence (not just correlation).
- **Fire–HCHO correlation**: per-window Pearson r and best lag.

### 9.6 Outputs & evaluation
- Seasonal HCHO hotspot maps (PHV/Gi* overlay), attributed-source table, trajectory
  overlay, fire–HCHO time series. Evaluation = clarity/agreement of detection,
  multi-source integration, scientific interpretation, visualisation quality
  (the ISRO Objective-2 criteria).

---

## 10. Data contracts (quick reference)

| Object | Shape / schema |
|--------|----------------|
| Gridded cube `daily.zarr` | dims `(time, lat, lon)`, one var per `PREDICTORS` channel |
| Training table `training.parquet` | long: `KEYS + PREDICTORS + TARGETS`, partitioned `year/month` |
| CNN-LSTM input | `(B, T=7, C, P=15, P=15)` from `PatchSequenceDataset` |
| CNN-LSTM output | `(B, 6)` = `[pm25, pm10, no2, so2, co, o3]` for centre cell, day T |
| Pollutant grids | `(lat, lon, 6)` per day |
| AQI outputs | `aqi_cpcb`, `aqi_rapi`, `dominant`, `category`, `divergence` per cell |
| HCHO hotspots | per-method boolean mask `(lat, lon)` + attributed-cluster CSV |
```
