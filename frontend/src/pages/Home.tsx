import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { FaSearch, FaClock, FaCheckCircle, FaSpinner, FaExclamationCircle, FaTrash, FaTag } from 'react-icons/fa';

interface ScanGroup {
  scan_id: string;
  domain: string;
  domain_name: string | null;
  org_name: string | null;
  status: string;               // pending | scanning_subdomains | in_progress | completed | failed
  total_jobs: number;
  completed_jobs: number;
  domains_count: number;
  overall_score: number | null;
  overall_grade: string | null;
  created_at: string;
  completed_at?: string;
}

const GRADE_COLOR: Record<string, string> = {
  'A+': 'text-green-600', 'A': 'text-green-600', 'A-': 'text-green-600',
  'B+': 'text-lime-600', 'B': 'text-lime-600', 'B-': 'text-lime-600',
  'C+': 'text-yellow-600', 'C': 'text-yellow-600', 'C-': 'text-yellow-600',
  'F': 'text-red-600',
};

export default function Home() {
  const [domain, setDomain] = useState('');
  const [domain_name, setdomain_name] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingHistory, setFetchingHistory] = useState(true);
  const [recentScans, setRecentScans] = useState<ScanGroup[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchRecentScans().finally(() => setFetchingHistory(false));

    const interval = setInterval(() => {
      const hasActiveScans = recentScans.some(
        g => g.status !== 'completed' && g.status !== 'failed'
      );
      if (hasActiveScans || recentScans.length === 0) {
        fetchRecentScans();
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [recentScans]);

  const fetchRecentScans = async () => {
    try {
      const res = await api.get('/scoring/scans/grouped');
      setRecentScans(res.data.groups || []);
    } catch (err) {
      console.error('Failed to fetch scans:', err);
    }
  };

  const startNewScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain) return;

    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '').trim();
    if (!cleanDomain) return;

    setLoading(true);

    try {
      await api.post('/orchrestator/scan', {
        domain: cleanDomain,
        org_name: domain_name.trim() || null,
      });

      if (domain_name.trim()) {
        await api.post('/scoring/domain-name', {
          domain: cleanDomain,
          domain_name: domain_name.trim(),
        }).catch(() => {});
      }

      navigate(`/scan/${cleanDomain}`);
    } catch (err) {
      console.error('Failed to start scan:', err);
      alert('Failed to start scan. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (scan: ScanGroup) => {
    if (scan.status === 'completed') {
      return (
        <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
          <FaCheckCircle /> Complete
        </span>
      );
    }
    if (scan.status === 'failed') {
      return (
        <span className="flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full">
          <FaExclamationCircle /> Failed
        </span>
      );
    }
    // pending | scanning_subdomains | in_progress
    return (
      <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
        <FaSpinner className="animate-spin" /> {scan.status === 'scanning_subdomains' ? 'Discovering Subdomains' : 'In Progress'}
      </span>
    );
  };

  const deleteScan = async (domain: string, e: React.MouseEvent) => {
    e.stopPropagation();

    if (!confirm(`Delete all scans for ${domain}?`)) return;

    try {
      await api.delete(`/scoring/scans/${domain}`);
      fetchRecentScans();
    } catch (err) {
      console.error('Failed to delete scan:', err);
      alert('Failed to delete scan');
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">Security Scanner</h1>
        <p className="text-gray-500">Comprehensive domain security assessment</p>
      </div>

      <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-8 rounded-xl shadow-md mb-10">
        <p className="text-blue-100 text-sm font-medium mb-3 uppercase tracking-wide">New Assessment</p>
        <form onSubmit={startNewScan} className="space-y-3">
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Enter domain to scan (e.g., google.com)"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="flex-1 bg-white/15 backdrop-blur-sm text-white placeholder-blue-200 px-5 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/50 border border-white/20 text-sm"
            />
            <div className="relative w-56 flex-shrink-0">
              <FaTag className="absolute left-3.5 top-1/2 -translate-y-1/2 text-blue-300 text-xs pointer-events-none" />
              <input
                type="text"
                placeholder="Domain name (optional)"
                value={domain_name}
                onChange={(e) => setdomain_name(e.target.value)}
                className="w-full bg-white/10 backdrop-blur-sm text-white placeholder-blue-300 pl-9 pr-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/40 border border-white/15 text-sm"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading || !domain}
              className={`px-7 py-3 rounded-lg font-semibold flex items-center gap-2 text-sm transition-all ${
                loading || !domain
                  ? 'bg-white/20 text-white/50 cursor-not-allowed'
                  : 'bg-white text-blue-700 hover:bg-blue-50 shadow-sm'
              }`}
            >
              {loading ? (
                <><FaSpinner className="animate-spin" /> Starting...</>
              ) : (
                <><FaSearch /> Start Scan</>
              )}
            </button>
          </div>
        </form>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-5 flex items-center gap-2">
          <FaClock className="text-blue-500" />
          Recent Scans
        </h2>

        {fetchingHistory && recentScans.length === 0 ? (
          <div className="bg-white p-12 rounded-xl border border-gray-200 text-center flex justify-center items-center h-48 shadow-sm">
            <FaSpinner className="text-3xl text-blue-500 animate-spin" />
          </div>
        ) : recentScans.length === 0 ? (
          <div className="bg-white p-12 rounded-xl border border-gray-200 text-center shadow-sm">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <FaSearch className="text-2xl text-gray-400" />
            </div>
            <p className="text-gray-500 text-sm">No scans yet. Start your first security assessment above.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentScans.map((scan) => {
              const progress = scan.total_jobs > 0 ? (scan.completed_jobs / scan.total_jobs) * 100 : 0;

              return (
                <div
                  key={scan.scan_id}
                  onClick={() => navigate(`/scan/${scan.domain}`)}
                  className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 transition-all hover:shadow-md hover:border-blue-300 cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 min-w-0">
                      {scan.domain_name ? (
                        <>
                          <h3 className="text-base font-semibold text-gray-900 truncate mb-0.5">{scan.domain_name}</h3>
                          <p className="text-xs text-gray-400 font-mono truncate">{scan.domain}</p>
                        </>
                      ) : (
                        <h3 className="text-base font-semibold text-gray-900 truncate mb-0.5">{scan.domain}</h3>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(scan.created_at).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                      {getStatusBadge(scan)}
                      <button
                        onClick={(e) => deleteScan(scan.domain, e)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete scan"
                      >
                        <FaTrash className="text-xs" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 mb-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Domains Scanned</span>
                      <span className="text-gray-700 font-medium">{scan.domains_count || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Jobs Completed</span>
                      <span className="text-gray-700 font-medium">{scan.completed_jobs} / {scan.total_jobs}</span>
                    </div>
                    {scan.status === 'completed' && scan.overall_grade && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">Overall Grade</span>
                        <span className={`font-bold ${GRADE_COLOR[scan.overall_grade] || 'text-gray-700'}`}>
                          {scan.overall_grade} ({scan.overall_score})
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-green-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}