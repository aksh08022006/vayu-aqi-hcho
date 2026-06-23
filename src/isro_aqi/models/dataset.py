"""Torch datasets that turn the gridded stack + station targets into tensors.

PatchSequenceDataset yields ((T, C, P, P) patch sequence, (n_targets,) label) for
the CNN-LSTM. Set sequence_length=1 to feed the plain CNN; pass patch_size=1 and
squeeze for the plain LSTM. Standardisation stats are computed on the training
split only and reused for val/test (no leakage).
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import torch
import xarray as xr
from torch.utils.data import Dataset

from isro_aqi.utils.geo import Grid


class Standardizer:
    """Per-channel z-score using training-set statistics."""

    def __init__(self, mean: np.ndarray, std: np.ndarray):
        self.mean = mean.astype("float32")
        self.std = np.where(std == 0, 1.0, std).astype("float32")

    @classmethod
    def fit(cls, stack: xr.Dataset, channels: list[str]) -> "Standardizer":
        mean = np.array([float(stack[c].mean(skipna=True)) for c in channels])
        std = np.array([float(stack[c].std(skipna=True)) for c in channels])
        return cls(mean, std)

    def __call__(self, arr: np.ndarray) -> np.ndarray:  # arr: (..., C) channel-last
        return (arr - self.mean) / self.std


class PatchSequenceDataset(Dataset):
    """Spatio-temporal samples for CNN / LSTM / CNN-LSTM.

    Parameters
    ----------
    stack : x.Dataset with dims (time, lat, lon) and one var per predictor channel
    samples : DataFrame with columns [date, lat, lon] + target columns
    channels : ordered predictor variable names
    targets : ordered target column names
    grid : the analysis Grid (for lat/lon -> row/col)
    patch_size : odd P; spatial window. 1 => pointwise (LSTM-only).
    sequence_length : T look-back days. 1 => single day (CNN-only).
    """

    def __init__(
        self,
        stack: xr.Dataset,
        samples: pd.DataFrame,
        channels: list[str],
        targets: list[str],
        grid: Grid,
        patch_size: int = 15,
        sequence_length: int = 7,
        standardizer: Standardizer | None = None,
        target_mean: np.ndarray | None = None,
        target_std: np.ndarray | None = None,
    ):
        self.stack = stack
        self.samples = samples.reset_index(drop=True)
        self.channels = channels
        self.targets = targets
        self.grid = grid
        self.P = patch_size
        self.T = sequence_length
        self.std = standardizer or Standardizer.fit(stack, channels)
        # Optional per-target z-scoring: with multi-target MSE, un-normalised
        # targets let the largest-magnitude pollutant dominate the loss. R2 is
        # scale-invariant so metrics stay comparable; de-standardise for RMSE.
        self.target_mean = None if target_mean is None else np.asarray(target_mean, "float32")
        self.target_std = None if target_std is None else np.where(
            np.asarray(target_std, "float32") == 0, 1.0, target_std).astype("float32")
        self._times = pd.to_datetime(stack["time"].values)
        # pre-stack channels into a single (time, C, lat, lon) array for speed
        self._cube = np.stack([stack[c].values for c in channels], axis=1).astype("float32")

    def __len__(self) -> int:
        return len(self.samples)

    def _patch_seq(self, t_idx: int, row: int, col: int) -> np.ndarray:
        half = self.P // 2
        t0 = max(0, t_idx - self.T + 1)
        seq = self._cube[t0 : t_idx + 1]  # (t<=T, C, H, W)
        # pad temporally at the start of the record
        if seq.shape[0] < self.T:
            pad = np.repeat(seq[:1], self.T - seq.shape[0], axis=0)
            seq = np.concatenate([pad, seq], axis=0)
        # spatial crop with reflection padding for edge cells
        padded = np.pad(
            seq, ((0, 0), (0, 0), (half, half), (half, half)), mode="reflect"
        )
        patch = padded[:, :, row : row + self.P, col : col + self.P]  # (T, C, P, P)
        patch = np.nan_to_num(patch, nan=0.0)
        # standardize per channel (channel axis = 1)
        patch = (patch - self.std.mean[None, :, None, None]) / self.std.std[None, :, None, None]
        return patch.astype("float32")

    def __getitem__(self, i: int):
        r = self.samples.iloc[i]
        idx = self.grid.cell_index(float(r["lon"]), float(r["lat"]))
        t_idx = int(np.argmin(np.abs(self._times - pd.to_datetime(r["date"]))))
        row, col = idx if idx else (0, 0)
        x = torch.from_numpy(self._patch_seq(t_idx, row, col))
        y_raw = np.array([r.get(t, np.nan) for t in self.targets], dtype="float32")
        if self.target_mean is not None:
            y_raw = (y_raw - self.target_mean) / self.target_std
        return x, torch.from_numpy(y_raw)
