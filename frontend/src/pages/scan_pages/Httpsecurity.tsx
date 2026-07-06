import { useScanData } from '../Userscandata';
import { LoadingCard, PageSpinner } from '../Sharedscan';
import {
  FaShieldAlt, FaExclamationTriangle, FaCheckCircle, FaTimesCircle,
  FaInfoCircle, FaLock, FaCookie, FaGlobe, FaFileAlt, FaSignInAlt,
} from 'react-icons/fa';


function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    pass:     'bg-green-100 text-green-700 border border-green-200',
    low:      'bg-blue-100 text-blue-700 border border-blue-200',
    medium:   'bg-yellow-100 text-yellow-700 border border-yellow-200',
    high:     'bg-orange-100 text-orange-700 border border-orange-200',
    critical: 'bg-red-100 text-red-700 border border-red-200',
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${styles[severity] ?? styles.medium}`}>
      {severity}
    </span>
  );
}

function SeverityIcon({ severity }: { severity: string }) {
  if (severity === 'pass') return <FaCheckCircle className="text-green-400 flex-shrink-0" />;
  if (severity === 'low')  return <FaInfoCircle   className="text-blue-400 flex-shrink-0" />;
  if (severity === 'medium') return <FaExclamationTriangle className="text-yellow-400 flex-shrink-0" />;
  return <FaTimesCircle className="text-red-400 flex-shrink-0" />;
}

// ── sub-sections ──────────────────────────────────────────────────────────────

function SecurityHeadersCard({ headers }: { headers: Record<string, any> }) {
  const entries = Object.entries(headers);
  const missing = entries.filter(([, v]) => !v.present).length;

  return (
    <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
      <div className="flex items-center justify-between mb-3">
        <div className="text-sm font-semibold text-blue-700 flex items-center gap-1.5">
          <FaShieldAlt /> Security Headers
        </div>
        {missing > 0 && (
          <span className="text-xs text-orange-600 font-medium">{missing} missing</span>
        )}
      </div>
      <div className="space-y-2">
        {entries.map(([name, info]) => (
          <div key={name} className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <SeverityIcon severity={info.severity} />
              <span className="text-xs font-mono text-gray-700 truncate">{name}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {info.value && (
                <span className="text-xs text-gray-400 font-mono max-w-[120px] truncate hidden lg:block" title={info.value}>
                  {info.value}
                </span>
              )}
              <SeverityBadge severity={info.severity} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CookiesCard({ cookies }: { cookies: any[] }) {
  if (!cookies || cookies.length === 0) {
    return (
      <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
        <div className="text-sm font-semibold text-purple-700 flex items-center gap-1.5 mb-2">
          <FaCookie /> Cookies
        </div>
        <p className="text-xs text-gray-400 italic">No cookies detected.</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
      <div className="text-sm font-semibold text-purple-700 flex items-center gap-1.5 mb-3">
        <FaCookie /> Cookies
        <span className="ml-auto text-xs text-gray-400 font-normal">{cookies.length} cookie{cookies.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="space-y-3">
        {cookies.map((cookie, idx) => (
          <div key={idx} className="border border-gray-200 rounded-md p-3 bg-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-800 font-mono">{cookie.name}</span>
              <SeverityBadge severity={cookie.severity} />
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              <FlagPill label="HttpOnly" active={cookie.httponly} />
              <FlagPill label="Secure" active={cookie.secure} />
              <FlagPill label={`SameSite=${cookie.samesite ?? 'none'}`} active={!!cookie.samesite} />
            </div>
            {cookie.issues?.length > 0 && (
              <div className="space-y-1 mt-1">
                {cookie.issues.map((issue: any, iIdx: number) => (
                  <div key={iIdx} className="flex items-center gap-1.5 text-xs text-orange-700">
                    <FaExclamationTriangle className="text-orange-400 flex-shrink-0" />
                    {issue.flag}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function FlagPill({ label, active }: { label: string; active: boolean }) {
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
      active
        ? 'bg-green-50 text-green-700 border-green-200'
        : 'bg-red-50 text-red-600 border-red-200'
    }`}>
      {active ? '✓' : '✗'} {label}
    </span>
  );
}

function CorsCard({ cors }: { cors: any }) {
  return (
    <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
      <div className="text-sm font-semibold text-teal-700 flex items-center gap-1.5 mb-3">
        <FaGlobe /> CORS Policy
      </div>
      <div className="space-y-1.5 mb-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Allow-Origin</span>
          <span className="font-mono text-gray-700 max-w-[180px] truncate text-right">
            {cors.access_control_allow_origin ?? <em className="text-gray-400">not set</em>}
          </span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Credentials</span>
          <span className="font-mono text-gray-700">{cors.credentials_allowed ?? <em className="text-gray-400">not set</em>}</span>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-gray-500">Overall</span>
          <SeverityBadge severity={cors.severity} />
        </div>
      </div>
      {cors.issues?.length > 0 && (
        <div className="border-t border-gray-200 pt-2 space-y-1.5">
          {cors.issues.map((issue: any, idx: number) => (
            <div key={idx} className="flex items-start gap-1.5 text-xs">
              <SeverityIcon severity={issue.severity} />
              <span className="text-gray-700">{issue.issue}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InfoDisclosureCard({ info }: { info: Record<string, any> }) {
  const entries = Object.entries(info);
  return (
    <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
      <div className="text-sm font-semibold text-orange-700 flex items-center gap-1.5 mb-3">
        <FaInfoCircle /> Info Disclosure
      </div>
      {entries.length === 0 ? (
        <div className="flex items-center gap-1.5 text-xs text-green-700">
          <FaCheckCircle className="text-green-400" /> No sensitive headers exposed
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map(([header, info]) => (
            <div key={header} className="border border-gray-200 rounded-md p-2 bg-white">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-gray-700 font-mono">{header}</span>
                <SeverityBadge severity={info.severity} />
              </div>
              <div className="text-xs text-gray-500 font-mono break-all">{info.value}</div>
              {info.version_exposed && (
                <div className="flex items-center gap-1 text-xs text-orange-600 mt-1">
                  <FaExclamationTriangle className="text-orange-400" /> Version number exposed
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DangerousFilesCard({ files }: { files: any[] }) {
  const accessible = files.filter(f => f.accessible);
  const redirected  = files.filter(f => !f.accessible && [301, 302].includes(f.status));
  const forbidden   = files.filter(f => f.status === 403);

  return (
    <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
      <div className="text-sm font-semibold text-red-700 flex items-center gap-1.5 mb-3">
        <FaFileAlt /> Exposed Paths
      </div>
      {files.length === 0 ? (
        <div className="flex items-center gap-1.5 text-xs text-green-700">
          <FaCheckCircle className="text-green-400" /> No sensitive paths reachable
        </div>
      ) : (
        <>
          {accessible.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-semibold text-red-600 mb-1.5">Accessible ({accessible.length})</div>
              <div className="space-y-1">
                {accessible.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <FaTimesCircle className="text-red-400 flex-shrink-0" />
                    <span className="font-mono text-gray-700 break-all">{f.path}</span>
                    <span className="ml-auto text-red-500 font-semibold">{f.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {redirected.length > 0 && (
            <div className="mb-3">
              <div className="text-xs font-semibold text-yellow-600 mb-1.5">Redirecting ({redirected.length})</div>
              <div className="space-y-1">
                {redirected.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <FaExclamationTriangle className="text-yellow-400 flex-shrink-0" />
                    <span className="font-mono text-gray-700 break-all">{f.path}</span>
                    <span className="ml-auto text-yellow-600">{f.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {forbidden.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-500 mb-1.5">Forbidden ({forbidden.length})</div>
              <div className="space-y-1">
                {forbidden.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <FaInfoCircle className="text-gray-400 flex-shrink-0" />
                    <span className="font-mono text-gray-500 break-all">{f.path}</span>
                    <span className="ml-auto text-gray-400">{f.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function LoginPagesCard({ pages }: { pages: any[] }) {
  const accessible = pages.filter(p => p.status === 200);

  return (
    <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
      <div className="text-sm font-semibold text-indigo-700 flex items-center gap-1.5 mb-3">
        <FaSignInAlt /> Login & Admin Pages
      </div>
      {accessible.length === 0 ? (
        <div className="flex items-center gap-1.5 text-xs text-green-700">
          <FaCheckCircle className="text-green-400" /> No exposed admin/login pages found
        </div>
      ) : (
        <div className="space-y-1.5">
          {accessible.map((p, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              <FaExclamationTriangle className="text-orange-400 flex-shrink-0" />
              <span className="font-mono text-gray-700 break-all">{p.path}</span>
              <span className="ml-auto text-orange-600 font-semibold">{p.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ScoreBar({ score, grade }: { score: number; grade: string }) {
  const color =
    score >= 90 ? 'bg-green-400'
    : score >= 75 ? 'bg-blue-400'
    : score >= 60 ? 'bg-yellow-400'
    : score >= 40 ? 'bg-orange-400'
    : 'bg-red-500';

  const gradeColor =
    grade === 'A' ? 'text-green-600'
    : grade === 'B' ? 'text-blue-600'
    : grade === 'C' ? 'text-yellow-600'
    : grade === 'D' ? 'text-orange-600'
    : 'text-red-600';

  return (
    <div className="flex items-center gap-4 mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
      <div className="text-center">
        <div className={`text-4xl font-extrabold ${gradeColor}`}>{grade}</div>
        <div className="text-xs text-gray-400 font-medium mt-0.5">Grade</div>
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-semibold text-gray-700">HTTP Security Score</span>
          <span className="text-sm font-bold text-gray-800">{score}/100</span>
        </div>
        <div className="h-2.5 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${color}`}
            style={{ width: `${score}%` }}
          />
        </div>
      </div>
    </div>
  );
}

// ── page shell ────────────────────────────────────────────────────────────────

export default function HttpSecurityPage() {
  const { loading, scans } = useScanData();

  if (loading) return <PageSpinner />;

  const scan = scans['http_security'];
  if (!scan || scan.status !== 'completed' || !scan.results) {
    return <LoadingCard service="HTTP Security" status={scan?.status || 'queued'} />;
  }

  return <HttpSecuritySection data={scan.results} />;
}

// ── main section ──────────────────────────────────────────────────────────────

function HttpSecuritySection({ data }: { data: any }) {
  const {
    url,
    status_code,
    security_headers = {},
    cookies = [],
    cors = {},
    info_disclosure = {},
    dangerous_files = [],
    login_pages = [],
    score,
    grade,
  } = data;

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm mb-8 border border-gray-200">

      {/* Header */}
      <h2 className="text-xl font-bold mb-1 flex items-center gap-2 text-gray-900">
        <FaLock className="text-blue-500" />
        HTTP Security
      </h2>
      {url && (
        <div className="text-xs text-gray-400 font-mono mb-4 flex items-center gap-2">
          <span>{url}</span>
          {status_code && (
            <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${
              status_code < 300 ? 'bg-green-100 text-green-700'
              : status_code < 400 ? 'bg-yellow-100 text-yellow-700'
              : 'bg-red-100 text-red-700'
            }`}>{status_code}</span>
          )}
        </div>
      )}

      {/* Score bar */}
      {score !== undefined && grade && (
        <ScoreBar score={score} grade={grade} />
      )}

      {/* Top row: Security Headers (full width) */}
      <div className="mb-4">
        <SecurityHeadersCard headers={security_headers} />
      </div>

      {/* 2-col grid for remaining cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CookiesCard cookies={cookies} />
        <CorsCard cors={cors} />
        <InfoDisclosureCard info={info_disclosure} />
        <DangerousFilesCard files={dangerous_files} />
        <div className="md:col-span-2">
          <LoginPagesCard pages={login_pages} />
        </div>
      </div>
    </div>
  );
}