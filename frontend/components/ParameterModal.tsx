"use client";

import { useCallback, useEffect, useState } from "react";
import {
  applyParameterSearchSelection,
  fetchCodeVersions,
  fetchRunParameters,
  runParameterSearch,
  setVersionTag,
  type CodeVersionOption,
  type ParameterSearchRow,
  type RunParameter,
} from "@/lib/api";

export interface TickerOption {
  symbol: string;
  name: string;
  country?: "US" | "INDIA";
}

interface ParameterModalProps {
  sessionId: string;
  ticker: TickerOption;
  /** Unused when using GET-only for params; kept for API compatibility. */
  latestStrategyCode?: string;
  /** Default date range for this rerun (same as initial run). */
  defaultStartDate?: string;
  defaultEndDate?: string;
  onConfirm: (
    paramOverrides: Record<string, string>,
    versionId?: string | null,
    startDate?: string,
    endDate?: string
  ) => void;
  onCancel: () => void;
}

export function ParameterModal({
  sessionId,
  ticker,
  defaultStartDate = "",
  defaultEndDate = "",
  onConfirm,
  onCancel,
}: ParameterModalProps) {
  const [versions, setVersions] = useState<CodeVersionOption[]>([]);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [parameters, setParameters] = useState<RunParameter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);
  const [mode, setMode] = useState<"single" | "optimize">("single");
  const [rangeValues, setRangeValues] = useState<Record<string, { start: string; end: string; step: string }>>({});
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchRows, setSearchRows] = useState<ParameterSearchRow[]>([]);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [sortState, setSortState] = useState<{ key: string; direction: "asc" | "desc" }>({
    key: "total_return_pct",
    direction: "desc",
  });
  const [applyingBest, setApplyingBest] = useState(false);
  const [savedVersionId, setSavedVersionId] = useState<string | null>(null);
  const [versionName, setVersionName] = useState("");
  const [naming, setNaming] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);

  useEffect(() => {
    setStartDate(defaultStartDate);
    setEndDate(defaultEndDate);
  }, [defaultStartDate, defaultEndDate]);

  // Load code versions when modal opens
  useEffect(() => {
    let cancelled = false;
    fetchCodeVersions(sessionId)
      .then((data) => {
        if (cancelled) return;
        setVersions(data.versions || []);
        setSelectedVersionId(null);
      })
      .catch(() => {
        if (!cancelled) setVersions([{ version_id: null, label: "Latest (current)" }]);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Load parameters when version selection changes (null = latest). Use GET only so proxies/rewrites (e.g. ngrok) don't return 405; backend uses in-memory session for latest code.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchRunParameters(sessionId, selectedVersionId ?? undefined)
      .then((data) => {
        if (cancelled) return;
        const params = data.parameters || [];
        setParameters(params);
        const initial: Record<string, string> = {};
        params.forEach((p) => {
          initial[p.name] = String(p.value ?? "");
        });
        setValues(initial);
        const ranges: Record<string, { start: string; end: string; step: string }> = {};
        params.forEach((p) => {
          const raw = String(p.value ?? "").trim();
          const parsed = Number(raw);
          const isInt = /^-?\d+$/.test(raw);
          if (Number.isFinite(parsed)) {
            const step = isInt ? "1" : "0.1";
            const start = isInt ? String(Math.max(0, parsed - 2)) : String(Number((parsed * 0.8).toFixed(4)));
            const end = isInt ? String(parsed + 2) : String(Number((parsed * 1.2).toFixed(4)));
            ranges[p.name] = { start, end, step };
          } else {
            ranges[p.name] = { start: raw, end: raw, step: "1" };
          }
        });
        setRangeValues(ranges);
        setSearchRows([]);
        setSelectedRowIndex(null);
        setSearchError(null);
        setSavedVersionId(null);
        setSortState({ key: "total_return_pct", direction: "desc" });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load parameters");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId, selectedVersionId]);

  const setParam = useCallback((name: string, value: string) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  }, []);

  const handleSubmit = useCallback(() => {
    const overrides: Record<string, string> = {};
    parameters.forEach((p) => {
      const current = values[p.name];
      if (current !== undefined && String(p.value) !== current) {
        overrides[p.name] = current;
      }
    });
    onConfirm(
      overrides,
      selectedVersionId ?? undefined,
      startDate.trim() || undefined,
      endDate.trim() || undefined
    );
  }, [parameters, values, onConfirm, selectedVersionId, startDate, endDate]);

  const setRangeField = useCallback(
    (name: string, field: "start" | "end" | "step", value: string) => {
      setRangeValues((prev) => ({
        ...prev,
        [name]: {
          ...(prev[name] ?? { start: "", end: "", step: "1" }),
          [field]: value,
        },
      }));
    },
    []
  );

  const runBestSearch = useCallback(async () => {
    if (!sessionId) return;
    if (ticker.symbol === "ALL") return;
    const ranges: Record<string, { start: number; end: number; step: number }> = {};
    for (const p of parameters) {
      const cfg = rangeValues[p.name];
      if (!cfg) continue;
      const start = Number(cfg.start);
      const end = Number(cfg.end);
      const step = Number(cfg.step);
      if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(step) || step <= 0) {
        setSearchError(`Invalid range for "${p.name}". Use numeric start/end and step > 0.`);
        return;
      }
      ranges[p.name] = { start, end, step };
    }
    setSearching(true);
    setSearchError(null);
    setSearchRows([]);
    setSelectedRowIndex(null);
    setSavedVersionId(null);
    setSortState({ key: "total_return_pct", direction: "desc" });
    try {
      const data = await runParameterSearch(sessionId, {
        ticker: ticker.symbol,
        parameter_ranges: ranges,
        version_id: selectedVersionId ?? null,
        start_date: startDate.trim() || undefined,
        end_date: endDate.trim() || undefined,
        max_combinations: 200,
      });
      setSearchRows(data.rows || []);
      if (data.rows && data.rows.length > 0) {
        setSelectedRowIndex(0);
      }
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Failed to run parameter search");
    } finally {
      setSearching(false);
    }
  }, [parameters, rangeValues, selectedVersionId, sessionId, startDate, endDate, ticker.symbol]);

  const applySelectedBest = useCallback(async () => {
    if (!sessionId || ticker.symbol === "ALL" || selectedRowIndex == null) return;
    const row = searchRows[selectedRowIndex];
    if (!row) return;
    const selectedParameters: Record<string, string> = {};
    parameters.forEach((p) => {
      const v = row[p.name];
      if (v !== undefined && v !== null) selectedParameters[p.name] = String(v);
    });
    if (Object.keys(selectedParameters).length === 0) {
      setSearchError("No parameter values found in selected row.");
      return;
    }
    setApplyingBest(true);
    setSearchError(null);
    try {
      const res = await applyParameterSearchSelection(sessionId, {
        ticker: ticker.symbol,
        selected_parameters: selectedParameters,
        version_id: selectedVersionId ?? null,
        start_date: startDate.trim() || undefined,
        end_date: endDate.trim() || undefined,
      });
      setSavedVersionId(res.strategy_version_id);
      // Keep chart/session aligned in chat stream as well.
      onConfirm(
        selectedParameters,
        selectedVersionId ?? undefined,
        startDate.trim() || undefined,
        endDate.trim() || undefined
      );
    } catch (e) {
      setSearchError(e instanceof Error ? e.message : "Failed to apply selected parameters");
    } finally {
      setApplyingBest(false);
    }
  }, [parameters, searchRows, selectedRowIndex, selectedVersionId, sessionId, startDate, endDate, ticker.symbol, onConfirm]);

  const saveVersionName = useCallback(async () => {
    if (!sessionId || !savedVersionId) return;
    const name = versionName.trim();
    if (!name) {
      setNameError("Please enter a version name.");
      return;
    }
    setNaming(true);
    setNameError(null);
    try {
      await setVersionTag(sessionId, savedVersionId, name);
      onCancel();
    } catch (e) {
      setNameError(e instanceof Error ? e.message : "Failed to save version name");
    } finally {
      setNaming(false);
    }
  }, [onCancel, savedVersionId, sessionId, versionName]);

  const toggleSort = useCallback((key: string) => {
    setSortState((prev) => {
      if (prev.key === key) {
        return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      }
      return { key, direction: "asc" };
    });
  }, []);

  const sortableColumns = [
    ...parameters.map((p) => p.name),
    "win_rate_pct",
    "total_return_pct",
    "max_loss_pct",
    "profit_factor",
    "risk_reward",
    "success",
    "error",
  ];

  const sortedRows = [...searchRows].sort((a, b) => {
    const key = sortState.key;
    if (!sortableColumns.includes(key)) return 0;
    const av = a[key];
    const bv = b[key];
    const dir = sortState.direction === "asc" ? 1 : -1;
    const aNil = av === null || av === undefined || av === "";
    const bNil = bv === null || bv === undefined || bv === "";
    if (aNil && bNil) return 0;
    if (aNil) return 1;
    if (bNil) return -1;
    const an = Number(av);
    const bn = Number(bv);
    const aNum = Number.isFinite(an);
    const bNum = Number.isFinite(bn);
    if (aNum && bNum) {
      return an === bn ? 0 : an > bn ? dir : -dir;
    }
    const as = String(av).toLowerCase();
    const bs = String(bv).toLowerCase();
    if (as === bs) return 0;
    return as > bs ? dir : -dir;
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="param-modal-title"
    >
      <div className="w-full max-w-md rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--border)]">
          <h2 id="param-modal-title" className="text-base font-semibold text-[var(--text-primary)]">
            Run strategy on {ticker.symbol === "ALL" ? ticker.name : ticker.symbol}
          </h2>
          <p className="text-xs text-[var(--text-muted)] mt-0.5 truncate" title={ticker.name}>
            {ticker.country === "INDIA" ? "(INDIA) " : "(US) "}
            {ticker.name}
          </p>
        </div>

        <div className="px-5 py-4 max-h-80 overflow-y-auto">
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="rerun-start-date"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
              >
                Start date
              </label>
              <input
                id="rerun-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div>
              <label
                htmlFor="rerun-end-date"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5"
              >
                End date
              </label>
              <input
                id="rerun-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>
          {versions.length > 1 && (
            <div className="mb-4">
              <label htmlFor="code-version" className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
                Code version
              </label>
              <select
                id="code-version"
                value={selectedVersionId ?? ""}
                onChange={(e) => setSelectedVersionId(e.target.value === "" ? null : e.target.value)}
                className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
              >
                {versions.map((v) => (
                  <option key={v.version_id ?? "latest"} value={v.version_id ?? ""}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          )}
          {ticker.symbol !== "ALL" && (
            <div className="mb-4">
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">Mode</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setMode("single")}
                  className={`px-2.5 py-1.5 rounded-md text-xs border ${
                    mode === "single"
                      ? "border-[var(--accent)] text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--text-secondary)]"
                  }`}
                >
                  Single run
                </button>
                <button
                  type="button"
                  onClick={() => setMode("optimize")}
                  className={`px-2.5 py-1.5 rounded-md text-xs border ${
                    mode === "optimize"
                      ? "border-[var(--accent)] text-[var(--accent)]"
                      : "border-[var(--border)] text-[var(--text-secondary)]"
                  }`}
                >
                  Best parameter search
                </button>
              </div>
            </div>
          )}
          {loading && (
            <p className="text-sm text-[var(--text-muted)]">Loading parameters…</p>
          )}
          {error && (
            <p className="text-sm text-[var(--error)]">{error}</p>
          )}
          {!loading && !error && parameters.length === 0 && (
            <p className="text-sm text-[var(--text-muted)]">
              No tunable parameters. Click OK to run with default settings.
            </p>
          )}
          {!loading && !error && parameters.length > 0 && mode === "single" && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--text-muted)] mb-2">
                Edit values to override defaults for this run.
              </p>
              {parameters.map((p) => (
                <div key={p.name} className="flex flex-col gap-1">
                  <label
                    htmlFor={`param-${p.name}`}
                    className="text-xs font-medium text-[var(--text-secondary)]"
                  >
                    {p.name}
                    {p.description && (
                      <span className="font-normal text-[var(--text-muted)] ml-1">
                        — {p.description}
                      </span>
                    )}
                  </label>
                  <input
                    id={`param-${p.name}`}
                    type="text"
                    value={values[p.name] ?? ""}
                    onChange={(e) => setParam(p.name, e.target.value)}
                    className="w-full bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                    placeholder={String(p.value)}
                  />
                </div>
              ))}
            </div>
          )}
          {!loading && !error && parameters.length > 0 && mode === "optimize" && (
            <div className="space-y-3">
              <p className="text-xs text-[var(--text-muted)]">
                Set start/end/step for each parameter, run combinations, then pick the best row.
              </p>
              {parameters.map((p) => (
                <div key={`range-${p.name}`} className="space-y-1">
                  <label className="text-xs font-medium text-[var(--text-secondary)]">{p.name}</label>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={rangeValues[p.name]?.start ?? ""}
                      onChange={(e) => setRangeField(p.name, "start", e.target.value)}
                      placeholder="Start"
                      className="bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                    />
                    <input
                      type="text"
                      value={rangeValues[p.name]?.end ?? ""}
                      onChange={(e) => setRangeField(p.name, "end", e.target.value)}
                      placeholder="End"
                      className="bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                    />
                    <input
                      type="text"
                      value={rangeValues[p.name]?.step ?? ""}
                      onChange={(e) => setRangeField(p.name, "step", e.target.value)}
                      placeholder="Step"
                      className="bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={runBestSearch}
                  disabled={searching}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--accent)] text-white disabled:opacity-60"
                >
                  {searching ? "Searching..." : "Run search"}
                </button>
                <span className="text-xs text-[var(--text-muted)]">Max 200 combinations</span>
              </div>
              {searchError && <p className="text-xs text-[var(--error)]">{searchError}</p>}
              {searchRows.length > 0 && (
                <div className="border border-[var(--border)] rounded-lg overflow-auto max-h-44">
                  <table className="w-full text-xs">
                    <thead className="bg-[var(--bg-tertiary)]">
                      <tr>
                        <th className="px-2 py-1 text-left">Pick</th>
                        {parameters.map((p) => (
                          <th key={`h-${p.name}`} className="px-2 py-1 text-left">
                            <button type="button" onClick={() => toggleSort(p.name)} className="hover:underline">
                              {p.name}{sortState.key === p.name ? (sortState.direction === "asc" ? " ↑" : " ↓") : ""}
                            </button>
                          </th>
                        ))}
                        <th className="px-2 py-1 text-left">
                          <button type="button" onClick={() => toggleSort("win_rate_pct")} className="hover:underline">
                            Win %{sortState.key === "win_rate_pct" ? (sortState.direction === "asc" ? " ↑" : " ↓") : ""}
                          </button>
                        </th>
                        <th className="px-2 py-1 text-left">
                          <button type="button" onClick={() => toggleSort("total_return_pct")} className="hover:underline">
                            Profit %{sortState.key === "total_return_pct" ? (sortState.direction === "asc" ? " ↑" : " ↓") : ""}
                          </button>
                        </th>
                        <th className="px-2 py-1 text-left">
                          <button type="button" onClick={() => toggleSort("max_loss_pct")} className="hover:underline">
                            Drawdown %{sortState.key === "max_loss_pct" ? (sortState.direction === "asc" ? " ↑" : " ↓") : ""}
                          </button>
                        </th>
                        <th className="px-2 py-1 text-left">
                          <button type="button" onClick={() => toggleSort("profit_factor")} className="hover:underline">
                            Profit factor{sortState.key === "profit_factor" ? (sortState.direction === "asc" ? " ↑" : " ↓") : ""}
                          </button>
                        </th>
                        <th className="px-2 py-1 text-left">
                          <button type="button" onClick={() => toggleSort("risk_reward")} className="hover:underline">
                            Risk/Reward{sortState.key === "risk_reward" ? (sortState.direction === "asc" ? " ↑" : " ↓") : ""}
                          </button>
                        </th>
                        <th className="px-2 py-1 text-left">
                          <button type="button" onClick={() => toggleSort("success")} className="hover:underline">
                            Success{sortState.key === "success" ? (sortState.direction === "asc" ? " ↑" : " ↓") : ""}
                          </button>
                        </th>
                        <th className="px-2 py-1 text-left">
                          <button type="button" onClick={() => toggleSort("error")} className="hover:underline">
                            Error{sortState.key === "error" ? (sortState.direction === "asc" ? " ↑" : " ↓") : ""}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedRows.map((row, idx) => (
                        <tr key={`row-${idx}`} className="border-t border-[var(--border)]">
                          <td className="px-2 py-1">
                            <input
                              type="radio"
                              checked={selectedRowIndex != null && searchRows[selectedRowIndex] === row}
                              onChange={() => {
                                const originalIndex = searchRows.findIndex((r) => r === row);
                                setSelectedRowIndex(originalIndex >= 0 ? originalIndex : null);
                              }}
                            />
                          </td>
                          {parameters.map((p) => <td key={`c-${idx}-${p.name}`} className="px-2 py-1">{String(row[p.name] ?? "")}</td>)}
                          <td className="px-2 py-1">{row.win_rate_pct == null ? "-" : Number(row.win_rate_pct).toFixed(2)}</td>
                          <td className="px-2 py-1">{row.total_return_pct == null ? "-" : Number(row.total_return_pct).toFixed(2)}</td>
                          <td className="px-2 py-1">{row.max_loss_pct == null ? "-" : Number(row.max_loss_pct).toFixed(2)}</td>
                          <td className="px-2 py-1">{row.profit_factor == null ? "-" : Number(row.profit_factor).toFixed(2)}</td>
                          <td className="px-2 py-1">{row.risk_reward == null ? "-" : Number(row.risk_reward).toFixed(2)}</td>
                          <td className="px-2 py-1">{row.success ? "Yes" : "No"}</td>
                          <td className="px-2 py-1">{String(row.error ?? "-")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {searchRows.length > 0 && (
                <button
                  type="button"
                  onClick={applySelectedBest}
                  disabled={selectedRowIndex == null || applyingBest}
                  className="px-3 py-1.5 rounded-md text-xs font-medium border border-[var(--border)] text-[var(--text-primary)] disabled:opacity-60"
                >
                  {applyingBest ? "Applying..." : "Use selected row"}
                </button>
              )}
              {savedVersionId && (
                <div className="mt-2 p-2 rounded-md border border-amber-500/40 bg-amber-500/10">
                  <p className="text-xs text-[var(--text-secondary)] mb-1">Name this new optimized version:</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={versionName}
                      onChange={(e) => {
                        setVersionName(e.target.value);
                        setNameError(null);
                      }}
                      placeholder="e.g. RSI tuned v2"
                      className="flex-1 bg-[var(--bg-tertiary)] border border-[var(--border)] rounded-lg px-2 py-1.5 text-xs text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]"
                    />
                    <button
                      type="button"
                      onClick={saveVersionName}
                      disabled={naming || !versionName.trim()}
                      className="px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--accent)] text-white disabled:opacity-60"
                    >
                      {naming ? "Saving..." : "Save"}
                    </button>
                  </div>
                  {nameError && <p className="text-xs text-[var(--error)] mt-1">{nameError}</p>}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-[var(--border)] flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={mode === "optimize"}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] transition-colors"
          >
            {mode === "optimize" ? "Use selected row above" : "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}
