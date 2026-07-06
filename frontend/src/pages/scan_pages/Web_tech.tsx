import { useScanData } from '../Userscandata';
import { LoadingCard, PageSpinner } from '../Sharedscan';
import { FaCode, FaInfoCircle } from 'react-icons/fa';

export default function WebtechPage() {
  const { loading, scans } = useScanData();

  if (loading) return <PageSpinner />;

  const scan = scans['webtech'];
  if (!scan || scan.status !== 'completed' || !scan.results) {
    return <LoadingCard service="Web Technology Detection" status={scan?.status || 'queued'} />;
  }

  return <WebTechSection data={scan.results} />;
}

function WebTechSection({ data }: { data: any }) {
  const techs = data.technologies || [];
  const coverage = data.coverage;
  const cdnDetected = data.cdn_detected;
  const cdnName = data.cdn_name;
  const note = data.note;

  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 80) return 'bg-green-600';
    if (confidence >= 60) return 'bg-yellow-600';
    return 'bg-orange-600';
  };

  const grouped = techs.reduce((acc: any, tech: any) => {
    if (!acc[tech.category]) acc[tech.category] = [];
    acc[tech.category].push(tech);
    return acc;
  }, {});

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm mb-8 border border-gray-200">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900">
        <FaCode className="text-cyan-500" />
        Web Technologies Detected ({data.count || 0})
      </h2>

      {(cdnDetected || coverage === 'minimal' || coverage === 'low-confidence') && note && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-2">
            <FaInfoCircle className="text-blue-400 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-sm font-semibold text-blue-700 mb-1">
                {cdnDetected ? `CDN Detected: ${cdnName}` : 'Limited Detection'}
              </div>
              <div className="text-xs text-gray-700">{note}</div>
              {coverage === 'minimal' && (
                <div className="mt-2 text-xs text-gray-500">
                  <div className="font-semibold mb-1">Possible reasons:</div>
                  <ul className="list-disc list-inside space-y-0.5 ml-2">
                    <li>Server headers suppressed</li>
                    <li>Client-side rendering (SPA)</li>
                    <li>Edge/proxy hiding origin stack</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {techs.length === 0 ? (
        <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg">
          <div className="flex items-start gap-3 mb-4">
            <FaInfoCircle className="text-blue-400 text-2xl flex-shrink-0 mt-1" />
            <div>
              <div className="text-xl font-semibold text-blue-700 mb-2">No Technologies Exposed</div>
              <div className="text-gray-600 mb-3"><strong>Reason:</strong></div>
              <ul className="list-disc list-inside space-y-1 text-gray-600 ml-2">
                {cdnDetected && <li>Target is behind {cdnName} or edge proxy</li>}
                <li>Server headers suppressed or minimized</li>
                <li>Client-side rendering detected (minimal HTML shell)</li>
                <li>Strict CSP preventing inline clues</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-blue-200 pt-4">
            <div className="text-sm font-semibold text-blue-700 mb-2">Recommendation:</div>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-500 ml-2">
              <li>Scan origin server IP directly (if accessible)</li>
              <li>Enable authenticated scanning for detailed analysis</li>
              <li>Review other security metrics for comprehensive assessment</li>
            </ul>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(grouped).map(([category, items]: [string, any]) => (
            <div key={category} className="bg-gray-50 p-4 rounded-lg border border-gray-100">
              <div className="text-sm font-semibold text-cyan-700 mb-3">{category}</div>
              <div className="space-y-3">
                {items.map((tech: any, idx: number) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-900 font-medium">
                        {tech.name}
                        {tech.version && <span className="text-gray-400 text-sm ml-2">v{tech.version}</span>}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs text-white ${getConfidenceBadge(tech.confidence)}`}>
                        {tech.confidence}%
                      </span>
                    </div>
                    {tech.evidence?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {tech.evidence.slice(0, 3).map((ev: any, i: number) => (
                          <span key={i} className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded" title={ev.value}>
                            {ev.type}
                          </span>
                        ))}
                        {tech.evidence.length > 3 && (
                          <span className="text-xs text-gray-400">+{tech.evidence.length - 3} more</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}