from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass
class TestResult:
    name: str
    passed: bool
    message: str


def run_tests(
    signals_df: pd.DataFrame,
    data_df: pd.DataFrame,
    strategy_description: str | None = None,
    corporate_needs: set[str] | None = None,
    strategy_code: str | None = None,
) -> list[TestResult]:
    results: list[TestResult] = []
    date_col = "date" if "date" in data_df.columns else "Date"
    data_dates = pd.to_datetime(data_df[date_col])
    data_min = data_dates.min()
    data_max = data_dates.max()

    required = {"Date", "Signal", "Price"}
    if set(signals_df.columns) >= required:
        results.append(TestResult("test_schema", True, "Has Date, Signal, Price columns"))
    else:
        missing = required - set(signals_df.columns)
        results.append(
            TestResult("test_schema", False, f"Missing columns: {missing}")
        )

    valid_signals = set(signals_df["Signal"].dropna().unique()) <= {"BUY", "SELL"}
    if valid_signals:
        results.append(
            TestResult("test_signal_values", True, "Signal values are BUY or SELL")
        )
    else:
        bad = set(signals_df["Signal"].dropna().unique()) - {"BUY", "SELL"}
        results.append(
            TestResult(
                "test_signal_values",
                False,
                f"Invalid signal values: {bad}",
            )
        )

    prices = pd.to_numeric(signals_df["Price"], errors="coerce")
    has_nan_inf = prices.isna().any() or (prices.dtype.kind in "fc" and np.isinf(prices.astype(float)).any())
    if not has_nan_inf:
        results.append(
            TestResult("test_no_nan_prices", True, "No NaN/inf in Price column")
        )
    else:
        results.append(
            TestResult(
                "test_no_nan_prices",
                False,
                "Price column contains NaN or inf",
            )
        )

    if len(signals_df) >= 1:
        results.append(TestResult("test_has_signals", True, "At least 1 signal exists"))
    else:
        results.append(
            TestResult("test_has_signals", False, "No signals in output")
        )

    buy_count = (signals_df["Signal"] == "BUY").sum()
    sell_count = (signals_df["Signal"] == "SELL").sum()
    if buy_count >= 1 and sell_count >= 1:
        results.append(
            TestResult("test_has_both_types", True, "At least 1 BUY and 1 SELL")
        )
    else:
        results.append(
            TestResult(
                "test_has_both_types",
                False,
                f"Need both BUY and SELL (buy={buy_count}, sell={sell_count})",
            )
        )

    signal_dates = pd.to_datetime(signals_df["Date"])
    in_range = (signal_dates >= data_min) & (signal_dates <= data_max)
    if in_range.all():
        results.append(
            TestResult(
                "test_dates_in_range",
                True,
                "All signal dates fall within data date range",
            )
        )
    else:
        bad_dates = signal_dates[~in_range].tolist()
        results.append(
            TestResult(
                "test_dates_in_range",
                False,
                f"Signal dates outside range: {bad_dates[:5]}...",
            )
        )

    n_signals = len(signals_df)
    n_data = len(data_df)
    pct = n_signals / n_data if n_data > 0 else 0
    if 1 <= n_signals <= max(n_data, 1):
        results.append(
            TestResult(
                "test_reasonable_count",
                True,
                f"Signal count ({n_signals}) between 1 and data rows ({n_data})",
            )
        )
    else:
        results.append(
            TestResult(
                "test_reasonable_count",
                False,
                f"Signal count {n_signals} not in [1, {n_data}]",
            )
        )

    chronological = signal_dates.is_monotonic_increasing
    if chronological:
        results.append(
            TestResult("test_chronological", True, "Signals are in date order")
        )
    else:
        results.append(
            TestResult(
                "test_chronological",
                False,
                "Signals are not in chronological order",
            )
        )

    # Earnings: use corporate_needs from the original user query when set (survives preflight rewrites).
    from backtester.data.corporate import detect_corporate_needs

    earn_need = False
    if corporate_needs is not None:
        earn_need = "earnings" in corporate_needs
    elif strategy_description:
        earn_need = "earnings" in detect_corporate_needs(strategy_description)

    if earn_need and strategy_code:
        if "Is_Earnings_Day" not in strategy_code and "Days_To_Earnings" not in strategy_code:
            results.append(
                TestResult(
                    "test_earnings_columns_in_code",
                    False,
                    "Strategy must reference Is_Earnings_Day and/or Days_To_Earnings in code when "
                    "earnings are required (corporate data was loaded for this request)",
                )
            )
        else:
            results.append(
                TestResult(
                    "test_earnings_columns_in_code",
                    True,
                    "Code references earnings calendar columns",
                )
            )

    # Data-driven cap: BUY count cannot exceed earnings rows when earnings are required.
    if earn_need and "Is_Earnings_Day" in data_df.columns:
        try:
            earn_series = data_df["Is_Earnings_Day"].fillna(False)
            if earn_series.dtype == object:
                earn_series = earn_series.map(
                    lambda x: str(x).strip().lower() in ("true", "1", "1.0", "yes")
                )
            n_earn = int(earn_series.astype(bool).sum())
        except Exception:
            n_earn = 0
        if n_earn > 0:
            if buy_count > n_earn:
                results.append(
                    TestResult(
                        "test_earnings_entry_budget",
                        False,
                        f"Earnings-based entry: data has {n_earn} earnings day(s) but {buy_count} BUY "
                        f"signals - cannot exceed one BUY per earnings event in range",
                    )
                )
            else:
                results.append(
                    TestResult(
                        "test_earnings_entry_budget",
                        True,
                        f"Earnings entry budget ok ({buy_count} BUY vs {n_earn} earnings days in data)",
                    )
                )

    return results
