import Risk_meter , { getGrade, getRiskInfo } from './Risk_meter';

interface ScoreData {
  score: number;
  grade: string;
  findings?: number;
}

interface Overview_score_Props {
  score: ScoreData | null;
  findingsCount?: number;
}

export default function Overview_score({ score, findingsCount = 0 }: Overview_score_Props) {
  const s = score?.score ?? 0;
  const { label: riskLabel, color: riskColor } = getRiskInfo(s);
  const { grade, bg: gradeBg, color: gradeColor } = getGrade(s);

  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Risk_meter score={s} targetScore={100} />

      <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
        <h2 className="text-xl font-semibold mb-6">Overall Risk Summary</h2>

        <div className="grid md:grid-cols-3 gap-6">
          <div>
            <div className="text-gray-500 text-sm mb-1">Risk Level</div>
            <div className="text-2xl font-bold" style={{ color: riskColor }}>
              {riskLabel.replace(' risk', '').replace(' Risk', '')}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">risk level</div>
          </div>

          <div>
            <div className="text-gray-500 text-sm mb-1">Security Grade</div>
            <div className="flex items-center gap-2">
              <span
                className="w-10 h-10 rounded-lg flex items-center justify-center text-xl font-semibold"
                style={{ background: gradeBg, color: gradeColor }}
              >
                {grade}
              </span>
              <span className="text-2xl font-bold text-gray-900">{s}</span>
            </div>
          </div>

          <div>
            <div className="text-gray-500 text-sm mb-1">Findings</div>
            <div className={`text-2xl font-bold ${findingsCount > 0 ? 'text-red-500' : 'text-green-600'}`}>
              {findingsCount}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {findingsCount === 0 ? 'no issues found' : findingsCount === 1 ? 'issue found' : 'issues found'}
            </div>
          </div>
        </div>

        {s > 0 && s < 100 && (
          <div className="mt-6 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between text-sm text-gray-500 mb-1.5">
              <span>Score progress</span>
              <span className="font-medium text-gray-700">{s} / 100</span>
            </div>
            <div className="w-full bg-gray-100 rounded-full h-2">
              <div
                className="h-2 rounded-full transition-all duration-500"
                style={{
                  width: `${s}%`,
                  backgroundColor: riskColor,
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}