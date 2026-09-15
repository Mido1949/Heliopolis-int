'use client';

interface StatusRingProps {
  /** 0–100. */
  progress: number;
  label: string;
  caption: string;
  size?: number;
}

function ringColor(progress: number): string {
  if (progress >= 80) return '#16A34A';
  if (progress >= 50) return '#F5A623';
  return '#D72B2B';
}

export default function StatusRing({ progress, label, caption, size = 120 }: StatusRingProps) {
  const clamped = Math.max(0, Math.min(100, progress));
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90" role="img" aria-label={`${clamped}% ${label}`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#E2E8F0"
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={ringColor(clamped)}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            className="transition-[stroke-dasharray] duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-extrabold text-[#0D2137]">{clamped}%</span>
          <span className="text-[10px] font-medium text-slate-400">{label}</span>
        </div>
      </div>
      <p className="text-center text-[11px] text-slate-500">{caption}</p>
    </div>
  );
}
