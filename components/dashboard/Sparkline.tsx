'use client';

interface SparklineProps {
  /** Oldest → newest. Fewer than 2 points renders nothing. */
  points: number[];
  color: string;
  width?: number;
  height?: number;
}

/**
 * Tiny trend line drawn as a raw SVG polyline — recharts is far too heavy for a
 * decoration this small, and these render four-to-a-row above the fold.
 */
export default function Sparkline({ points, color, width = 120, height = 34 }: SparklineProps) {
  if (points.length < 2) return <div style={{ height }} />;

  const max = Math.max(...points);
  const min = Math.min(...points);
  // A flat series would divide by zero — draw it down the middle instead.
  const span = max - min || 1;
  const stepX = width / (points.length - 1);
  const pad = 3;

  const coords = points.map((value, i) => {
    const x = i * stepX;
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      className="overflow-visible"
    >
      <polyline
        points={coords.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
