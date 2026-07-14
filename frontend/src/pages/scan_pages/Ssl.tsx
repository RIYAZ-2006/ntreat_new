import { useScanData } from '../Userscandata';
import { LoadingCard, PageSpinner } from '../Sharedscan';
import {
  FaLock, FaCheckCircle, FaTimes, FaExclamationTriangle,
} from 'react-icons/fa';

export default function SslPage() {
  const { loading, scans } = useScanData();

  if (loading) return <PageSpinner />;

  const scan = scans['ssl'];
  if (!scan || scan.status !== 'completed' || !scan.results) {
    return <LoadingCard service="SSL / TLS Analysis" status={scan?.status || 'queued'} />;
  }

  return <SSLSection data={scan.results} />;
}

function SSLSection({ data }: { data: any }) {
  const sslScans = data.ssl_scan || [];
  const ocsp = data.ocsp || {};
  const certificate = data.certificate || {};
  const hsts = data.hsts || {};
  const cipherAnalysis = data.cipher_analysis || {};

  const getExpiryColor = (days: number) => {
    if (days < 0) return 'text-red-500';
    if (days < 30) return 'text-yellow-500';
    return 'text-green-500';
  };

  const certUnreachable = !!certificate.error;
  const certVerificationFailed = !!certificate.verification_error;
  const hasCertData = certificate.valid_until && !certUnreachable;

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm mb-8 border border-gray-200">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900">
        <FaLock className="text-green-500" />
        SSL / TLS Analysis
      </h2>

      {certUnreachable && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-2">
            <FaExclamationTriangle className="text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-red-700 mb-1">Certificate Could Not Be Retrieved</div>
              <div className="text-sm text-red-600">{certificate.error}</div>
            </div>
          </div>
        </div>
      )}

      {certVerificationFailed && (
        <div className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
          <div className="flex items-start gap-2">
            <FaExclamationTriangle className="text-orange-500 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-orange-700 mb-1">Certificate Failed Verification</div>
              <div className="text-sm text-orange-600">{certificate.verification_error}</div>
              <div className="text-xs text-gray-500 mt-1">Likely self-signed, expired, or hostname mismatch.</div>
            </div>
          </div>
        </div>
      )}

      {hasCertData && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
            <div className="text-sm font-semibold text-blue-700 mb-3">Certificate Info</div>
            <div className="space-y-2 text-sm">
              <div><span className="text-gray-500">Subject:</span><span className="ml-2 text-gray-800 font-mono">{certificate.subject || 'N/A'}</span></div>
              <div><span className="text-gray-500">Issuer:</span><span className="ml-2 text-gray-800 font-mono">{certificate.issuer || 'N/A'}</span></div>
              <div>
                <span className="text-gray-500">Expires:</span>
                <span className={`ml-2 font-semibold ${getExpiryColor(certificate.days_remaining ?? 999)}`}>
                  {certificate.valid_until ? new Date(certificate.valid_until).toLocaleDateString() : 'N/A'}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Days Remaining:</span>
                <span className={`ml-2 font-bold text-lg ${getExpiryColor(certificate.days_remaining ?? 999)}`}>{certificate.days_remaining}</span>
              </div>
              {certificate.verified === false && (
                <div className="flex items-center gap-2 text-xs text-orange-600 pt-1">
                  <FaExclamationTriangle /> Retrieved without verification
                </div>
              )}
            </div>
          </div>

          <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
            <div className="text-sm font-semibold text-purple-700 mb-3">Security Features</div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {hsts.enabled ? <FaCheckCircle className="text-green-500" /> : <FaTimes className="text-red-400" />}
                <span className="text-sm">HSTS {hsts.enabled ? 'Enabled' : 'Not Enabled'}</span>
              </div>
              {hsts.enabled && hsts.max_age && (
                <div className="text-xs text-gray-400 pl-6">Max-Age: {hsts.max_age} seconds</div>
              )}
              {cipherAnalysis.tls_versions && (
                <div className="flex items-center gap-2">
                  {cipherAnalysis.tls_versions.includes('TLSv1.3')
                    ? <FaCheckCircle className="text-green-500" />
                    : <FaExclamationTriangle className="text-yellow-400" />}
                  <span className="text-sm">
                    TLS 1.3 {cipherAnalysis.tls_versions.includes('TLSv1.3') ? 'Supported' : 'Not Supported'}
                  </span>
                </div>
              )}
              {cipherAnalysis.tls_versions?.length > 0 && (
                <div className="text-xs text-gray-400 pl-6">Versions: {cipherAnalysis.tls_versions.join(', ')}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {cipherAnalysis.weak_ciphers?.length > 0 && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-2">
            <FaExclamationTriangle className="text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-red-700 mb-2">Weak Ciphers Detected ({cipherAnalysis.weak_ciphers.length})</div>
              <div className="text-xs text-red-600 space-y-1">
                {cipherAnalysis.weak_ciphers.slice(0, 5).map((cipher: any, idx: number) => (
                  <div key={idx} className="font-mono">
                    {typeof cipher === 'string' ? cipher : `${cipher.cipher} (${cipher.version}, ${cipher.bits} bits)`}
                  </div>
                ))}
                {cipherAnalysis.weak_ciphers.length > 5 && (
                  <div className="text-gray-500">…and {cipherAnalysis.weak_ciphers.length - 5} more</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {ocsp.status && !ocsp.skip && (
        <div className={`p-4 rounded-lg mb-4 ${
          ocsp.status === 'good' ? 'bg-green-50 border border-green-200' :
          ocsp.status === 'revoked' ? 'bg-red-50 border border-red-200' :
          'bg-gray-50 border border-gray-200'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            {ocsp.status === 'good'
              ? <FaCheckCircle className="text-green-500" />
              : <FaExclamationTriangle className="text-yellow-400" />}
            <span className="font-semibold">OCSP Status: {ocsp.status.toUpperCase()}</span>
          </div>
          <div className="text-sm text-gray-600">{ocsp.message}</div>
          {ocsp.ocsp_url && <div className="text-xs text-gray-400 mt-1">OCSP URL: {ocsp.ocsp_url}</div>}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="p-3 text-left text-gray-600 font-semibold">Status</th>
              <th className="p-3 text-left text-gray-600 font-semibold">SSL Version</th>
              <th className="p-3 text-left text-gray-600 font-semibold">Cipher</th>
              <th className="p-3 text-left text-gray-600 font-semibold">Bits</th>
            </tr>
          </thead>
          <tbody>
            {sslScans.slice(0, 20).map((cipher: any, idx: number) => (
              <tr key={idx} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="p-3">
                  <span className={`px-2 py-1 rounded text-xs text-white ${cipher.status === 'preferred' ? 'bg-green-600' : 'bg-blue-600'}`}>
                    {cipher.status}
                  </span>
                </td>
                <td className="p-3 font-mono">{cipher.sslversion}</td>
                <td className="p-3 font-mono text-xs">{cipher.cipher}</td>
                <td className="p-3">{cipher.bits} bit</td>
              </tr>
            ))}
          </tbody>
        </table>
        {sslScans.length > 20 && (
          <div className="text-center text-gray-400 text-sm mt-4">
            Showing 20 of {sslScans.length} cipher suites
          </div>
        )}
      </div>
    </div>
  );
}