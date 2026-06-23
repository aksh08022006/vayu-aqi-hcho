"""Regrid every raster source onto the single project analysis grid.

Continuous fields (AOD, gases, met) use bilinear interpolation; categorical /
fractional fields are passed through nearest. The output is an xarray.Dataset
with one data variable per predictor, all sharing (time, lat, lon).
"""

from __future__ import annotations

from pathlib import Path

import rioxarray  # noqa: F401  (registers .rio accessor)
import xarray as xr

from isro_aqi.utils.geo import Grid, regrid
from isro_aqi.utils.logging import get_logger

log = get_logger("regrid")

CONTINUOUS = "linear"
CATEGORICAL = "nearest"


def open_raster(path: str | Path) -> xr.DataArray:
    """Open a GeoTIFF (single band) as a lat/lon DataArray."""
    da = rioxarray.open_rasterio(path, masked=True).squeeze(drop=True)
    return da.rename({"x": "lon", "y": "lat"})


def regrid_to_dataset(
    layers: dict[str, xr.DataArray], grid: Grid, methods: dict[str, str] | None = None
) -> xr.Dataset:
    """Regrid a dict of named DataArrays onto `grid` and merge into a Dataset.

    methods maps a layer name to 'linear'/'nearest'; defaults to linear.
    """
    methods = methods or {}
    out = {}
    for name, da in layers.items():
        method = methods.get(name, CONTINUOUS)
        out[name] = regrid(da, grid, method=method)
        log.info(f"regridded {name} ({method}) -> {grid.shape}")
    return xr.Dataset(out)
