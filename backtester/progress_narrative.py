"""Trader-facing labels and detail strings for backtest progress (not engineering logs)."""

from __future__ import annotations

from datetime import datetime

from backtester.data.interval import INTERVAL_LABELS

# --- Step titles shown in the chat progress stream ---
LOAD_MARKET_DATA = "Building your price history"
CORPORATE_CONTEXT = "Layering in corporate & earnings context"
ALIGN_STRATEGY = "Aligning your idea with the data and time window"
CODE_FROM_RULES = "Translating your rules into executable logic"
REVIEW_FIX = "Incorporating review feedback into the code"
REGENERATE = "Taking a fresh approach after a repeat failure"
DIAGNOSE_STUCK = "Diagnosing why the run kept failing the same way"
FIX_EXECUTION = "Patching execution issues in the code"
SIMULATE_TRADES = "Simulating trades on that history"
VALIDATE_SIGNALS = "Validating signals and structure"
QUALITY_REVIEW = "Quality-checking the strategy logic"
STRATEGY_REVISION = "Adjusting the rules when they were too tight to trade"
BACKTEST_DONE = "Your backtest is ready"
REFINE_STRATEGY = "Applying your requested tweaks"
FIX_STRATEGY = "Fixing what you flagged on the strategy"
UNDERSTANDING_ISSUE = "Understanding your report"
DRAFTING_FIX = "Drafting a targeted fix"
CHART_ATTACHED = "Using your chart as visual context"
ANALYZE_RESULTS = "Digging into the backtest results"
CUSTOM_ANALYSIS = "Running your custom analysis"
FETCH_PREVIEW = "Loading data for preview"


def interval_phrase(interval: str) -> str:
    """Human interval, e.g. 'daily bars', '5-minute bars'."""
    label = INTERVAL_LABELS.get(interval, interval)
    return f"{label} bars"


def format_backtest_window_label(start: str, end: str) -> str:
    """Compact human range: 'Jan 2020 – Apr 2026'."""
    try:
        s = datetime.strptime(start[:10], "%Y-%m-%d")
        e = datetime.strptime(end[:10], "%Y-%m-%d")
    except ValueError:
        return f"{start[:10]} – {end[:10]}"
    return f"{s.strftime('%b %Y')} – {e.strftime('%b %Y')}"


def detail_load_running(ticker: str, interval: str, start: str, end: str) -> str:
    return f"{ticker} · {interval_phrase(interval)} · {format_backtest_window_label(start, end)}"


def detail_data_loaded(row_count: int, ticker: str, interval: str, start: str, end: str) -> str:
    return (
        f"{row_count:,} {interval_phrase(interval)} · {ticker} · "
        f"{format_backtest_window_label(start, end)}"
    )


def detail_analysis_running() -> str:
    return "Checking fit vs. timeframe, columns, and feasibility"


def detail_analysis_success(verdict: str) -> str:
    v = (verdict or "").strip().lower()
    if v == "ok":
        return "Looks testable as written — proceeding"
    if v == "revise":
        return "We refined the brief so it matches what the data supports"
    return verdict or "Done"


def detail_analysis_skipped() -> str:
    return "Skipped — analysis step unavailable"


def detail_corporate_running(needs: list[str] | set[str]) -> str:
    kinds = ", ".join(sorted(needs)) if needs else "corporate fields"
    return f"Merging {kinds} into the series"


def detail_corporate_success() -> str:
    return "Corporate fields merged into your series"


def detail_corporate_from_session(row_count: int) -> str:
    return f"From your active session · {row_count:,} rows in range"


def detail_attempt(current: int, max_iter: int) -> str:
    return f"Pass {current} of {max_iter}"


def detail_signals(exec_count: int) -> str:
    if exec_count == 1:
        return "1 signal"
    return f"{exec_count:,} signals"


def detail_signals_and_attempts(signal_count: int, attempts: int) -> str:
    att = f"{attempts} pass" + ("es" if attempts != 1 else "")
    return f"{detail_signals(signal_count)} · {att} to lock it in"


def detail_validation_success(n_tests: int) -> str:
    return f"All {n_tests} structural checks passed"


def detail_review_auto_accept(n: int) -> str:
    return f"Accepted after {n} review rounds — execution and validation looked solid"


def detail_strategy_revision_running() -> str:
    return "Easing conditions so the strategy can actually fire"


def detail_strategy_revision_success() -> str:
    return "Retrying with the relaxed rules"


def detail_strategy_revision_blocked() -> str:
    return "Held back — change would drop earnings-related requirements you asked for"


def detail_backtest_failed_attempts(attempts: int) -> str:
    return f"Could not get a clean run in {attempts} pass(es) — see errors or try refine"


def detail_rerun_code() -> str:
    return "Reusing your saved strategy code on this slice"


def detail_chart_sent() -> str:
    return "Snapshot attached for the model"


def detail_chart_missing() -> str:
    return "No chart in view — text-only fix"


def detail_code_lines(n: int) -> str:
    return f"{n} lines of logic drafted"


def detail_review_outcome(ok: bool, preview: str) -> str:
    if ok:
        return "Passed review"
    return preview[:120] if preview else "Needs another pass"


def detail_fix_error(err_type: str, msg: str) -> str:
    return f"{err_type}: {(msg or '')[:72]}"
