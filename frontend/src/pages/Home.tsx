import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { FaSearch, FaClock, FaCheckCircle, FaSpinner, FaExclamationCircle, FaTrash, FaTag } from 'react-icons/fa';

interface Scan {
  scan_id: string;
  domain: string;
  domain_name: string | null;
  service: string;
  status: string;
  created_at: string;
  completed_at?: string;
}

interface GroupedScan {
  domain: string;
  domain_name: string | null;
  latest_date: string;
  scans: Scan[];
}

export default function Home() {
  const [domain, setDomain] = useState('');
  const [domain_name, setdomain_name] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingHistory, setFetchingHistory] = useState(true);
  const [recentScans, setRecentScans] = useState<GroupedScan[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchRecentScans().finally(() => setFetchingHistory(false));

    const interval = setInterval(() => {
      const hasActiveScans = recentScans.some(group =>
        group.scans.some(s => s.status === 'processing' || s.status === 'queued')
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
      const groups = res.data.groups || [];
      setRecentScans(groups);
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

    const services = ['dns', 'ip', 'ssl', 'webtech', 'subdomain', 'subdirectory', 'cve','http_security'];

    try {
      await Promise.all(
        services.map(service =>
          api.post(`/${service}/scan`, { domain: cleanDomain , domain_name : domain_name}).catch(() => {})
        )
      );

      // Save domain_name to backend if provided
      if (domain_name.trim()) {
        await api.post('/scoring/domain-name', {
          domain: cleanDomain,
          domain_name: domain_name.trim(),
        }).catch(() => {});
      }

      navigate(`/scan/${cleanDomain}`);
    } catch (err) {
      console.error('Failed to start scans:', err);
    } finally {
      setLoading(false);
    }
  };

  const getScanStatus = (scans: Scan[]) => {
    const total = scans.length;
    const completed = scans.filter(s => s.status === 'completed').length;
    const failed = scans.filter(s => s.status === 'failed').length;
    const processing = scans.filter(s => s.status === 'processing' || s.status === 'queued').length;
    return { total, completed, failed, processing };
  };

  const getStatusBadge = (scans: Scan[]) => {
    const { failed, processing } = getScanStatus(scans);

    if (processing > 0) {
      return (
        <span className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
          <FaSpinner className="animate-spin" /> In Progress
        </span>
      );
    } else if (failed > 0) {
      return (
        <span className="flex items-center gap-1.5 text-xs font-medium text-orange-700 bg-orange-50 border border-orange-200 px-2.5 py-1 rounded-full">
          <FaExclamationCircle /> Partial
        </span>
      );
    } else {
      return (
        <span className="flex items-center gap-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded-full">
          <FaCheckCircle /> Complete
        </span>
      );
    }
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
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-1">Security Scanner</h1>
        <p className="text-gray-500">Comprehensive domain security assessment</p>
      </div>

      {/* New Scan Input */}
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

      {/* Recent Scans */}
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
            {recentScans.map((group: GroupedScan, idx: number) => {
              const { total, completed, failed, processing } = getScanStatus(group.scans);

              return (
                <div
                  key={idx}
                  onClick={() => navigate(`/scan/${group.domain}`)}
                  className="bg-white p-5 rounded-xl shadow-sm border border-gray-200 transition-all hover:shadow-md hover:border-blue-300 cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1 min-w-0">
                      {group.domain_name ? (
                        <>
                          <h3 className="text-base font-semibold text-gray-900 truncate mb-0.5">{group.domain_name}</h3>
                          <p className="text-xs text-gray-400 font-mono truncate">{group.domain}</p>
                        </>
                      ) : (
                        <h3 className="text-base font-semibold text-gray-900 truncate mb-0.5">{group.domain}</h3>
                      )}
                      <p className="text-xs text-gray-400 mt-0.5">
                        {new Date(group.latest_date).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                      {getStatusBadge(group.scans)}
                      <button
                        onClick={(e) => deleteScan(group.domain, e)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                        title="Delete scan"
                      >
                        <FaTrash className="text-xs" />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5 mb-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Services</span>
                      <span className="text-gray-700 font-medium">{total}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">Completed</span>
                      <span className="text-green-600 font-medium">{completed}</span>
                    </div>
                    {processing > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">Processing</span>
                        <span className="text-amber-600 font-medium">{processing}</span>
                      </div>
                    )}
                    {failed > 0 && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-500">Failed</span>
                        <span className="text-red-500 font-medium">{failed}</span>
                      </div>
                    )}
                  </div>

                  <div className="w-full bg-gray-100 rounded-full h-1.5">
                    <div
                      className="bg-gradient-to-r from-blue-500 to-green-500 h-1.5 rounded-full transition-all"
                      style={{ width: `${(completed / total) * 100}%` }}
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