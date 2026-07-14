import { useState } from 'react';
import { useScanData } from '../Userscandata';
import { LoadingCard, PageSpinner } from '../Sharedscan';
import { FaFolder, FaInfoCircle, FaExclamationTriangle } from 'react-icons/fa';

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100">
      <span className="text-gray-500 text-sm">{label}</span>
      <span className="text-gray-900 font-mono text-sm">{value}</span>
    </div>
  );
}

function StatusCodeBadge({ statusCode }: { statusCode: string }) {
  const styles = statusCode.startsWith('2')
    ? 'bg-green-100 text-green-700 border border-green-300'
    : statusCode.startsWith('3')
    ? 'bg-blue-100 text-blue-700 border border-blue-300'
    : 'bg-yellow-100 text-yellow-700 border border-yellow-300';

  return <span className={`px-2 py-1 rounded text-xs font-semibold ${styles}`}>{statusCode}</span>;
}

export default function SubdirectoryPage() {
  const { loading, scans } = useScanData();
  const [showAllPaths, setShowAllPaths] = useState(false);

  if (loading) return <PageSpinner />;

  const scan = scans['subdirectory'];
  if (!scan || scan.status !== 'completed' || !scan.results) {
    return <LoadingCard service="Directory Enumeration" status={scan?.status || 'queued'} />;
  }

  const data = scan.results;
  const paths = data.found_paths || [];
  const directoryListings: string[] = data.directory_listings || [];
  const totalTested = data.total_tested || 0;
  const statusCounts = data.status_counts || {};
  const phaseReached = data.phase_reached || 1;
  const wordlistsUsed = data.wordlists_used || [];
  const aggressiveMode = data.aggressive_mode || false;

  const displayPaths = showAllPaths ? paths : paths.slice(0, 15);
  const hasMore = paths.length > 15;

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm mb-8 border border-gray-200">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900">
        <FaFolder className="text-yellow-500" />
        Directory Scan Results
      </h2>

      {directoryListings.length > 0 && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-2">
            <FaExclamationTriangle className="text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-red-700 mb-1">
                Directory Listing Enabled ({directoryListings.length})
              </div>
              <div className="space-y-1">
                {directoryListings.map((path, idx) => (
                  <div key={idx} className="text-xs text-red-600 font-mono">{path}</div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          {wordlistsUsed.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3 text-gray-900">Scan Phases</h3>
              <div className="space-y-1">
                {wordlistsUsed.map((wl: any, idx: number) => (
                  <InfoRow
                    key={idx}
                    label={`Phase ${wl.phase}: ${wl.name}`}
                    value={`${wl.entries.toLocaleString()} paths`}
                  />
                ))}
                <InfoRow label="Phase Reached" value={`Phase ${phaseReached}`} />
                <InfoRow label="Mode" value={aggressiveMode ? 'Aggressive' : 'Standard'} />
              </div>
              {phaseReached === 1 && totalTested > 0 && (
                <p className="text-xs text-gray-400 mt-2">
                  No valid directories found in Phase 1 - Phase 2 skipped
                </p>
              )}
            </div>
          )}

          {totalTested > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3 text-gray-900">Scan Statistics</h3>
              <div className="space-y-1">
                <InfoRow label="Paths Tested" value={totalTested.toLocaleString()} />
                <InfoRow label="200 OK" value={String(statusCounts['200'] || 0)} />
                <InfoRow label="403 Forbidden" value={String(statusCounts['403'] || 0)} />
                <InfoRow
                  label="Redirects (301/302)"
                  value={String((statusCounts['301'] || 0) + (statusCounts['302'] || 0))}
                />
                <InfoRow label="404 Not Found" value={String(statusCounts['404'] || 0)} />
              </div>
            </div>
          )}
        </div>

        <div>
          <h3 className="text-lg font-semibold mb-3 text-gray-900">
            {paths.length === 0
              ? 'Accessible Directories'
              : `Found Paths (${paths.length})`}
          </h3>

          {paths.length === 0 ? (
            <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg text-center">
              <FaInfoCircle className="text-blue-500 text-3xl mx-auto mb-3" />
              <div className="text-base font-semibold text-blue-700 mb-2">
                No Publicly Accessible Directories Found
              </div>
              <div className="text-sm text-gray-500">
                {totalTested > 0 ? (
                  <>All {totalTested.toLocaleString()} tested paths returned 403/404 responses (filtered by server)</>
                ) : (
                  <>This is expected for well-configured production sites</>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
                {displayPaths.map((path: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded border border-gray-100"
                  >
                    <span className="font-mono text-sm text-gray-700 truncate mr-2">{path.path}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <StatusCodeBadge statusCode={path.status_code} />
                      <span className="text-xs text-gray-400">{path.size || 'N/A'}</span>
                    </div>
                  </div>
                ))}
              </div>

              {hasMore && (
                <button
                  onClick={() => setShowAllPaths(!showAllPaths)}
                  className="mt-4 w-full py-2 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded transition text-sm font-medium"
                >
                  {showAllPaths ? 'Show Less' : `+${paths.length - 15} more paths (expand)`}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}