import { useScanData } from '../Userscandata';
import { LoadingCard, PageSpinner } from '../Sharedscan';
import { FaShieldAlt, FaInfoCircle, FaCheckCircle, FaExclamationTriangle } from 'react-icons/fa';

function InfoRow({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
      <span className="text-gray-500 text-sm">{label}</span>
      <span className="text-gray-900 font-mono text-sm">
        {value !== null && value !== undefined && value !== '' ? value : '—'}
      </span>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const styles =
    severity === 'CRITICAL'
      ? 'bg-red-100 text-red-700 border border-red-300'
      : severity === 'HIGH'
      ? 'bg-orange-100 text-orange-700 border border-orange-300'
      : severity === 'MEDIUM'
      ? 'bg-yellow-100 text-yellow-700 border border-yellow-300'
      : 'bg-blue-100 text-blue-700 border border-blue-300';

  return <span className={`px-3 py-1 rounded text-xs font-bold ${styles}`}>{severity}</span>;
}

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const styles =
    confidence === 'high'
      ? 'bg-green-100 text-green-700 border border-green-300'
      : 'bg-orange-100 text-orange-700 border border-orange-300';

  return <span className={`px-2 py-1 rounded text-xs font-semibold ${styles}`}>{confidence} confidence</span>;
}

function parseVulnDescription(description: string) {
  const parts = description.split(/(?:\n|\s{2,})?\*\s+|•\s+/).filter(Boolean);
  const intro = parts[0]?.trim() || '';
  const bullets = parts.slice(1).map((b: string) => b.trim());
  return { intro, bullets };
}

export default function CvePage() {
  const { loading, scans } = useScanData();

  if (loading) return <PageSpinner />;

  const scan = scans['cve'];
  if (!scan || scan.status !== 'completed' || !scan.results) {
    return <LoadingCard service="CVE Vulnerability Scan" status={scan?.status || 'queued'} />;
  }

  const data = scan.results;
  const ports = data.ports_scanned || [];
  const vulns = data.cve_scan || [];
  const versionFingerprints = data.version_fingerprints || [];
  const isApplicable = data.scan_applicable !== false;
  const skipReason = data.skip_reason;
  const cdnDetected = data.cdn_detected || false;
  const cdnName = data.cdn_name;

  // Summary stats
  const summary = data.vulnerability_summary || { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
  const totalVulns = data.total_vulnerabilities ?? vulns.length;

  // Check if we have meaningful version information
  const hasUsefulVersionInfo = versionFingerprints.some(
    (fp: any) => fp.version && fp.version !== '' && fp.version !== 'unknown'
  );

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm mb-8 border border-gray-200">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900">
        <FaShieldAlt className="text-red-500" />
        CVE Vulnerability Scan
        {totalVulns > 0 && (
          <span className="ml-2 px-3 py-1 rounded text-sm font-semibold bg-red-100 text-red-700 border border-red-300">
            {totalVulns} vulnerability{totalVulns !== 1 ? 'ies' : ''}
          </span>
        )}
      </h2>

      {/* CDN / Skip Warning */}
      {(cdnDetected || skipReason) && (
        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm">
          <div className="flex gap-2 text-amber-700">
            <FaExclamationTriangle className="flex-shrink-0 mt-0.5" />
            <div>
              <strong>Notice:</strong>{' '}
              {skipReason || `Target is behind ${cdnName} proxy. Results may be limited.`}
            </div>
          </div>
        </div>
      )}

      {!isApplicable ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Skip Reason */}
          <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg space-y-4">
            <div className="flex items-start gap-3">
              <FaInfoCircle className="text-blue-500 text-2xl flex-shrink-0 mt-1" />
              <div className="w-full">
                <div className="text-lg font-semibold text-blue-700 mb-2">Scan Skipped / Limited</div>
                <div className="text-gray-600 text-sm mb-3 font-medium">Reason</div>
                <ul className="list-disc list-inside space-y-1 text-gray-600 text-sm ml-1">
                  {cdnDetected && <li>Target is behind {cdnName} proxy</li>}
                  {!versionFingerprints.length && (
                    <>
                      <li>Unable to detect service versions or product names</li>
                      <li>CVE correlation cannot be performed reliably</li>
                    </>
                  )}
                  {skipReason && <li>{skipReason}</li>}
                </ul>
              </div>
            </div>

            <div className="border-t border-blue-200 pt-4">
              <div className="text-sm font-semibold text-blue-700 mb-2">What was still checked</div>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 ml-1">
                <li>TLS/SSL configuration</li>
                <li>DNS records &amp; attack surface</li>
                <li>HTTP security headers</li>
                <li>Web technology fingerprinting</li>
              </ul>
            </div>
          </div>

          {/* Detected Services */}
          <div>
            <h3 className="text-lg font-semibold mb-3 text-gray-900">Detected Services</h3>
            {ports.length === 0 ? (
              <div className="text-gray-400 text-sm italic">No open services detected</div>
            ) : (
              <div className="space-y-1 bg-gray-50 p-4 rounded border">
                {ports.map((port: any, idx: number) => (
                  <InfoRow
                    key={idx}
                    label={`Port ${port.port} · ${port.service || 'unknown'}`}
                    value={port.version ? `${port.version}` : 'version unknown'}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Version Fingerprints */}
          {versionFingerprints.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-3 text-gray-900">Service Fingerprints</h3>
              <div className="space-y-3">
                {versionFingerprints.map((fp: any, idx: number) => (
                  <div key={idx} className="bg-gray-50 p-4 rounded border border-gray-100">
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-mono font-bold text-gray-900">Port {fp.port}</span>
                      <ConfidenceBadge confidence={fp.confidence || 'low'} />
                    </div>
                    <div className="text-sm">
                      <span className="font-medium text-gray-700">
                        {fp.product || fp.service || 'Unknown Service'}
                      </span>
                      {fp.version && fp.version !== 'unknown' ? (
                        <span className="text-gray-500 font-mono ml-2">v{fp.version}</span>
                      ) : (
                        <span className="text-amber-600 text-xs ml-2">(version unknown)</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vulnerabilities */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold text-gray-900">Vulnerabilities</h3>
              {totalVulns > 0 && (
                <div className="flex gap-2 text-xs">
                  {summary.CRITICAL > 0 && (
                    <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded">CRITICAL: {summary.CRITICAL}</span>
                  )}
                  {summary.HIGH > 0 && (
                    <span className="bg-orange-100 text-orange-700 px-2 py-0.5 rounded">HIGH: {summary.HIGH}</span>
                  )}
                </div>
              )}
            </div>

            {vulns.length === 0 ? (
              <div className="bg-green-50 border border-green-200 p-8 rounded-lg text-center">
                <FaCheckCircle className="text-green-500 text-4xl mx-auto mb-3" />

                {!hasUsefulVersionInfo ? (
                  <>
                    <div className="text-amber-700 font-medium text-lg mb-2">
                      Version / Product Not Detected
                    </div>
                    <p className="text-amber-600 text-sm">
                      No service versions were identified. CVE analysis could not be performed.
                    </p>
                    <p className="text-xs text-gray-500 mt-3">
                      Most services show only port numbers without version information.
                    </p>
                  </>
                ) : (
                  <>
                    <div className="text-green-700 font-medium">No known vulnerabilities detected</div>
                    <p className="text-green-600 text-sm mt-1">All detected services appear clean</p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-4 max-h-[650px] overflow-y-auto pr-2">
                {vulns.map((vuln: any, idx: number) => {
                  const product = vuln.matched_product || 'Unknown';
                  const version = vuln.matched_version || 'Unknown';
                  const { intro, bullets } = parseVulnDescription(vuln.description || '');

                  return (
                    <div key={idx} className="bg-red-50 border border-red-200 p-5 rounded-lg">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="font-semibold text-red-700">{vuln.id}</div>
                          <div className="text-xs text-gray-500 mt-0.5">
                            {product} {version !== 'Unknown' ? `v${version}` : '(version unknown)'}
                          </div>
                        </div>
                        <SeverityBadge severity={vuln.severity || 'UNKNOWN'} />
                      </div>

                      <div className="text-sm text-gray-700 mb-4 leading-relaxed">
                        {intro && <p className="mb-3">{intro}</p>}
                        {bullets.length > 0 && (
                          <ul className="list-disc pl-5 space-y-1.5 text-gray-600">
                            {bullets.map((b: string, i: number) => (
                              <li key={i}>{b}</li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-x-6 text-xs border-t border-red-100 pt-3">
                        <InfoRow label="CVSS" value={vuln.cvss_score} />
                        <InfoRow label="Published" value={vuln.published_date?.split('T')[0] || '—'} />
                      </div>

                      {vuln.references?.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-red-100 text-xs">
                          <a
                            href={vuln.references[0]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline inline-flex items-center gap-1"
                          >
                            View Advisory →
                          </a>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}