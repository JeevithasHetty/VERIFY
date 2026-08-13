import { CheckCircle2, Loader2 } from 'lucide-react';

const STAGES = [
  { key: 'quality', label: '01 IMAGE QUALITY', stages: ['quality_analysis_started', 'quality_analysis_completed'] },
  { key: 'ocr', label: '02 TEXT & PLATE', stages: ['ocr_started', 'ocr_completed'] },
  { key: 'duplicate', label: '03 DUPLICATE CHECK', stages: ['duplicate_check_started', 'duplicate_check_completed'] },
  { key: 'integrity', label: '04 INTEGRITY', stages: ['integrity_analysis_started', 'integrity_analysis_completed'] },
  { key: 'final', label: '05 FINAL VERIFICATION', stages: ['result_generated', 'completed'] },
];

function stageState(index, currentBackendStage, status) {
  if (status === 'completed') return 'VERIFIED';
  if (status === 'pending') return index === 0 ? 'WAITING' : 'WAITING';

  const stageOrder = ['quality_analysis', 'ocr', 'duplicate_check', 'integrity_analysis', 'result_generated'];
  const currentIndex = stageOrder.findIndex((s) => currentBackendStage?.startsWith(s));

  if (currentIndex === -1) return index === 0 ? 'CHECKING' : 'WAITING';
  if (index < currentIndex) return 'VERIFIED';
  if (index === currentIndex) return 'CHECKING';
  return 'WAITING';
}

function formatElapsed(ms) {
  const seconds = Math.floor(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m > 0 ? `${m}m ` : ''}${s}s`;
}

export default function ProcessingView({ processingId, preview, status, elapsedMs }) {
  const backendStatus = status?.status || 'pending';
  const currentStage = status?.currentStage;

  return (
    <div className="mx-auto max-w-4xl animate-fadeIn">
      <div className="mb-8 flex flex-col items-center text-center">
        <p className="font-mono text-xs uppercase tracking-widest text-fv-orange">{processingId}</p>
        <h2 className="mt-2 font-display text-2xl font-semibold">
          {backendStatus === 'processing' ? 'Verifying evidence…' : 'Preparing verification…'}
        </h2>
        <p className="mt-1 text-sm text-fv-muted">Elapsed: {formatElapsed(elapsedMs)}</p>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-[280px_1fr]">
        <div className="relative mx-auto h-64 w-64 overflow-hidden rounded-2xl border border-fv-border bg-fv-white shadow-sm md:mx-0 md:h-full">
          {preview && <img src={preview} alt="Uploaded evidence" className="h-full w-full object-cover" />}
          {backendStatus === 'processing' && (
            <div className="pointer-events-none absolute inset-0 overflow-hidden">
              <div className="absolute left-0 right-0 h-16 bg-gradient-to-b from-transparent via-fv-orange/20 to-transparent animate-scanLine" />
            </div>
          )}
        </div>

        <div className="space-y-3">
          {STAGES.map((stage, i) => {
            const state = stageState(i, currentStage, backendStatus);
            return (
              <div
                key={stage.key}
                className="flex items-center justify-between rounded-xl border border-fv-border bg-fv-white px-5 py-4 transition-colors"
              >
                <span
                  className={`font-mono text-xs font-semibold tracking-wide ${
                    state === 'WAITING' ? 'text-fv-muted' : 'text-fv-text'
                  }`}
                >
                  {stage.label}
                </span>

                <span className="flex items-center gap-2 text-xs font-medium">
                  {state === 'WAITING' && <span className="text-fv-muted">Waiting</span>}
                  {state === 'CHECKING' && (
                    <span className="flex items-center gap-1.5 text-fv-orange">
                      <Loader2 size={14} className="animate-spin" />
                      Checking
                    </span>
                  )}
                  {state === 'VERIFIED' && (
                    <span className="flex items-center gap-1.5 text-green-600">
                      <CheckCircle2 size={14} className="animate-scaleIn" />
                      Verified
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
