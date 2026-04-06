"use client";

interface ProgressStepProps {
  step: string;
  status: string;
  detail: string;
}

export function ProgressStep({ step, status, detail }: ProgressStepProps) {
  const icon =
    status === "success" ? (
      <svg className="w-4 h-4 text-[var(--success)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ) : status === "failed" ? (
      <svg className="w-4 h-4 text-[var(--error)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    ) : (
      <svg className="w-4 h-4 text-[var(--accent)] animate-spin" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4 31.4" strokeLinecap="round" />
      </svg>
    );

  return (
    <div className="flex gap-2.5 py-1.5">
      <div className="flex-shrink-0 pt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm text-[var(--text-secondary)] leading-snug">{step}</div>
        {detail ? (
          <div className="text-xs text-[var(--text-muted)] mt-0.5 leading-relaxed">{detail}</div>
        ) : null}
      </div>
    </div>
  );
}
