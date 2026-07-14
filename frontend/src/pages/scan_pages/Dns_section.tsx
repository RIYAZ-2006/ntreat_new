import { useScanData } from '../Userscandata';
import { LoadingCard, PageSpinner } from '../Sharedscan';
import {
  FaGlobe, FaExclamationTriangle, FaCheckCircle, FaInfoCircle,
} from 'react-icons/fa';

export default function DnsPage() {
  const { loading, scans } = useScanData();

  if (loading) return <PageSpinner />;

  const scan = scans['dns'];
  if (!scan || scan.status !== 'completed' || !scan.results) {
    return <LoadingCard service="DNS Records" status={scan?.status || 'queued'} />;
  }

  return <DNSSection data={scan.results} />;
}

function DNSSection({ data }: { data: any }) {
  const recordTypes = ['A', 'AAAA', 'MX', 'NS', 'SOA', 'PTR'];
  const warnings = data._warnings || [];
  const txtParsed = data.TXT_parsed || {};

  // verification is a nested object {google: [], microsoft: [], other: []}
  // not a flat array — flatten it here with provider labels attached
  const verificationEntries: { provider: string; record: string }[] = [];
  const verification = txtParsed.verification || {};
  (verification.google || []).forEach((r: string) => verificationEntries.push({ provider: 'Google', record: r }));
  (verification.microsoft || []).forEach((r: string) => verificationEntries.push({ provider: 'Microsoft', record: r }));
  (verification.other || []).forEach((r: string) => verificationEntries.push({ provider: 'Other', record: r }));

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm mb-8 border border-gray-200">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900">
        <FaGlobe className="text-blue-500" />
        DNS Records
      </h2>

      {warnings.length > 0 && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-2">
            <FaExclamationTriangle className="text-yellow-500 mt-0.5 flex-shrink-0" />
            <div className="space-y-1">
              {warnings.map((warning: string, idx: number) => (
                <p key={idx} className="text-sm text-amber-800">{warning}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {recordTypes.map(type => {
          const records = data[type] || [];
          if (records.length === 0) return null;
          return (
            <div key={type} className="bg-gray-50 p-4 rounded-lg border border-gray-100">
              <div className="text-sm font-semibold text-blue-700 mb-2">{type} Records</div>
              <div className="space-y-1">
                {records.map((record: string, idx: number) => (
                  <div key={idx} className="text-sm text-gray-700 font-mono break-all">{record}</div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {Object.keys(txtParsed).length > 0 && (
        <div className="border-t border-gray-200 pt-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">TXT Record Analysis</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {txtParsed.spf && txtParsed.spf.length > 0 && (
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                <div className="text-sm font-semibold text-green-700 mb-3">SPF Configuration</div>
                {txtParsed.spf.map((spf: any, idx: number) => (
                  <div key={idx} className="space-y-2">
                    {/* spf is the flat parsed dict itself — no .raw/.parsed wrapper */}
                    <div className="pl-3 border-l-2 border-green-400 space-y-1 text-xs">
                      {spf.ip4?.length > 0 && <div><span className="text-gray-500">IPv4:</span> <span className="text-gray-700">{spf.ip4.join(', ')}</span></div>}
                      {spf.ip6?.length > 0 && <div><span className="text-gray-500">IPv6:</span> <span className="text-gray-700">{spf.ip6.join(', ')}</span></div>}
                      {spf.include?.length > 0 && <div><span className="text-gray-500">Includes:</span> <span className="text-gray-700">{spf.include.join(', ')}</span></div>}
                      {spf.all && <div><span className="text-gray-500">Default:</span> <span className="text-gray-700">{spf.all}</span></div>}
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-200 space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <FaCheckCircle className="text-green-400" />
                        <span className="text-green-700">SPF record present</span>
                      </div>
                      {spf.all === '-all' && (
                        <div className="flex items-center gap-2 text-xs">
                          <FaCheckCircle className="text-green-400" />
                          <span className="text-green-700">Strict policy enforced (-all)</span>
                        </div>
                      )}
                      {spf.all === '~all' && (
                        <div className="flex items-center gap-2 text-xs">
                          <FaExclamationTriangle className="text-yellow-400" />
                          <span className="text-yellow-700">Soft fail policy (~all) — consider -all</span>
                        </div>
                      )}
                      {spf.include?.length > 2 && (
                        <div className="flex items-center gap-2 text-xs">
                          <FaInfoCircle className="text-blue-400" />
                          <span className="text-gray-700">Large authorized provider list ({spf.include.length} includes)</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {txtParsed.dmarc?.length > 0 && (
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                <div className="text-sm font-semibold text-purple-700 mb-2">DMARC Policy</div>
                {txtParsed.dmarc.map((record: string, idx: number) => (
                  <div key={idx} className="text-xs text-gray-700 font-mono break-all">{record}</div>
                ))}
              </div>
            )}

            {verificationEntries.length > 0 && (
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                <div className="text-sm font-semibold text-blue-700 mb-2">Domain Verification</div>
                {verificationEntries.map((entry, idx: number) => (
                  <div key={idx} className="mb-2">
                    <div className="text-xs font-semibold text-gray-500">{entry.provider}</div>
                    <div className="text-xs text-gray-700 font-mono break-all">{entry.record}</div>
                  </div>
                ))}
              </div>
            )}

            {txtParsed.other?.length > 0 && (
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                <div className="text-sm font-semibold text-gray-600 mb-2">Other TXT Records</div>
                {txtParsed.other.map((record: string, idx: number) => (
                  <div key={idx} className="text-xs text-gray-700 font-mono break-all mb-1">{record}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}