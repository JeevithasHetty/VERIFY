import { useCallback, useRef, useState } from 'react';
import { UploadCloud, CheckCircle2, ImageIcon, X } from 'lucide-react';

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadArea({ onStartVerification }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [dropped, setDropped] = useState(false);
  const inputRef = useRef(null);

  const handleFile = useCallback((selected) => {
    if (!selected) return;
    setFile(selected);
    setPreview(URL.createObjectURL(selected));
    setDropped(true);
    setTimeout(() => setDropped(false), 900);
  }, []);

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) handleFile(dropped);
  };

  const clearFile = () => {
    setFile(null);
    setPreview(null);
  };

  return (
    <div className="w-full animate-slideUp" style={{ animationDelay: '450ms' }}>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
        onClick={() => !file && inputRef.current?.click()}
        className={`group relative flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-fv-white p-10 text-center shadow-sm transition-all duration-300 ${
          dragActive ? 'scale-[1.01] border-fv-orange bg-orange-50' : 'border-fv-border hover:border-fv-orange-2'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />

        {!file && (
          <>
            <div
              className={`mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-50 text-fv-orange transition-transform duration-300 ${
                dragActive ? '-translate-y-1' : 'group-hover:-translate-y-1'
              }`}
            >
              <UploadCloud size={28} />
            </div>
            <p className="font-display text-xl font-medium text-fv-text">
              {dragActive ? 'Drop image to verify' : 'Upload vehicle image'}
            </p>
            <p className="mt-2 max-w-sm text-sm text-fv-muted">
              Drag and drop a field photograph here, or click to browse your device.
            </p>
            <p className="mt-4 text-xs uppercase tracking-wide text-fv-muted">JPEG / PNG / WEBP · Up to 10 MB</p>
          </>
        )}

        {file && (
          <div className="flex w-full max-w-md flex-col items-center animate-scaleIn">
            <div className="relative mb-4 h-40 w-full overflow-hidden rounded-xl border border-fv-border bg-fv-bg">
              <img src={preview} alt="Selected upload preview" className="h-full w-full object-cover" />
              {dropped && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <CheckCircle2 className="animate-scaleIn text-white" size={44} />
                </div>
              )}
            </div>
            <div className="flex w-full items-center justify-between rounded-lg border border-fv-border bg-fv-bg px-4 py-3 text-sm">
              <div className="flex items-center gap-2 truncate">
                <ImageIcon size={16} className="shrink-0 text-fv-orange" />
                <span className="truncate font-medium">{file.name}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-fv-muted">{formatBytes(file.size)}</span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    clearFile();
                  }}
                  className="text-fv-muted transition-colors hover:text-fv-text"
                  aria-label="Remove file"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onStartVerification(file);
              }}
              className="mt-5 w-full rounded-full bg-fv-orange py-3 text-sm font-semibold text-white shadow-sm shadow-orange-200 transition-transform hover:scale-[1.01] active:scale-95"
            >
              Start Verification
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
