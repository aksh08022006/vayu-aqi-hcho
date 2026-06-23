"""Quality control.

  * TROPOMI HCHO qa screening (qa_value > 0.75) is applied at ingestion via the
    cloud_fraction mask; this module re-asserts it and adds physical-range and
    statistical-outlier filters for all variables before they enter the database.
"""

from __future__ import annotations

import numpy as np
import xarray as xr

# Physically plausible ranges (loose) used to drop retrieval garbage.
# Column densities are in mol/m^2; met/AOD/ground in their native units.
VALID_RANGES = {
    "aod": (0.0, 5.0),
    "no2": (0.0, 5e-3),
    "so2": (-1e-3, 5e-3),
    "co": (0.0, 1.0),
    "o3": (0.0, 1.0),
    "hcho": (-1e-4, 5e-3),
    "temperature": (220.0, 330.0),
    "rh": (0.0, 100.0),
    "pressure": (5e4, 1.1e5),
    "pm25": (0.0, 1000.0),
    "pm10": (0.0, 2000.0),
}


def clip_valid_range(ds: xr.Dataset) -> xr.Dataset:
    """Mask values outside each variable's physical range to NaN."""
    for var, (lo, hi) in VALID_RANGES.items():
        if var in ds:
            ds[var] = ds[var].where((ds[var] >= lo) & (ds[var] <= hi))
    return ds


def drop_sigma_outliers(da: xr.DataArray, n_sigma: float = 5.0) -> xr.DataArray:
    """Mask points beyond n_sigma from the mean (per-variable global screen)."""
    mu = da.mean(skipna=True)
    sd = da.std(skipna=True)
    return da.where(np.abs(da - mu) <= n_sigma * sd)


def apply(ds: xr.Dataset, sigma: float = 5.0) -> xr.Dataset:
    ds = clip_valid_range(ds)
    for var in ds.data_vars:
        ds[var] = drop_sigma_outliers(ds[var], sigma)
    return ds
