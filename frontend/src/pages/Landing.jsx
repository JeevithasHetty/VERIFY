import { useState } from 'react';
import UploadArea from '../components/UploadArea.jsx';
import ProcessingView from '../components/ProcessingView.jsx';
import ResultScreen from '../components/ResultScreen.jsx';
import FailureView from '../components/FailureView.jsx';
import { uploadImage, getResults, retryImage } from '../services/api.js';
import { useProcessingStatus } from '../hooks/useProcessingStatus.js';

export default function Landing() {
  const [processingId, setProcessingId] = useState(null);
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [resultError, setResultError] = useState(null);
  const [retrying, setRetrying] = useState(false);

  const { status, elapsedMs } = useProcessingStatus(processingId);

  const handleStart = async (file) => {
    setPreview(URL.createObjectURL(file));
    setResult(null);
    setResultError(null);
    try {
      const data = await uploadImage(file);
      setProcessingId(data.processingId);
    } catch (err) {
      setResultError({ message: err.response?.data?.error?.message || err.message });
    }
  };

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await retryImage(processingId);
      setResult(null);
    } catch (err) {
      // surfaced via status polling
    } finally {
      setRetrying(false);
    }
  };

  // Once status flips to completed, fetch the full structured results.
  if (status?.status === 'completed' && !result && processingId) {
    getResults(processingId).then(setResult).catch((err) => setResultError({ message: err.message }));
  }

  const showUpload = !processingId;
  const showProcessing = processingId && status && status.status !== 'completed' && status.status !== 'failed';
  const showResult = status?.status === 'completed' && result;
  const showFailure = status?.status === 'failed';

  return (
    <div className="mx-auto max-w-6xl px-6 py-16">
      {showUpload && (
        <div className="mx-auto max-w-2xl text-center">
          <p className="animate-fadeIn font-mono text-xs uppercase tracking-[0.2em] text-fv-orange">
            Intelligent Vehicle Evidence Verification
          </p>
          <h1
            className="mt-4 animate-slideUp font-display text-4xl font-semibold leading-tight tracking-tight sm:text-5xl"
            style={{ animationDelay: '120ms' }}
          >
            Verify every field image before it becomes evidence.
          </h1>
          <p className="mx-auto mt-5 max-w-lg animate-fadeIn text-fv-muted" style={{ animationDelay: '280ms' }}>
            Automatically check vehicle photographs for quality, registration details, duplicates and
            suspicious evidence signals.
          </p>

          <div className="mt-10">
            <UploadArea onStartVerification={handleStart} />
          </div>

          {resultError && (
            <p className="mt-4 text-sm text-red-600">{resultError.message}</p>
          )}

          <div id="how-it-works" className="mt-20 grid grid-cols-1 gap-6 text-left sm:grid-cols-3">
            {[
              { step: 'Upload', copy: 'Submit a field photograph through the API or this dashboard.' },
              { step: 'Analyze', copy: 'A background worker runs quality, OCR, duplicate and integrity checks.' },
              { step: 'Decide', copy: 'Get an explainable Evidence Integrity Score and recommendation.' },
            ].map((item, i) => (
              <div
                key={item.step}
                className="animate-slideUp rounded-xl border border-fv-border bg-fv-white p-5"
                style={{ animationDelay: `${500 + i * 120}ms` }}
              >
                <p className="text-sm font-semibold text-fv-orange">{item.step}</p>
                <p className="mt-1 text-sm text-fv-muted">{item.copy}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {showProcessing && (
        <ProcessingView processingId={processingId} preview={preview} status={status} elapsedMs={elapsedMs} />
      )}

      {showFailure && (
        <FailureView
          processingId={processingId}
          error={status?.error}
          attempts={status?.attempts}
          onRetry={handleRetry}
          retrying={retrying}
        />
      )}

      {showResult && (
        <ResultScreen processingId={processingId} preview={preview} result={result} status={status} />
      )}
    </div>
  );
}
