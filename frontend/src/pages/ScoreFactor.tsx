import { useState, useEffect } from 'react';
import { useScanData } from './Userscandata';
import { LoadingCard, PageSpinner } from './Sharedscan';
import api from '../api/client';
import {
  FaShieldAlt, FaChevronDown, FaChevronUp,
  FaExclamationTriangle, FaCheckCircle, FaSpinner, FaClock,
} from 'react-icons/fa';

// ─── types ───────────────────────────────────────────────────────────────────

interface ServiceScore {
  score: number;
  grade: string;
  details: string[];
  penalties: Record<string, number>;
  skipped?: boolean;
}

interface ScoreData {
  domain: string;
  score: number;
  grade: string;
  details: string[];
  penalties: Record<string, number>;
  components_analyzed: string[];
  service_scores: Record<string, ServiceScore>;
  service_weights: Record<string, number>;
}

// ─── constants ───────────────────────────────────────────────────────────────

const SERVICE_META: Record<string, { label: string; desc: string; icon: string }> = {
  ssl:           { label: 'TLS / SSL',           icon: '🔒', desc: 'Certificate validity, cipher strength, HSTS, TLS version support' },
  http_security: { label: 'HTTP Security',        icon: '🛡️', desc: 'Security headers: CSP, X-Frame-Options, XCTO, STS, CORP/COEP/COOP' },
  cve:           { label: 'CVE Vulnerabilities',  icon: '🐛', desc: 'Known CVEs scored by CVSS severity. Skipped when version fingerprinting unavailable.' },
  dns:           { label: 'DNS Security',         icon: '🌐', desc: 'SPF, DMARC, DKIM, DNSSEC, CAA and MX record presence' },
  ip:            { label: 'IP / Network',         icon: '📡', desc: 'Exposed risky ports, reverse DNS. No reputation data.' },
  webtech:       { label: 'Web Technologies',     icon: '⚙️', desc: 'EOL / outdated tech, server version leakage, exposed admin panels' },
  subdomain:     { label: 'Subdomain Exposure',   icon: '🔍', desc: 'Subdomain count, dangling CNAMEs, wildcard DNS' },
  subdirectory:  { label: 'Directory Exposure',   icon: '📂', desc: 'Sensitive paths (.git, .env, backup), directory listing, admin endpoints' },
};

const SERVICE_WEIGHTS: Record<string, number> = {
  cve: 0.25, ssl: 0.20, http_security: 0.20,
  dns: 0.15, ip: 0.05, webtech: 0.05, subdomain: 0.05, subdirectory: 0.05,
};

// highest weight first
const SERVICE_ORDER = ['cve', 'ssl', 'http_security', 'dns', 'ip', 'webtech', 'subdomain', 'subdirectory'];

// ─── helpers ─────────────────────────────────────────────────────────────────



function col(score: number) {
  if (score >= 85) return { bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200',  bar: 'bg-green-500',  stroke: '#22c55e' };
  if (score >= 70) return { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200',  bar: 'bg-amber-400',  stroke: '#fbbf24' };
  if (score >= 55) return { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', bar: 'bg-orange-400', stroke: '#fb923c' };
  return             { bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200',    bar: 'bg-red-500',    stroke: '#ef4444' };
}

// ─── GaugeSVG ─────────────────────────────────────────────────────────────────

function GaugeSVG({ score }: { score: number }) {
  const r = 44, cx = 64, cy = 64, circ = Math.PI * r;
  const dash = (score / 100) * circ;
  const c = col(score);
  return (
    <svg width="128" height="84" viewBox="0 0 128 84">
      <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`}
        fill="none" stroke="#e5e7eb" strokeWidth="10" strokeLinecap="round" />
      <path d={`M ${cx-r} ${cy} A ${r} ${r} 0 0 1 ${cx+r} ${cy}`}
        fill="none" stroke={c.stroke} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`} />
      <text x={cx} y={cy-4} textAnchor="middle" fontSize="22" fontWeight="600" fill={c.stroke}>{score}</text>
      <text x={cx} y={cy+14} textAnchor="middle" fontSize="11" fill="#9ca3af">/ 100</text>
    </svg>
  );
}

// ─── ScoreBar ────────────────────────────────────────────────────────────────

function ScoreBar({ score, barClass }: { score: number; barClass: string }) {
  return (
    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
      <div className={`h-2 rounded-full transition-all duration-500 ${barClass}`} style={{ width: `${score}%` }} />
    </div>
  );
}

// ─── ServiceStatusBadge — shown when score not yet available ─────────────────

function ServiceStatusBadge({ status }: { status: string }) {
  if (status === 'completed')
    return <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 border border-green-200 px-2 py-0.5 rounded-full"><FaCheckCircle size={9} /> Done</span>;
  if (status === 'processing' || status === 'queued')
    return <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full"><FaSpinner size={9} className="animate-spin" /> Scanning</span>;
  if (status === 'failed')
    return <span className="flex items-center gap-1 text-xs text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full"><FaExclamationTriangle size={9} /> Failed</span>;
  return <span className="flex items-center gap-1 text-xs text-gray-400 bg-gray-50 border border-gray-200 px-2 py-0.5 rounded-full"><FaClock size={9} /> Queued</span>;
}

// ─── ServiceCard (with score) ─────────────────────────────────────────────────

function ServiceCard({ serviceKey, data, weight, expanded, onToggle }: {
  serviceKey: string; data: ServiceScore; weight: number;
  expanded: boolean; onToggle: () => void;
}) {
  const meta = SERVICE_META[serviceKey] ?? { label: serviceKey, desc: '', icon: '🔧' };
  const { score, details = [], penalties = {}, skipped } = data;
  const c = col(score);
  const penaltyEntries = Object.entries(penalties);

  return (
    <div className={`bg-white rounded-xl border border-gray-200 overflow-hidden transition-shadow ${expanded ? 'shadow-md' : 'shadow-sm'}`}>
      <button onClick={onToggle} className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-gray-50 transition-colors">
        <span className="text-xl flex-shrink-0">{meta.icon}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm font-semibold text-gray-900">{meta.label}</span>
            {skipped && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-medium">skipped</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <ScoreBar score={score} barClass={c.bar} />
            <span className="text-xs text-gray-500 font-medium w-14 text-right flex-shrink-0">{score} / 100</span>
          </div>
        </div>

        <div className={`w-11 h-11 rounded-xl flex items-center justify-center border flex-shrink-0 ${c.bg} ${c.border}`}>
          <span className={`text-sm font-bold ${c.text}`}>{data.grade}</span>
        </div>

        <div className="text-xs text-gray-400 font-medium bg-gray-100 rounded-lg px-2.5 py-1 flex-shrink-0 w-12 text-center">
          {Math.round(weight * 100)}%
        </div>

        <span className="text-gray-400 flex-shrink-0">
          {expanded ? <FaChevronUp size={12} /> : <FaChevronDown size={12} />}
        </span>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-5 py-4">
          <p className="text-xs text-gray-400 mb-3">{meta.desc}</p>

          {penaltyEntries.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {penaltyEntries.map(([key, val]) => (
                <span key={key} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200 font-medium">
                  <FaExclamationTriangle size={9} />
                  -{val} {key.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          )}

          <ul className="space-y-1.5">
            {details.length === 0 ? (
              <li className="flex items-center gap-2 text-sm text-green-600">
                <FaCheckCircle size={12} className="flex-shrink-0" /> No issues found.
              </li>
            ) : (
              details.map((d, i) => {
                const isIssue = d.includes('(-');
                const clean = d.replace(/^\[.*?\]\s*/, '');
                return (
                  <li key={i} className={`flex items-start gap-2 text-sm ${isIssue ? 'text-gray-600' : 'text-green-600'}`}>
                    {isIssue
                      ? <FaExclamationTriangle size={11} className="flex-shrink-0 mt-0.5 text-amber-400" />
                      : <FaCheckCircle size={11} className="flex-shrink-0 mt-0.5" />
                    }
                    {clean}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── ServicePendingCard — shown when scan not yet scored ──────────────────────

function ServicePendingCard({ serviceKey, status, weight }: {
  serviceKey: string; status: string; weight: number;
}) {
  const meta = SERVICE_META[serviceKey] ?? { label: serviceKey, desc: '', icon: '🔧' };
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="flex items-center gap-3 px-5 py-4">
        <span className="text-xl flex-shrink-0 opacity-50">{meta.icon}</span>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm font-semibold text-gray-400">{meta.label}</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-gray-100 rounded-full h-2">
              <div className="h-2 w-0 rounded-full bg-gray-200" />
            </div>
            <span className="text-xs text-gray-300 font-medium w-14 text-right flex-shrink-0">— / 100</span>
          </div>
        </div>

        <ServiceStatusBadge status={status} />

        <div className="text-xs text-gray-300 font-medium bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1 flex-shrink-0 w-12 text-center">
          {Math.round(weight * 100)}%
        </div>

        <span className="text-gray-200 flex-shrink-0"><FaChevronDown size={12} /></span>
      </div>
    </div>
  );
}

// ─── Page entry point ─────────────────────────────────────────────────────────

export default function ScoreFactorsPage() {
  const { loading, summary, domain } = useScanData();
  const [freshScore, setFreshScore] = useState<ScoreData | null>(null);
  const [recalculating, setRecalculating] = useState(false);

  const rawScore: ScoreData | null = summary?.score ?? null;

  // If the backend returned a score but without service_scores (old cached format),
  // hit /scoring/calculate to force a fresh score with per-service breakdown.
  useEffect(() => {
    if (!rawScore || !domain) return;
    const hasServiceScores = rawScore.service_scores && Object.keys(rawScore.service_scores).length > 0;
    if (hasServiceScores) return;

    setRecalculating(true);
    api.post('/scoring/calculate', { domain })
      .then(res => setFreshScore(res.data))
      .catch(err => console.error('Score recalc failed:', err))
      .finally(() => setRecalculating(false));
  }, [rawScore, domain]);

  if (loading) return <PageSpinner />;

  if (!rawScore) {
    return (
      <LoadingCard
        service="Security Score"
        status={summary?.status === 'in_progress' ? 'processing' : 'queued'}
      />
    );
  }

  const scoreData = freshScore ?? rawScore;

  return (
    <ScoreFactors
      data={scoreData}
      domain={domain ?? ''}
      scans={summary?.scans ?? {}}
      recalculating={recalculating}
    />
  );
}

// ─── ScoreFactors ─────────────────────────────────────────────────────────────

function ScoreFactors({
  data, domain, scans, recalculating,
}: {
  data: ScoreData;
  domain: string;
  scans: Record<string, any>;
  recalculating: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const toggle = (key: string) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const { score, grade, service_scores = {}, service_weights = SERVICE_WEIGHTS } = data;
  const c = col(score);

  // Services that have a score from backend
  const scoredServices = SERVICE_ORDER.filter(s => service_scores[s]);
  // Services that have a scan but no score yet
  const pendingServices = SERVICE_ORDER.filter(s => !service_scores[s]);

  return (
    <div className="space-y-6">

      {/* ── Overall score card ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <FaShieldAlt className="text-blue-500" />
            <h2 className="text-xl font-bold text-gray-900">Security Score</h2>
          </div>
          {recalculating && (
            <span className="flex items-center gap-1.5 text-xs text-blue-500 bg-blue-50 border border-blue-200 px-3 py-1 rounded-full">
              <FaSpinner className="animate-spin" size={10} /> Calculating service scores…
            </span>
          )}
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-8">
          {/* Gauge + grade */}
          <div className="flex-shrink-0 flex flex-col items-center gap-2">
            <GaugeSVG score={score} />
            <div className={`px-5 py-1 rounded-full border text-lg font-bold ${c.bg} ${c.border} ${c.text}`}>
              {grade}
            </div>
          </div>

          {/* Mini bars — all 8 services */}
          <div className="flex-1 w-full space-y-2">
            {SERVICE_ORDER.map(s => {
              const svc = service_scores[s];
              const scanStatus = scans[s]?.status ?? 'queued';

              if (svc) {
                const sc = col(svc.score);
                return (
                  <div key={s} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-36 flex-shrink-0 truncate">
                      {SERVICE_META[s]?.label ?? s}
                    </span>
                    <ScoreBar score={svc.score} barClass={sc.bar} />
                    <span className={`text-xs font-semibold w-8 text-right flex-shrink-0 ${sc.text}`}>
                      {svc.score}
                    </span>
                  </div>
                );
              }

              // No score yet — show status placeholder bar
              return (
                <div key={s} className="flex items-center gap-3">
                  <span className="text-xs text-gray-300 w-36 flex-shrink-0 truncate">
                    {SERVICE_META[s]?.label ?? s}
                  </span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    {(scanStatus === 'processing' || scanStatus === 'queued') && (
                      <div className="h-2 rounded-full bg-gray-200 animate-pulse" style={{ width: '30%' }} />
                    )}
                  </div>
                  <span className="text-xs text-gray-300 w-8 text-right flex-shrink-0">—</span>
                </div>
              );
            })}
          </div>

          {/* Stats */}
          <div className="flex-shrink-0 text-right space-y-1">
            <p className="font-mono text-xs text-gray-400">{domain}</p>
            <p className="text-sm text-gray-500">{scoredServices.length} / {SERVICE_ORDER.length} scored</p>
            <p className="text-xs text-gray-400">Weighted average</p>
          </div>
        </div>
      </div>

      {/* ── Weight legend pills ── */}
      <div className="flex flex-wrap gap-2">
        {SERVICE_ORDER.map(s => (
          <div key={s} className={`flex items-center gap-1.5 text-xs border rounded-lg px-2.5 py-1 ${
            service_scores[s]
              ? 'bg-white border-gray-200 text-gray-500'
              : 'bg-gray-50 border-gray-100 text-gray-300'
          }`}>
            <span>{SERVICE_META[s]?.icon}</span>
            <span>{SERVICE_META[s]?.label}</span>
            <span className={`font-semibold ${service_scores[s] ? 'text-gray-700' : 'text-gray-300'}`}>
              {Math.round((service_weights[s] ?? SERVICE_WEIGHTS[s] ?? 0) * 100)}%
            </span>
          </div>
        ))}
      </div>

      {/* ── Scored service cards ── */}
      {scoredServices.length > 0 && (
        <div className="space-y-3">
          {scoredServices.map(serviceKey => (
            <ServiceCard
              key={serviceKey}
              serviceKey={serviceKey}
              data={service_scores[serviceKey]}
              weight={service_weights[serviceKey] ?? SERVICE_WEIGHTS[serviceKey] ?? 0}
              expanded={!!expanded[serviceKey]}
              onToggle={() => toggle(serviceKey)}
            />
          ))}
        </div>
      )}

      {/* ── Pending service cards ── */}
      {pendingServices.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
            {recalculating ? 'Loading scores…' : 'Awaiting scan completion'}
          </p>
          {pendingServices.map(serviceKey => (
            <ServicePendingCard
              key={serviceKey}
              serviceKey={serviceKey}
              status={scans[serviceKey]?.status ?? 'queued'}
              weight={service_weights[serviceKey] ?? SERVICE_WEIGHTS[serviceKey] ?? 0}
            />
          ))}
        </div>
      )}

      <p className="text-center text-xs text-gray-400 pb-2">
        Weights: CVE 25% · SSL 20% · HTTP Security 20% · DNS 15% · IP / Webtech / Subdomain / Subdir 5% each
      </p>
    </div>
  );
}