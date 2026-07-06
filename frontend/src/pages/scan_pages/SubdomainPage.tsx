import { useState } from 'react';
import { useScanData } from '../Userscandata';
import { LoadingCard, PageSpinner } from '../Sharedscan';
import { FaServer } from 'react-icons/fa';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100">
      <span className="text-gray-500 text-sm">{label}</span>
      <span className="text-gray-900 font-mono text-sm">{value}</span>
    </div>
  );
}

export default function SubdomainPage() {
  const { loading, scans } = useScanData();
  const [showAll, setShowAll] = useState(false);

  if (loading) return <PageSpinner />;

  const scan = scans['subdomain'];
  if (!scan || scan.status !== 'completed' || !scan.results) {
    return <LoadingCard service="Subdomain Discovery" status={scan?.status || 'queued'} />;
  }

  const data = scan.results;
  const subdomains: string[] = data.subdomains || [];
  const count = data.count || subdomains.length;
  const displaySubdomains = showAll ? subdomains : subdomains.slice(0, 30);

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm mb-8 border border-gray-200">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900">
        <FaServer className="text-purple-500" />
        Subdomains ({count})
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Summary info */}
        <div className="space-y-1">
          <InfoRow label="Total Subdomains" value={String(count)} />
          <InfoRow label="Currently Showing" value={String(displaySubdomains.length)} />
        </div>

        {/* Right: Subdomain list */}
        <div>
          {subdomains.length === 0 ? (
            <div className="text-gray-400 text-sm">No subdomains discovered</div>
          ) : (
            <>
              <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
                {displaySubdomains.map((sub: string, idx: number) => (
                  <div
                    key={idx}
                    className="bg-gray-50 px-3 py-2 rounded text-sm font-mono text-gray-700 border border-gray-100 truncate"
                  >
                    {sub}
                  </div>
                ))}
              </div>

              {subdomains.length > 30 && (
                <button
                  onClick={() => setShowAll(!showAll)}
                  className="mt-4 text-blue-600 hover:text-blue-800 text-sm font-medium"
                >
                  {showAll ? 'Show Less' : `Show All ${subdomains.length} Subdomains`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}