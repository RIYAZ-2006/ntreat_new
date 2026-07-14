import { Link, Outlet, useLocation } from 'react-router-dom';
import { ScanProvider, useScanContext } from '../pages/ScanContext';
import {
  FaGlobe, FaChartBar,
  FaExclamationCircle, FaServer, FaLock, FaCode, FaFolder,
  FaMapMarkerAlt, FaSpinner, FaCheckCircle
} from 'react-icons/fa';

const NAV_SECTIONS = [
  { id: 'overview',     label: 'Overview',         icon: FaGlobe,             path: '' },
  { id: 'score',        label: 'Score Factors',     icon: FaChartBar,          path: 'score' },
  { id: 'dns',          label: 'DNS Records',       icon: FaServer,            path: 'dns' },
  { id: 'ip',           label: 'IP Geolocation',    icon: FaMapMarkerAlt,      path: 'ip' },
  { id: 'ssl',          label: 'SSL / TLS',         icon: FaLock,              path: 'ssl' },
  { id: 'webtech',      label: 'Web Technologies',  icon: FaCode,              path: 'webtech' },
  { id: 'cve',          label: 'Vulnerabilities',   icon: FaExclamationCircle, path: 'cve' },
  { id: 'subdirectory', label: 'Directories',       icon: FaFolder,            path: 'subdirectory' },
  { id: 'http_security', label: 'Http Security',    icon: FaGlobe,            path: 'http_security' },
  { id: 'scan_details', label: 'Scan Details',    icon: FaGlobe,            path:'scandetails' }
];

function GradeBadge({ grade }: { grade: string }) {
  const color =
    grade === 'A' ? 'bg-green-600' :
    grade === 'B' ? 'bg-blue-600' :
    grade === 'C' ? 'bg-yellow-500' :
    'bg-red-600';

  return (
    <div className={`${color} rounded-lg w-12 h-12 flex items-center justify-center text-white font-bold text-xl flex-shrink-0`}>
      {grade}
    </div>
  );
}

const SERVICE_FOR_SECTION: Record<string, string> = {
  dns: 'dns', ip: 'ip', ssl: 'ssl', webtech: 'webtech',
  cve: 'cve', subdirectory: 'subdirectory',
  http_security: 'http_security'
};

function ScanLayoutInner() {
  const { domain, summary, scans } = useScanContext();
  const location = useLocation();

  // Derive active section from URL
  const pathSegments = location.pathname.split('/');
  const lastSegment = pathSegments[pathSegments.length - 1];
  const activeSection = (!lastSegment || lastSegment === domain) ? 'overview' : lastSegment;

  const score = summary?.score;

  const statusDot = (service: string) => {
    const s = scans[service]?.status || 'queued';
    if (s === 'completed') return <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />;
    if (s === 'processing') return <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse flex-shrink-0" />;
    if (s === 'failed')     return <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />;
    return <span className="w-2 h-2 rounded-full bg-gray-300 flex-shrink-0" />;
  };

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">

      {/* ── Domain Header Bar ───────────────────────────────────────── */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-screen-xl mx-auto px-6 py-4 flex items-center gap-4">
          {score ? (
            <GradeBadge grade={score.grade} />
          ) : (
            <div className="w-12 h-12 bg-gray-200 rounded-lg animate-pulse" />
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{domain}</h1>
              {summary?.status === 'in_progress' && (
                <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  <FaSpinner className="animate-spin text-[10px]" /> Scanning
                </span>
              )}
              {summary?.status === 'completed' && (
                <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full">
                  <FaCheckCircle className="text-[10px]" /> Complete
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {score ? `Security Score: ${score.score}/100` : 'Running security assessment…'}
            </p>
          </div>

          {score && (
            <div className="hidden lg:flex items-center gap-6 text-center">
              <div>
                <div className="text-2xl font-bold text-gray-900">{score.score}</div>
                <div className="text-xs text-gray-500">Score</div>
              </div>
              <div className="h-10 w-px bg-gray-200" />
              <div>
                <div className="text-2xl font-bold text-gray-900">{score.grade}</div>
                <div className="text-xs text-gray-500">Grade</div>
              </div>
              {summary && (
                <>
                  <div className="h-10 w-px bg-gray-200" />
                  <div>
                    <div className="text-2xl font-bold text-gray-900">
                      {summary.fast_services.completed + summary.slow_services.completed}
                      <span className="text-base text-gray-400">
                        /{summary.fast_services.total + summary.slow_services.total}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">Services</div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Body: Sidebar + Main ────────────────────────────────────── */}
      <div className="flex flex-1 max-w-screen-xl mx-auto w-full px-6 py-6 gap-6">

        {/* Sidebar */}
        <aside className="hidden lg:block w-56 flex-shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm sticky top-20 overflow-hidden">
            <div className="px-4 pt-4 pb-2">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Navigation</p>
            </div>
            <nav className="pb-2">
              {NAV_SECTIONS.map(({ id, label, icon: Icon, path }) => {
                const isActive = activeSection === id;
                const serviceKey = SERVICE_FOR_SECTION[id];
                const to = `/scan/${domain}${path ? `/${path}` : ''}`;

                return (
                  <Link
                    key={id}
                    to={to}
                    className={`w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors group ${
                      isActive
                        ? 'bg-blue-50 text-blue-700 font-semibold border-r-2 border-blue-600'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`text-xs ${isActive ? 'text-blue-600' : 'text-gray-400 group-hover:text-gray-600'}`} />
                      {label}
                    </div>
                    {serviceKey && statusDot(serviceKey)}
                  </Link>
                );
              })}
            </nav>

            {summary && (
              <div className="border-t border-gray-100 px-4 py-3 space-y-2">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Progress</p>
                <div className="flex justify-between text-xs text-gray-600">
                  <span>Quick scans</span>
                  <span className="font-medium text-gray-900">
                    {summary.fast_services.completed}/{summary.fast_services.total}
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className="bg-blue-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${(summary.fast_services.completed / summary.fast_services.total) * 100}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-gray-600">
                  <span>Deep scans</span>
                  <span className="font-medium text-gray-900">
                    {summary.slow_services.completed}/{summary.slow_services.total}
                  </span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-1.5">
                  <div
                    className="bg-purple-500 h-1.5 rounded-full transition-all"
                    style={{ width: `${(summary.slow_services.completed / summary.slow_services.total) * 100}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main content rendered by child routes */}
        <main className="flex-1 min-w-0 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 130px)' }}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// Wrap with ScanProvider so all child pages share the same data
export default function ScanDetailsLayout() {
  return (
    <ScanProvider>
      <ScanLayoutInner />
    </ScanProvider>
  );
}