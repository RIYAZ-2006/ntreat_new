interface Risk_meter_Props {
  score: number;
  targetScore?: number;
}

const SEGMENTS = [
  { from: 0,  to: 30,  color: '#E24B4A' },
  { from: 30, to: 50,  color: '#EF9F27' },
  { from: 50, to: 70,  color: '#FAC775' },
  { from: 70, to: 85,  color: '#97C459' },
  { from: 85, to: 100, color: '#3B6D11' },
];

const CX = 120, CY = 124, R = 100;
const GAP = 1.5;

function scoreToAngle(s: number) {
  return Math.PI + (s / 100) * Math.PI;
}

function buildArcPath(a1: number, a2: number, rO: number, rI: number) {
  const o1 = { x: CX + rO * Math.cos(a1), y: CY + rO * Math.sin(a1) };
  const o2 = { x: CX + rO * Math.cos(a2), y: CY + rO * Math.sin(a2) };
  const i2 = { x: CX + rI * Math.cos(a2), y: CY + rI * Math.sin(a2) };
  const i1 = { x: CX + rI * Math.cos(a1), y: CY + rI * Math.sin(a1) };
  return `M${o1.x},${o1.y} A${rO},${rO} 0 0,1 ${o2.x},${o2.y} L${i2.x},${i2.y} A${rI},${rI} 0 0,0 ${i1.x},${i1.y} Z`;
}

export function getGrade(s: number) {
  if (s >= 90) return { grade: 'A', bg: '#EAF3DE', color: '#3B6D11' };
  if (s >= 80) return { grade: 'B', bg: '#E6F1FB', color: '#185FA5' };
  if (s >= 60) return { grade: 'C', bg: '#FAEEDA', color: '#854F0B' };
  if (s >= 40) return { grade: 'D', bg: '#FAECE7', color: '#993C1D' };
  return { grade: 'F', bg: '#FCEBEB', color: '#A32D2D' };
}

export function getRiskInfo(s: number): { label: string; color: string; level: 'low' | 'medium' | 'high' | 'critical' } {
  if (s >= 80) return { label: 'Low risk',      color: '#3B6D11', level: 'low' };
  if (s >= 60) return { label: 'Medium risk',   color: '#854F0B', level: 'medium' };
  if (s >= 40) return { label: 'High risk',     color: '#993C1D', level: 'high' };
  return              { label: 'Critical risk', color: '#A32D2D', level: 'critical' };
}

export default function Risk_meter({ score, targetScore = 100 }: Risk_meter_Props) {
  const outer = R;
  const inner = R - 18;

  const { grade, bg: gradeBg, color: gradeColor } = getGrade(score);
  const { label: riskLabel, color: riskColor } = getRiskInfo(score);
  const targetGrade = getGrade(targetScore);

  const needleAngle = scoreToAngle(score);
  const needleLen = inner - 6;
  const tip   = { x: CX + needleLen * Math.cos(needleAngle), y: CY + needleLen * Math.sin(needleAngle) };
  const base1 = { x: CX + 7 * Math.cos(needleAngle + Math.PI / 2), y: CY + 7 * Math.sin(needleAngle + Math.PI / 2) };
  const base2 = { x: CX + 7 * Math.cos(needleAngle - Math.PI / 2), y: CY + 7 * Math.sin(needleAngle - Math.PI / 2) };

  const TICK_SCORES = [0, 25, 50, 75, 100];
  const TICK_LABELS = ['0', '', '50', '', '100'];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm flex flex-col items-center">
      <p className="text-xs font-medium text-gray-500 self-start mb-1">Overall score</p>

      <svg width="240" height="148" viewBox="0 0 240 148" style={{ overflow: 'visible' }}>
        {SEGMENTS.map((seg) => {
          const a1 = scoreToAngle(seg.from + GAP / 2);
          const a2 = scoreToAngle(seg.to - GAP / 2);
          return (
            <path
              key={`bg-${seg.from}`}
              d={buildArcPath(a1, a2, outer, inner)}
              fill={seg.color}
              opacity={0.2}
            />
          );
        })}

        {SEGMENTS.map((seg) => {
          const filled = Math.min(score, seg.to);
          if (filled <= seg.from) return null;
          const a1 = scoreToAngle(seg.from + GAP / 2);
          const a2 = scoreToAngle(filled - GAP / 2);
          if (a2 <= a1) return null;
          return (
            <path
              key={`fill-${seg.from}`}
              d={buildArcPath(a1, a2, outer, inner)}
              fill={seg.color}
            />
          );
        })}

        {TICK_SCORES.map((ts, i) => {
          const a = scoreToAngle(ts);
          return (
            <text
              key={ts}
              x={CX + (outer + 8) * Math.cos(a)}
              y={CY + (outer + 8) * Math.sin(a) + 4}
              textAnchor="middle"
              fontSize={11}
              fill="#9ca3af"
            >
              {TICK_LABELS[i]}
            </text>
          );
        })}

        <polygon
          points={`${tip.x},${tip.y} ${base1.x},${base1.y} ${base2.x},${base2.y}`}
          fill="#1f2937"
          opacity={0.8}
        />
        <circle cx={CX} cy={CY} r={5} fill="#1f2937" />
      </svg>

      <div className="flex items-center gap-3 -mt-1">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center text-xl font-semibold flex-shrink-0"
          style={{ background: gradeBg, color: gradeColor }}
        >
          {grade}
        </div>

        <div>
          <div className="flex items-baseline gap-1">
            <span className="text-4xl font-semibold text-gray-900">{score}</span>
            <span className="text-sm text-gray-400">/100</span>
          </div>
          <div className="text-sm font-medium" style={{ color: riskColor }}>
            {riskLabel}
          </div>
        </div>

        <div className="flex items-center gap-2 ml-2 text-gray-400 text-sm">
          <svg width="28" height="14" viewBox="0 0 28 14">
            <line x1="2" y1="7" x2="22" y2="7" stroke="currentColor" strokeWidth="1.5" />
            <polyline points="16,2 24,7 16,12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <span
            className="text-xs font-medium px-2 py-0.5 rounded-full"
            style={{ background: targetGrade.bg, color: targetGrade.color }}
          >
            {targetGrade.grade} {targetScore}
          </span>
        </div>
      </div>
    </div>
  );
}