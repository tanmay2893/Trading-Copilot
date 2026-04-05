"""Output validation: structural + semantic checks on signals DataFrame."""

from __future__ import annotations

from dataclasses import dataclass

import pandas as pd

from backtester.harness.test_suite import TestResult, run_tests


@dataclass
class ValidationResult:
    valid: bool
    issues: list[str]
    test_results: list[TestResult]


def validate_output(
    signals_df: pd.DataFrame,
    data_df: pd.DataFrame,
    strategy_description: str | None = None,
    corporate_needs: set | None = None,
    strategy_code: str | None = None,
) -> ValidationResult:
    """Run the pre-built test suite and return a structured result."""
    test_results = run_tests(
        signals_df,
        data_df,
        strategy_description=strategy_description,
        corporate_needs=corporate_needs,
        strategy_code=strategy_code,
    )
    issues = [t.message for t in test_results if not t.passed]
    return ValidationResult(
        valid=len(issues) == 0,
        issues=issues,
        test_results=test_results,
    )
