import { AlertTriangle, AlertOctagon, Info } from 'lucide-react';

const SEVERITY_STYLES = {
  high: { icon: AlertOctagon, color: 'text-red-600', bg: 'bg-red-50' },
  medium: { icon: AlertTriangle, color: 'text-fv-orange', bg: 'bg-orange-50' },
  low: { icon: Info, color: 'text-fv-muted', bg: 'bg-fv-bg' },
};

export default function IssuesFound({ issues }) {
  if (!issues || issues.length === 0) {
    return (
      <div className="rounded-xl border border-fv-border bg-fv-white p-5 text-sm text-fv-muted">
        No issues were raised for this image.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {issues.map((issue, i) => {
        const style = SEVERITY_STYLES[issue.severity] || SEVERITY_STYLES.low;
        const Icon = style.icon;
        return (
          <div
            key={`${issue.type}-${i}`}
            className={`animate-slideUp rounded-xl border border-fv-border p-4 ${style.bg}`}
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex items-start gap-3">
              <Icon size={18} className={`mt-0.5 shrink-0 ${style.color}`} />
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-xs font-semibold tracking-wide">{issue.type}</p>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${style.color}`}>
                    {issue.severity}
                  </span>
                  <span className="text-[10px] text-fv-muted">
                    confidence {Math.round((issue.confidence || 0) * 100)}%
                  </span>
                </div>
                <p className="mt-1 text-sm">{issue.message}</p>
                {issue.recommendedAction && (
                  <p className="mt-1 text-xs text-fv-muted">
                    <span className="font-semibold">Recommended action:</span> {issue.recommendedAction}
                  </p>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
