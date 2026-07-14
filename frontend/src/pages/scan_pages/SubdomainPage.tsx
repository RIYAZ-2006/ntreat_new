import { useState } from 'react';
import { useScanData } from '../Userscandata';
import { LoadingCard, PageSpinner } from '../Sharedscan';
import { FaServer, FaExclamationTriangle } from 'react-icons/fa';

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
  const wildcardDns = data.wildcard_dns || false;
  const danglingCnames: { subdomain: string; cname: string }[] = data.dangling_cnames || [];
  const displaySubdomains = showAll ? subdomains : subdomains.slice(0, 30);

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm mb-8 border border-gray-200">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900">
        <FaServer className="text-purple-500" />
        Subdomains ({count})
      </h2>

      {danglingCnames.length > 0 && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-2 mb-2">
            <FaExclamationTriangle className="text-red-500 mt-0.5 flex-shrink-0" />
            <div className="font-semibold text-red-700">
              Possible Subdomain Takeover Risk ({danglingCnames.length})
            </div>
          </div>
          <div className="space-y-1 pl-6">
            {danglingCnames.map((d, idx) => (
              <div key={idx} className="text-xs text-red-600 font-mono">
                {d.subdomain} → {d.cname} <span className="text-red-400">(target does not resolve)</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {wildcardDns && (
        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
          Wildcard DNS detected — any subdomain resolves, which can mask real subdomain enumeration results.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-1">
          <InfoRow label="Total Subdomains" value={String(count)} />
          <InfoRow label="Currently Showing" value={String(displaySubdomains.length)} />
          <InfoRow label="Wildcard DNS" value={wildcardDns ? 'Detected' : 'Not detected'} />
        </div>

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