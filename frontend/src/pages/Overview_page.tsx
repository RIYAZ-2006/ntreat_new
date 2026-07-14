import { useScanContext } from './ScanContext';
import Overview_score from '../components/Overview_score';
import {
  FaExclamationTriangle, FaCheckCircle, FaSpinner, FaClock, FaTimes, FaTag, FaGlobe
} from 'react-icons/fa';

export default function Overview_page() {
  const { summary, loading, scans } = useScanContext();

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <FaCheckCircle className="text-green-400" />;
      case 'failed':    return <FaTimes className="text-red-400" />;
      case 'processing': return <FaSpinner className="text-yellow-400 animate-spin" />;
      default:          return <FaClock className="text-gray-500" />;
    }
  };

  // Matches backend's FAST_SERVICES / SLOW_SERVICES exactly.
  // "subdomain" is deliberately not here -- it's a scan-level step, not
  // tracked per-domain in summary.scans (see scoring_service/app.py).
  const fastServices = ['dns', 'ip', 'ssl', 'webtech'];
  const slowServices = ['subdirectory', 'cve', 'http_security'];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <FaSpinner className="text-4xl animate-spin text-blue-500" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <FaExclamationTriangle className="text-4xl text-yellow-500 mx-auto mb-4" />
          <p>No scan data found.</p>
        </div>
      </div>
    );
  }

  const score = summary.score;
  const domain = summary.domain;
  const domain_name = summary.domain_name;

  const fastServices_data = summary.fast_services || { completed: 0, total: 4 };
  const slowServices_data = summary.slow_services || { completed: 0, total: 3 };
  const allFastServicesComplete = fastServices_data.completed === fastServices_data.total;

  if (!allFastServicesComplete || Object.keys(scans).length === 0) {
    const progress = (fastServices_data.completed / fastServices_data.total) * 100;

    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="bg-white p-12 rounded-xl shadow-md max-w-2xl w-full border border-gray-200">
          <div className="text-center mb-8">
            <FaSpinner className="text-6xl text-blue-500 animate-spin mx-auto mb-6" />
            <h2 className="text-3xl font-bold mb-2 text-gray-900">
              Scanning {domain_name ?? domain}
            </h2>
            {domain_name && <p className="text-gray-400 font-mono text-sm">{domain}</p>}
            <p className="text-gray-500 text-sm mt-1">Running initial security checks...</p>
          </div>

          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-semibold text-gray-700">Quick Scans</span>
              <span className="text-sm text-gray-500">
                {fastServices_data.completed} / {fastServices_data.total} complete
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className="bg-gradient-to-r from-blue-500 to-green-500 h-3 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6">
            {fastServices.map(service => {
              const scan = scans[service];
              const status = scan?.status || 'queued';
              return (
                <div key={service} className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                  <div className="flex items-center justify-between">
                    <span className="text-sm capitalize font-medium">
                      {service === 'webtech' ? 'Web Tech' : service}
                    </span>
                    {status === 'completed' ? <FaCheckCircle className="text-green-400" /> :
                     status === 'processing' ? <FaSpinner className="text-yellow-400 animate-spin" /> :
                     status === 'failed'    ? <FaTimes className="text-red-400" /> :
                                              <FaClock className="text-gray-500" />}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-center text-sm text-gray-500">
            <p>In-depth scans (Subdirectory, CVE, HTTP Security) will run in the background</p>
            <p className="mt-1">You'll see results as they complete</p>
          </div>
        </div>
      </div>
    );
  }

  // Prefer reading directly from service_scores (already computed, robust
  // to any future change in penalty naming) rather than reconstructing a
  // qualitative label from flattened/prefixed penalty keys.
  const serviceScores = score?.service_scores || {};

  const qualitativeFromScore = (svcScore: number | undefined) => {
    if (svcScore === undefined) return 'Unavailable';
    if (svcScore >= 90) return 'Strong';
    if (svcScore >= 70) return 'Adequate';
    if (svcScore >= 50) return 'Weak';
    return 'Poor';
  };

  const cvePenaltyTotal =
    (score?.penalties?.cve_critical_cves || 0) +
    (score?.penalties?.cve_high_cves || 0) +
    (score?.penalties?.cve_medium_cves || 0) +
    (score?.penalties?.cve_low_cves || 0);

  return (
    <div className="space-y-6">
      {domain_name ? (
        <>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            <FaTag className="text-blue-400 text-2xl" />
            {domain_name}
          </h1>
          <p className="text-gray-500 font-mono flex items-center gap-2">
            <FaGlobe className="text-blue-500" />
            {domain}
          </p>
        </>
      ) : (
        <>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Domain Name
          </h1>
          <p className="text-gray-500 font-mono flex items-center gap-2">
            <FaGlobe className="text-blue-500" />
            {domain}
          </p>
        </>
      )}

      <p className="text-sm text-gray-400 mt-2">
        Security Assessment Results
      </p>

      {score && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm flex items-center gap-6">
            <div>
              <p className="text-sm text-gray-500">Grade</p>
              <p className="text-5xl font-bold text-blue-600">{score.grade}</p>
            </div>
            <div className="h-16 w-px bg-gray-200" />
            <div>
              <p className="text-sm text-gray-500">Score</p>
              <p className="text-5xl font-bold text-gray-900">{score.score}</p>
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Score Breakdown</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-600">TLS Configuration</span>
                <span className="font-semibold">{qualitativeFromScore(serviceScores.ssl?.score)}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-600">DNS Security</span>
                <span className="font-semibold">{qualitativeFromScore(serviceScores.dns?.score)}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-600">HTTP Security</span>
                <span className="font-semibold">{qualitativeFromScore(serviceScores.http_security?.score)}</span>
              </div>
              <div className="flex justify-between border-b pb-2">
                <span className="text-gray-600">Directory Exposure</span>
                <span className="font-semibold">{(() => {
                  const s = scans.subdirectory?.results?.status_counts?.['200'] || 0;
                  return s === 0 ? 'Redirects Only' : s <= 3 ? 'Low Risk' : 'Moderate Risk';
                })()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Vulnerabilities</span>
                <span className="font-semibold">{
                  cvePenaltyTotal === 0 ? 'None Detected'
                  : cvePenaltyTotal <= 10 ? 'Low Severity'
                  : cvePenaltyTotal <= 20 ? 'Moderate'
                  : 'High Severity'
                }</span>
              </div>
            </div>
          </div>
        </div>
      )}

      <div>
        <h3 className="text-sm font-semibold text-gray-600 mb-2 flex items-center gap-2">
          <FaCheckCircle className="text-green-500" />
          Fast Scans ({fastServices_data.completed}/{fastServices_data.total} complete)
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          {fastServices.map(service => {
            const scan = scans[service];
            return (
              <div key={service} className="bg-white p-4 rounded-lg text-center border border-gray-200 shadow-sm">
                <div className="flex justify-center mb-2">
                  {scan ? getStatusIcon(scan.status) : <FaClock className="text-gray-600" />}
                </div>
                <div className="text-sm font-semibold capitalize">
                  {service === 'webtech' ? 'Web Tech' : service}
                </div>
              </div>
            );
          })}
        </div>

        <h3 className="text-sm font-semibold text-gray-600 mb-2 flex items-center gap-2">
          <FaClock className="text-yellow-500" />
          Slow Scans ({slowServices_data.completed}/{slowServices_data.total} complete)
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {slowServices.map(service => {
            const scan = scans[service];
            return (
              <div key={service} className="bg-white p-4 rounded-lg text-center border border-gray-200 shadow-sm">
                <div className="flex justify-center mb-2">
                  {scan ? getStatusIcon(scan.status) : <FaClock className="text-gray-600" />}
                </div>
                <div className="text-sm font-semibold capitalize">
                  {service === 'http_security' ? 'HTTP Security' : service}
                </div>
                {scan?.status === 'processing' && (
                  <div className="text-xs text-gray-400 mt-1">May take 5–20 min</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <Overview_score
        score={
          Object.values(scans).every(s => s?.status === 'completed')
            ? score
            : null
        }
        findingsCount={
          Object.values(scans).every(s => s?.status === 'completed')
            ? (score?.penalties
                ? Object.values(score.penalties as Record<string, number>).filter(v => v > 0).length
                : 0)
            : 0
        }
      />
    </div>
  );
}