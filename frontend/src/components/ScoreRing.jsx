import { useEffect, useState } from 'react';

const RISK_COLORS = {
  LOW: '#16A34A',
  MEDIUM: '#FF6B00',
  HIGH: '#DC2626',
};

export default function ScoreRing({ score, riskLevel, recommendation }) {
  const [displayScore, setDisplayScore] = useState(0);
  const radius = 88;
  const circumference = 2 * Math.PI * radius;
  const color = RISK_COLORS[riskLevel] || '#FF6B00';

  useEffect(() => {
    let frame;
    const duration = 1100;
    const start = performance.now();
    const animate = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplayScore(Math.round(eased * score));
      if (progress < 1) frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [score]);

  const offset = circumference - (displayScore / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-56 w-56">
        <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
          <circle cx="100" cy="100" r={radius} fill="none" stroke="#E8E1DB" strokeWidth="14" />
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: 'stroke 0.3s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-5xl font-bold tabular-nums">{displayScore}</span>
          <span className="text-xs uppercase tracking-wide text-fv-muted">/ 100</span>
        </div>
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-widest text-fv-muted">Evidence Integrity</p>
      <div
        className="mt-3 rounded-full px-5 py-1.5 text-sm font-bold uppercase tracking-wide text-white"
        style={{ backgroundColor: color }}
      >
        {recommendation}
      </div>
      <p className="mt-1 text-xs font-medium uppercase tracking-wide" style={{ color }}>
        {riskLevel} Risk
      </p>
    </div>
  );
}
