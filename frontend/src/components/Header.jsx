import { ShieldCheck } from 'lucide-react';

export default function Header({ view, onNavigate }) {
  return (
    <header className="sticky top-0 z-30 border-b border-fv-border bg-fv-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 animate-fadeIn">
        <button
          onClick={() => onNavigate('landing')}
          className="flex items-center gap-2 text-lg font-display font-semibold tracking-tight"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-fv-orange text-white">
            <ShieldCheck size={18} strokeWidth={2.5} />
          </span>
          FIELDVERIFY
        </button>

        <nav className="hidden items-center gap-8 text-sm font-medium text-fv-muted md:flex">
          <button
            onClick={() => onNavigate('landing')}
            className={`transition-colors hover:text-fv-text ${view === 'landing' ? 'text-fv-orange' : ''}`}
          >
            Overview
          </button>
          <a href="#how-it-works" className="transition-colors hover:text-fv-text">
            How It Works
          </a>
          <button
            onClick={() => onNavigate('batch')}
            className={`transition-colors hover:text-fv-text ${view === 'batch' ? 'text-fv-orange' : ''}`}
          >
            Verification
          </button>
        </nav>

        <button
          onClick={() => onNavigate('landing')}
          className="rounded-full bg-fv-orange px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-orange-200 transition-transform hover:scale-[1.03] active:scale-95"
        >
          Upload Evidence
        </button>
      </div>
    </header>
  );
}
