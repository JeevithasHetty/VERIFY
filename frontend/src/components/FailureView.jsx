import { AlertOctagon } from 'lucide-react';

export default function FailureView({ processingId, error, attempts, onRetry, retrying }) {
  return (
    <div className="mx-auto max-w-lg animate-fadeIn rounded-2xl border border-fv-border bg-fv-white p-8 text-center shadow-sm">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-fv-orange">
        <AlertOctagon size={26} />
      </div>
      <h2 className="font-display text-xl font-semibold">Verification could not be completed</h2>
      <p className="mt-2 text-sm text-fv-muted">{error?.message || 'An unexpected error occurred during processing.'}</p>

      <div className="mt-5 space-y-2 rounded-lg border border-fv-border bg-fv-bg px-4 py-3 text-left text-sm">
        <div className="flex justify-between">
          <span className="text-fv-muted">Processing ID</span>
          <span className="font-mono">{processingId}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-fv-muted">Attempts</span>
          <span className="font-mono">{attempts}</span>
        </div>
      </div>

      <button
        onClick={onRetry}
        disabled={retrying}
        className="mt-6 w-full rounded-full bg-fv-orange py-3 text-sm font-semibold text-white shadow-sm shadow-orange-200 transition-transform hover:scale-[1.01] active:scale-95 disabled:opacity-60"
      >
        {retrying ? 'Retrying…' : 'Retry verification'}
      </button>
    </div>
  );
}
