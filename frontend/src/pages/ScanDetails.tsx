import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/client';
import { 
  FaArrowLeft, FaGlobe, FaMapMarkerAlt, FaServer, FaLock, 
  FaShieldAlt, FaCode, FaFolder, FaExclamationTriangle,
  FaCheckCircle, FaSpinner, FaClock, FaTimes, FaInfoCircle, FaTag
} from 'react-icons/fa';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Fix leaflet icon issue
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface ScanData {
  scan_id: string;
  domain: string;
  service: string;
  status: string;
  created_at: string;
  completed_at?: string;
  results?: any;
  error?: string;
}

interface ScanSummary {
  domain: string;
  domain_name: string | null;
  status: 'not_started' | 'in_progress' | 'completed';
  scans: Record<string, ScanData>;
  score: any;
  fast_services: { total: number; completed: number };
  slow_services: { total: number; completed: number };
}

export default function ScanDetails() {
  const { domain } = useParams<{ domain: string }>();
  const navigate = useNavigate();
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const domain_name = summary?.domain_name ?? null;
  const [loading, setLoading] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!domain) return;

    // Fetch initial data
    const fetchInitial = async () => {
      try {
        const res = await api.get(`/scoring/scan/summary/${domain}`);
        setSummary(res.data);
        setLoading(false);

        // Only start SSE if scan is in progress
        if (res.data.status === 'in_progress') {
          startSSE();
        }
      } catch (err) {
        console.error('Failed to fetch scan summary:', err);
        setLoading(false);
      }
    };

    const startSSE = () => {
      // Close existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const baseURL = api.defaults.baseURL || 'http://localhost:5000';
      const eventSource = new EventSource(`${baseURL}/scoring/scan/stream/${domain}`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          // Ensure we have valid data before updating state
          if (data && data.scans) {
            setSummary(data);
          }

          // Close SSE when scan is complete
          if (data.status === 'completed') {
            eventSource.close();
          }
        } catch (err) {
          console.error('Failed to parse SSE data:', err);
        }
      };

      eventSource.onerror = () => {
        console.error('SSE connection error');
        eventSource.close();
      };
    };

    fetchInitial();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [domain]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <FaCheckCircle className="text-green-400" />;
      case 'failed':
        return <FaTimes className="text-red-400" />;
      case 'processing':
        return <FaSpinner className="text-yellow-400 animate-spin" />;
      default:
        return <FaClock className="text-gray-500" />;
    }
  };

  const fastServices = ['dns', 'ip', 'ssl', 'webtech'];
  const slowServices = ['subdomain', 'subdirectory', 'cve'];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <FaSpinner className="text-4xl animate-spin text-blue-500" />
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <FaExclamationTriangle className="text-4xl text-yellow-500 mx-auto mb-4" />
          <p>No scan data found for {domain}</p>
        </div>
      </div>
    );
  }

  const scans = summary.scans || {};
  const score = summary.score;

  // Show progress loader if NOT all fast services are complete
  const fastServices_data = summary.fast_services || { completed: 0, total: 4 };
  const slowServices_data = summary.slow_services || { completed: 0, total: 3 };
  const allFastServicesComplete = fastServices_data.completed === fastServices_data.total;

  // Safety check - ensure scans object exists before rendering results
  if (!allFastServicesComplete || !scans || Object.keys(scans).length === 0) {
    const progress = (fastServices_data.completed / fastServices_data.total) * 100;
    
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="bg-white p-12 rounded-xl shadow-md max-w-2xl w-full border border-gray-200">
          <div className="text-center mb-8">
            <FaSpinner className="text-6xl text-blue-500 animate-spin mx-auto mb-6" />
            <h2 className="text-3xl font-bold mb-2 text-gray-900">
              Scanning {domain_name ? domain_name : domain}
            </h2>
            {domain_name && (
              <p className="text-gray-400 font-mono text-sm">{domain}</p>
            )}
            <p className="text-gray-500 text-sm">Running initial security checks...</p>
          </div>

          {/* Fast Services Progress */}
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

          {/* Service Status Grid */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            {['dns', 'ip', 'ssl', 'webtech'].map(service => {
              const scan = scans[service];
              const status = scan?.status || 'queued';
              
              return (
                <div key={service} className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                  <div className="flex items-center justify-between">
                    <span className="text-sm capitalize font-medium">{service === 'webtech' ? 'Web Tech' : service}</span>
                    {status === 'completed' ? (
                      <FaCheckCircle className="text-green-400" />
                    ) : status === 'processing' ? (
                      <FaSpinner className="text-yellow-400 animate-spin" />
                    ) : status === 'failed' ? (
                      <FaTimes className="text-red-400" />
                    ) : (
                      <FaClock className="text-gray-500" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-center text-sm text-gray-500">
            <p>In-depth scans (Subdomain, Subdirectory, CVE) will run in the background</p>
            <p className="mt-1">You'll see results as they complete</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <FaSpinner className="text-4xl animate-spin text-blue-500" />
      </div>
    );
  }

  // const domain_name = summary?.domain_name ?? null;

  return (
    <div className="max-w-7xl mx-auto pb-12">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-4 transition text-sm"
        >
          <FaArrowLeft /> Back to Home
        </button>
        
        <div className="flex items-center justify-between">
          <div>
            {domain_name ? (
              <>
                <h1 className="text-3xl font-bold mb-1 flex items-center gap-3 text-gray-900">
                  <FaTag className="text-blue-400 text-2xl" />
                  {domain_name}
                </h1>
                <p className="text-gray-400 font-mono text-sm mb-1 flex items-center gap-2">
                  <FaGlobe className="text-blue-400 text-xs" />
                  {domain}
                </p>
              </>
            ) : (
              <h1 className="text-3xl font-bold mb-2 flex items-center gap-3 text-gray-900">
                <FaGlobe className="text-blue-500" />
                {domain}
              </h1>
            )}
            <p className="text-gray-500 text-sm">Security Assessment Results</p>
          </div>
          
          {score && (
            <div className="text-right">
              <div className="bg-gradient-to-br from-blue-600 to-purple-600 p-6 rounded-xl text-center min-w-[150px] mb-3">
                <div className="text-sm text-white/80 mb-1">Security Score</div>
                <div className="text-5xl font-bold text-white mb-1">{score.score}</div>
                <div className="text-2xl font-bold text-white">Grade {score.grade}</div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200 max-w-md text-sm">
                <div className="text-xs font-semibold text-gray-600 mb-2">Score Breakdown:</div>
                <div className="space-y-1 text-xs text-gray-700">
                  {/* TLS Configuration - based on actual penalties */}
                  <div className="flex justify-between">
                    <span>• TLS Configuration:</span>
                    <span className="text-white">
                      {(() => {
                        const tlsPenalties = (score.penalties?.weak_ciphers || 0) + 
                                           (score.penalties?.legacy_tls || 0) + 
                                           (score.penalties?.no_tls13 || 0) + 
                                           (score.penalties?.no_hsts || 0) + 
                                           (score.penalties?.cert_expired || 0) + 
                                           (score.penalties?.cert_expiring || 0);
                        if (tlsPenalties === 0) return 'Strong';
                        if (tlsPenalties <= 8) return 'Adequate';
                        if (tlsPenalties <= 15) return 'Weak';
                        return 'Poor';
                      })()}
                    </span>
                  </div>
                  
                  {/* DNS Security - based on actual penalties */}
                  <div className="flex justify-between">
                    <span>• DNS Security:</span>
                    <span className="text-white">
                      {(() => {
                        const dnsPenalties = (score.penalties?.no_spf || 0) + (score.penalties?.no_dmarc || 0);
                        if (dnsPenalties === 0) return 'Strong';
                        if (dnsPenalties <= 5) return 'Adequate';
                        return 'Weak';
                      })()}
                    </span>
                  </div>
                  
                  {/* Subdomain Exposure - based on actual count */}
                  <div className="flex justify-between">
                    <span>• Subdomain Exposure:</span>
                    <span className="text-white">
                      {(() => {
                        const subCount = scans.subdomain?.results?.count || 0;
                        if (subCount === 0) return 'None';
                        if (subCount <= 10) return 'Low';
                        if (subCount <= 30) return 'Moderate';
                        return 'Elevated';
                      })()}
                    </span>
                  </div>
                  
                  {/* Directory Exposure - risk-based assessment */}
                  <div className="flex justify-between">
                    <span>• Directory Exposure:</span>
                    <span className="text-white">
                      {(() => {
                        const dirCount = scans.subdirectory?.results?.count || 0;
                        const statusCounts = scans.subdirectory?.results?.status_counts || {};
                        const sensitiveCount = statusCounts['200'] || 0;
                        
                        if (dirCount === 0) return 'None';
                        if (sensitiveCount === 0) return 'Redirects Only';
                        if (sensitiveCount <= 3) return 'Low Risk';
                        return 'Moderate Risk';
                      })()}
                    </span>
                  </div>
                  
                  {/* CVE Status */}
                  <div className="flex justify-between">
                    <span>• Vulnerabilities:</span>
                    <span className="text-white">
                      {(() => {
                        const vulnPenalty = score.penalties?.vulnerabilities || 0;
                        if (vulnPenalty === 0) return 'None Detected';
                        if (vulnPenalty <= 10) return 'Low Severity';
                        if (vulnPenalty <= 20) return 'Moderate';
                        return 'High Severity';
                      })()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Service Status Overview */}
      <div className="mb-8">
        {/* Fast Services */}
        <div className="mb-4">
          <h3 className="text-sm font-semibold text-gray-600 mb-2 flex items-center gap-2">
            <FaCheckCircle className="text-green-500" />
            Fast Scans ({fastServices_data.completed}/{fastServices_data.total} complete)
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {fastServices.map(service => {
              const scan = scans[service];
              return (
                <div key={service} className="bg-white p-4 rounded-lg text-center border border-gray-200 shadow-sm">
                  <div className="flex justify-center mb-2">
                    {scan ? getStatusIcon(scan.status) : <FaClock className="text-gray-600" />}
                  </div>
                  <div className="text-sm font-semibold capitalize">{service === 'webtech' ? 'Web Tech' : service}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Slow Services */}
        <div>
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
                  <div className="text-sm font-semibold capitalize">{service}</div>
                  {scan?.status === 'processing' && (
                    <div className="text-xs text-gray-400 mt-1">May take 5-20 min</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Fast Service Results - Show Immediately */}
      <div className="space-y-8 mb-8">
        <h2 className="text-xl font-bold flex items-center gap-2 text-gray-900">
          <FaCheckCircle className="text-green-500" />
          Quick Scan Results
        </h2>

      {/* DNS Results or Loader */}
      {scans.dns?.status === 'completed' && scans.dns.results ? (
        <DNSSection data={scans.dns.results} />
      ) : (
        <LoadingCard service="DNS Records" status={scans.dns?.status || 'queued'} />
      )}

      {/* IP/Geolocation Results or Loader */}
      {scans.ip?.status === 'completed' && scans.ip.results ? (
        <IPSection data={scans.ip.results} />
      ) : (
        <LoadingCard service="IP Geolocation" status={scans.ip?.status || 'queued'} />
      )}

      {/* SSL Results or Loader */}
      {scans.ssl?.status === 'completed' && scans.ssl.results ? (
        <SSLSection data={scans.ssl.results} />
      ) : (
        <LoadingCard service="SSL/TLS Analysis" status={scans.ssl?.status || 'queued'} />
      )}

      {/* WebTech Results or Loader */}
      {scans.webtech?.status === 'completed' && scans.webtech.results ? (
        <WebTechSection data={scans.webtech.results} />
      ) : (
        <LoadingCard service="Web Technology Detection" status={scans.webtech?.status || 'queued'} />
      )}
      </div>

      {/* Slow Service Results - Show with Loaders */}
      <div className="space-y-8">
        <h2 className="text-xl font-bold flex items-center gap-2 text-gray-900">
          <FaClock className="text-yellow-500" />
          In-Depth Scan Results
          {slowServices_data.completed < slowServices_data.total && (
            <span className="text-sm text-gray-400 font-normal">({slowServices_data.completed}/{slowServices_data.total} complete)</span>
          )}
        </h2>

        {/* CVE Results or Loader */}
        {scans.cve?.status === 'completed' && scans.cve.results ? (
          <CVESection data={scans.cve.results} />
        ) : (
          <LoadingCard service="CVE Vulnerability Scan" status={scans.cve?.status || 'queued'} />
        )}

        {/* Subdomain Results or Loader */}
        {scans.subdomain?.status === 'completed' && scans.subdomain.results ? (
          <SubdomainSection data={scans.subdomain.results} />
        ) : (
          <LoadingCard service="Subdomain Discovery" status={scans.subdomain?.status || 'queued'} />
        )}

        {/* Subdirectory Results or Loader */}
        {scans.subdirectory?.status === 'completed' && scans.subdirectory.results ? (
          <SubdirectorySection data={scans.subdirectory.results} />
        ) : (
          <LoadingCard service="Directory Enumeration" status={scans.subdirectory?.status || 'queued'} />
        )}
      </div>
    </div>
  );
}

// LoadingCard for services still processing
function LoadingCard({ service, status }: { service: string; status: string }) {
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-gray-700">{service}</h3>
        {status === 'processing' ? (
          <FaSpinner className="text-2xl text-yellow-400 animate-spin" />
        ) : status === 'failed' ? (
          <FaTimes className="text-2xl text-red-400" />
        ) : (
          <FaClock className="text-2xl text-gray-500" />
        )}
      </div>
      <div className="flex items-center justify-center h-32 bg-gray-900 rounded">
        {status === 'processing' ? (
          <div className="text-center">
            <FaSpinner className="text-3xl text-yellow-400 animate-spin mx-auto mb-2" />
            <p className="text-gray-500">Scanning in progress...</p>
            <p className="text-xs text-gray-500 mt-1">This may take 5-20 minutes</p>
          </div>
        ) : status === 'failed' ? (
          <div className="text-center">
            <FaTimes className="text-3xl text-red-400 mx-auto mb-2" />
            <p className="text-gray-500">Scan failed</p>
          </div>
        ) : (
          <div className="text-center">
            <FaClock className="text-3xl text-gray-500 mx-auto mb-2" />
            <p className="text-gray-500">Waiting to start...</p>
          </div>
        )}
      </div>
    </div>
  );
}

// Component for DNS Section
function DNSSection({ data }: { data: any }) {
  const recordTypes = ['A', 'AAAA', 'MX', 'NS', 'SOA', 'PTR'];
  const warnings = data._warnings || [];
  const txtParsed = data.TXT_parsed || {};
  
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm mb-8 border border-gray-200">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900">
        <FaGlobe className="text-blue-500" />
        DNS Records
      </h2>
      
      {/* Warnings */}
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
      
      {/* Standard DNS Records */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        {recordTypes.map(type => {
          const records = data[type] || [];
          if (records.length === 0) return null;
          
          return (
            <div key={type} className="bg-gray-50 p-4 rounded-lg border border-gray-100">
              <div className="text-sm font-semibold text-blue-700 mb-2">{type} Records</div>
              <div className="space-y-1">
                {records.map((record: string, idx: number) => (
                  <div key={idx} className="text-sm text-gray-300 font-mono break-all">
                    {record}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
      
      {/* Parsed TXT Records */}
      {Object.keys(txtParsed).length > 0 && (
        <div className="border-t border-gray-200 pt-6">
          <h3 className="text-lg font-semibold text-gray-200 mb-4">TXT Record Analysis</h3>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            
            {/* SPF Records */}
            {txtParsed.spf && txtParsed.spf.length > 0 && (
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                <div className="text-sm font-semibold text-green-700 mb-3">SPF Configuration</div>
                {txtParsed.spf.map((spf: any, idx: number) => (
                  <div key={idx} className="space-y-2">
                    <div className="text-xs text-gray-400 font-mono break-all">{spf.raw}</div>
                    {spf.parsed && (
                      <>
                        <div className="pl-3 border-l-2 border-green-400 space-y-1 text-xs">
                          {spf.parsed.ip4 && spf.parsed.ip4.length > 0 && (
                            <div><span className="text-gray-500">IPv4:</span> <span className="text-gray-700">{spf.parsed.ip4.join(', ')}</span></div>
                          )}
                          {spf.parsed.ip6 && spf.parsed.ip6.length > 0 && (
                            <div><span className="text-gray-500">IPv6:</span> <span className="text-gray-700">{spf.parsed.ip6.join(', ')}</span></div>
                          )}
                          {spf.parsed.include && spf.parsed.include.length > 0 && (
                            <div><span className="text-gray-500">Includes:</span> <span className="text-gray-700">{spf.parsed.include.join(', ')}</span></div>
                          )}
                          {spf.parsed.mx && spf.parsed.mx.length > 0 && (
                            <div><span className="text-gray-500">MX:</span> <span className="text-gray-700">{spf.parsed.mx.join(', ')}</span></div>
                          )}
                          {spf.parsed.a && spf.parsed.a.length > 0 && (
                            <div><span className="text-gray-500">A Records:</span> <span className="text-gray-700">{spf.parsed.a.join(', ')}</span></div>
                          )}
                          {spf.parsed.all && (
                            <div><span className="text-gray-500">Default:</span> <span className="text-gray-700">{spf.parsed.all}</span></div>
                          )}
                        </div>
                        
                        {/* SPF Evaluation */}
                        <div className="mt-3 pt-3 border-t border-gray-200 space-y-1">
                          <div className="flex items-center gap-2 text-xs">
                            <FaCheckCircle className="text-green-400" />
                            <span className="text-green-700">SPF record present</span>
                          </div>
                          {spf.parsed.all === '-all' && (
                            <div className="flex items-center gap-2 text-xs">
                              <FaCheckCircle className="text-green-400" />
                              <span className="text-green-700">Strict policy enforced (-all)</span>
                            </div>
                          )}
                          {spf.parsed.all === '~all' && (
                            <div className="flex items-center gap-2 text-xs">
                              <FaExclamationTriangle className="text-yellow-400" />
                              <span className="text-yellow-700">Soft fail policy (~all) - consider -all for better protection</span>
                            </div>
                          )}
                          {spf.parsed.include && spf.parsed.include.length > 2 && (
                            <div className="flex items-center gap-2 text-xs">
                              <FaInfoCircle className="text-blue-400" />
                              <span className="text-gray-700">Large authorized provider list ({spf.parsed.include.length} includes)</span>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
            
            {/* DMARC Records */}
            {txtParsed.dmarc && txtParsed.dmarc.length > 0 && (
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                <div className="text-sm font-semibold text-purple-700 mb-2">DMARC Policy</div>
                {txtParsed.dmarc.map((record: string, idx: number) => (
                  <div key={idx} className="text-xs text-gray-300 font-mono break-all">{record}</div>
                ))}
              </div>
            )}
            
            {/* Verification Tokens */}
            {txtParsed.verification && txtParsed.verification.length > 0 && (
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                <div className="text-sm font-semibold text-blue-700 mb-2">Domain Verification</div>
                {txtParsed.verification.map((record: string, idx: number) => {
                  const provider = record.includes('google') ? 'Google' : 
                                   record.includes('MS=') ? 'Microsoft' : 
                                   record.includes('facebook') ? 'Facebook' : 'Other';
                  return (
                    <div key={idx} className="mb-2">
                      <div className="text-xs font-semibold text-gray-500">{provider}</div>
                      <div className="text-xs text-gray-300 font-mono break-all">{record}</div>
                    </div>
                  );
                })}
              </div>
            )}
            
            {/* Other TXT Records */}
            {txtParsed.other && txtParsed.other.length > 0 && (
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                <div className="text-sm font-semibold text-gray-600 mb-2">Other TXT Records</div>
                {txtParsed.other.map((record: string, idx: number) => (
                  <div key={idx} className="text-xs text-gray-300 font-mono break-all mb-1">{record}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Component for IP/Geolocation Section
function IPSection({ data }: { data: any }) {
  const position: [number, number] = [data.lat || 0, data.lon || 0];
  
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm mb-8 border border-gray-200">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900">
        <FaMapMarkerAlt className="text-red-500" />
        IP Geolocation
      </h2>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <InfoRow label="IP Address" value={data.query} />
          <InfoRow label="Country" value={`${data.country} (${data.countryCode})`} />
          <InfoRow label="Region" value={`${data.regionName}, ${data.region}`} />
          <InfoRow label="City" value={data.city} />
          <InfoRow label="ISP" value={data.isp} />
          <InfoRow label="Organization" value={data.org} />
          <InfoRow label="AS" value={data.as} />
          <InfoRow label="Timezone" value={data.timezone} />
          <InfoRow label="Coordinates" value={`${data.lat}, ${data.lon}`} />
        </div>
        
        <div className="h-80 rounded-lg overflow-hidden">
          <MapContainer center={position} zoom={10} style={{ height: '100%', width: '100%' }}>
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            <Marker position={position}>
              <Popup>{data.city}, {data.country}</Popup>
            </Marker>
          </MapContainer>
        </div>
      </div>
    </div>
  );
}

// Component for SSL Section
function SSLSection({ data }: { data: any }) {
  const sslScans = data.ssl_scan || [];
  const ocsp = data.ocsp || {};
  const certificate = data.certificate || {};
  const hsts = data.hsts || {};
  const cipherAnalysis = data.cipher_analysis || {};
  
  // Calculate days until expiry color
  const getExpiryColor = (days: number) => {
    if (days < 0) return 'text-red-400';
    if (days < 30) return 'text-yellow-400';
    return 'text-green-400';
  };
  
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm mb-8 border border-gray-200">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900">
        <FaLock className="text-green-500" />
        SSL/TLS Analysis
      </h2>
      
      {/* Certificate Information */}
      {certificate.expiry && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
            <div className="text-sm font-semibold text-blue-700 mb-3">Certificate Info</div>
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-gray-500">Subject:</span>
                <span className="ml-2 text-gray-200 font-mono">{certificate.subject || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500">Issuer:</span>
                <span className="ml-2 text-gray-200 font-mono">{certificate.issuer || 'N/A'}</span>
              </div>
              <div>
                <span className="text-gray-500">Expires:</span>
                <span className={`ml-2 font-semibold ${getExpiryColor(certificate.days_remaining || 0)}`}>
                  {certificate.expiry}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Days Remaining:</span>
                <span className={`ml-2 font-bold text-lg ${getExpiryColor(certificate.days_remaining || 0)}`}>
                  {certificate.days_remaining}
                </span>
              </div>
            </div>
          </div>
          
          {/* Security Features */}
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
            <div className="text-sm font-semibold text-purple-400 mb-3">Security Features</div>
            <div className="space-y-2">
              {/* HSTS */}
              <div className="flex items-center gap-2">
                {hsts.enabled ? (
                  <FaCheckCircle className="text-green-400" />
                ) : (
                  <FaTimes className="text-red-400" />
                )}
                <span className="text-sm">
                  HSTS {hsts.enabled ? 'Enabled' : 'Not Enabled'}
                </span>
              </div>
              {hsts.enabled && hsts.max_age && (
                <div className="text-xs text-gray-400 pl-6">
                  Max-Age: {hsts.max_age} seconds
                </div>
              )}
              
              {/* TLS 1.3 Support */}
              {cipherAnalysis.tls_versions && (
                <div className="flex items-center gap-2">
                  {cipherAnalysis.tls_versions.includes('TLSv1.3') ? (
                    <FaCheckCircle className="text-green-400" />
                  ) : (
                    <FaExclamationTriangle className="text-yellow-400" />
                  )}
                  <span className="text-sm">
                    TLS 1.3 {cipherAnalysis.tls_versions.includes('TLSv1.3') ? 'Supported' : 'Not Supported'}
                  </span>
                </div>
              )}
              
              {/* Supported TLS Versions */}
              {cipherAnalysis.tls_versions && cipherAnalysis.tls_versions.length > 0 && (
                <div className="text-xs text-gray-400 pl-6">
                  Versions: {cipherAnalysis.tls_versions.join(', ')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Weak Ciphers Warning */}
      {cipherAnalysis.weak_ciphers && cipherAnalysis.weak_ciphers.length > 0 && (
        <div className="mb-4 p-4 bg-red-900/20 border border-red-700/50 rounded">
          <div className="flex items-start gap-2">
            <FaExclamationTriangle className="text-red-500 mt-0.5 flex-shrink-0" />
            <div>
              <div className="font-semibold text-red-200 mb-2">
                Weak Ciphers Detected ({cipherAnalysis.weak_ciphers.length})
              </div>
              <div className="text-xs text-red-300 space-y-1">
                {cipherAnalysis.weak_ciphers.slice(0, 5).map((cipher: any, idx: number) => (
                  <div key={idx} className="font-mono">
                    {typeof cipher === 'string' ? cipher : `${cipher.cipher} (${cipher.version}, ${cipher.bits} bits)`}
                  </div>
                ))}
                {cipherAnalysis.weak_ciphers.length > 5 && (
                  <div className="text-gray-500">...and {cipherAnalysis.weak_ciphers.length - 5} more</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* OCSP Status */}
      {ocsp.status && !ocsp.skip && (
        <div className={`p-4 rounded-lg mb-4 ${
          ocsp.status === 'good' ? 'bg-green-900/30 border border-green-700' :
          ocsp.status === 'revoked' ? 'bg-red-900/30 border border-red-700' :
          ocsp.status === 'dns_error' || ocsp.status === 'network_error' ? 'bg-gray-900/30 border border-gray-200' :
          'bg-yellow-900/30 border border-yellow-700'
        }`}>
          <div className="flex items-center gap-2 mb-1">
            {ocsp.status === 'good' ? <FaCheckCircle className="text-green-400" /> : 
             <FaExclamationTriangle className="text-yellow-400" />}
            <span className="font-semibold">OCSP Status: {ocsp.status.toUpperCase()}</span>
          </div>
          <div className="text-sm text-gray-700">{ocsp.message}</div>
          {ocsp.ocsp_url && <div className="text-xs text-gray-400 mt-1">OCSP URL: {ocsp.ocsp_url}</div>}
        </div>
      )}
      
      {/* Cipher Suites */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">SSL Version</th>
              <th className="p-3 text-left">Cipher</th>
              <th className="p-3 text-left">Bits</th>
            </tr>
          </thead>
          <tbody>
            {sslScans.slice(0, 20).map((cipher: any, idx: number) => (
              <tr key={idx} className="border-t border-gray-100 hover:bg-gray-50">
                <td className="p-3">
                  <span className={`px-2 py-1 rounded text-xs ${
                    cipher.status === 'preferred' ? 'bg-green-600' : 'bg-blue-600'
                  }`}>
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

// Component for CVE Section
function CVESection({ data }: { data: any }) {
  const ports = data.ports_scanned || [];
  const vulns = data.cve_scan || [];
  const scanApplicable = data.scan_applicable !== false;
  const skipReason = data.skip_reason;
  const cdnDetected = data.cdn_detected || false;
  const cdnName = data.cdn_name;
  const versionFingerprints = data.version_fingerprints || [];
  
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm mb-8 border border-gray-200">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900">
        <FaShieldAlt className="text-red-500" />
        CVE Vulnerability Scan
      </h2>
      
      {!scanApplicable ? (
        /* Professional Skip Message */
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg">
            <div className="flex items-start gap-3 mb-4">
              <FaInfoCircle className="text-blue-400 text-2xl flex-shrink-0 mt-1" />
              <div>
                <div className="text-xl font-semibold text-blue-700 mb-2">Status: Skipped</div>
                <div className="text-gray-300 mb-3">
                  <strong>Reason:</strong>
                </div>
                <ul className="list-disc list-inside space-y-1 text-gray-300 ml-2">
                  {cdnDetected && (
                    <li>Target is behind {cdnName} proxy</li>
                  )}
                  {!versionFingerprints.length && (
                    <>
                      <li>Origin server software and version not observable</li>
                      <li>CVE correlation would be inaccurate and misleading</li>
                    </>
                  )}
                  {skipReason && !cdnDetected && !versionFingerprints.length && (
                    <li>{skipReason}</li>
                  )}
                </ul>
              </div>
            </div>
            
            <div className="border-t border-blue-800 pt-4 mt-4">
              <div className="text-sm font-semibold text-blue-700 mb-2">What we did instead:</div>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-400 ml-2">
                <li>Checked TLS posture and cipher security</li>
                <li>Analyzed DNS configuration and attack surface</li>
                <li>Examined HTTP headers and security policies</li>
                <li>Detected web technologies and frameworks</li>
              </ul>
            </div>
            
            <div className="border-t border-blue-800 pt-4 mt-4">
              <div className="text-sm font-semibold text-blue-700 mb-2">Recommendation:</div>
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-400 ml-2">
                {cdnDetected && <li>Scan origin server IP directly (if accessible)</li>}
                <li>Enable authenticated or internal scanning for detailed CVE analysis</li>
                <li>Review other security metrics for comprehensive assessment</li>
              </ul>
            </div>
          </div>
          
          {/* Show detected services */}
      {ports.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold mb-3">Services Detected</h3>
          <div className="space-y-2">
            {ports.map((port: any, idx: number) => (
              <div key={idx} className="bg-gray-50 p-3 rounded flex items-center justify-between">
                <div>
                  <span className="font-mono font-bold">Port {port.port}</span>
                  {port.service && port.service !== 'unknown' && (
                    <span className="text-gray-400 ml-2">
                      {port.service}
                      {port.version && port.version !== '' ? ` ${port.version}` : ' (version unknown)'}
                    </span>
                  )}
                </div>
                <span className={`px-2 py-1 rounded text-xs ${
                  port.state === 'open' ? 'bg-green-600' :
                  port.state === 'filtered' ? 'bg-yellow-600' : 'bg-red-600'
                }`}>
                  {port.state === 'filtered' && port.port === 80 ? 'filtered (HTTP → HTTPS enforced)' :
                  port.state === 'filtered' ? 'filtered (firewall)' :
                  port.state}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>
      ) : (
        /* Standard CVE Display */
        <div className="flex flex-cols gap-6">
          {/* Row 1: Version Fingerprints + Vulnerabilities side by side */}
          <div className="grid grid-row-1 md:grid-row-2 gap-6 items-start">

            {/* Version Fingerprints */}
            {versionFingerprints.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Version Fingerprints</h3>
                <div className="space-y-2">
                  {versionFingerprints.map((fp: any, idx: number) => (
                    <div key={idx} className="bg-gray-50 p-3 rounded">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-mono font-bold">Port {fp.port}</span>
                        <span className={`px-2 py-1 rounded text-xs ${
                          fp.confidence === 'high' ? 'bg-green-600' :
                          fp.confidence === 'medium' ? 'bg-yellow-600' : 'bg-orange-600'
                        }`}>
                          {fp.confidence} confidence
                        </span>
                      </div>
                      <div className="text-sm text-gray-700">{fp.product} {fp.version}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Vulnerabilities Found */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Vulnerabilities Found</h3>
              {vulns.length === 0 ? (
                <div className="bg-green-900/20 border border-green-700 p-4 rounded text-center">
                  <FaCheckCircle className="text-green-400 text-3xl mx-auto mb-2" />
                  <div className="text-green-400">No vulnerabilities detected</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {vulns.map((vuln: any, idx: number) => (
                    <div key={idx} className="bg-red-900/20 border border-red-700 p-4 rounded">

                      {/* Header: CVE ID + Severity */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-semibold text-red-300">{vuln.id}</div>
                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                          vuln.severity === 'CRITICAL' ? 'bg-red-700' :
                          vuln.severity === 'HIGH' ? 'bg-orange-700' :
                          vuln.severity === 'MEDIUM' ? 'bg-yellow-700' : 'bg-blue-700'
                        }`}>
                          {vuln.severity}
                        </span>
                      </div>

                      {/* Description: parse bullet points */}
                      <div className="text-sm text-gray-300 mb-3">
                        {vuln.description
                          // Split on bullet markers: "* " or "• "
                          .split(/(?:\n|\s{2,})?\*\s+|•\s+/)
                          .filter(Boolean)
                          .map((part: string, i: number) =>
                            i === 0 ? (
                              // First chunk is the plain intro paragraph
                              <p key={i} className="mb-2">{part.trim()}</p>
                            ) : (
                              // Remaining chunks are bullet items
                              null
                            )
                          )}

                        {/* Render bullets separately */}
                        {(() => {
                          const parts = vuln.description
                            .split(/(?:\n|\s{2,})?\*\s+|•\s+/)
                            .filter(Boolean);
                          const bullets = parts.slice(1);
                          return bullets.length > 0 ? (
                            <ul className="list-disc list-inside space-y-1 text-gray-300 mt-1">
                              {bullets.map((b: string, i: number) => (
                                <li key={i}>{b.trim()}</li>
                              ))}
                            </ul>
                          ) : null;
                        })()}
                      </div>

                      {/* Meta info */}
                      <div className="text-xs text-gray-400 space-y-1 border-t border-red-900 pt-2">
                        <div>CVSS Score: <span className="text-gray-800">{vuln.cvss_score}</span></div>
                        <div>Product: <span className="text-gray-800">{vuln.matched_product} {vuln.matched_version}</span></div>
                        <div>Published: <span className="text-gray-800">{vuln.published_date}</span></div>
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>
      )}
      </div>
      );
}

// Component for Subdomain Section
function SubdomainSection({ data }: { data: any }) {
  const subdomains = data.subdomains || [];
  const [showAll, setShowAll] = useState(false);
  
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm mb-8 border border-gray-200">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900">
        <FaServer className="text-purple-500" />
        Subdomains ({data.count || 0})
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
        {(showAll ? subdomains : subdomains.slice(0, 30)).map((sub: string, idx: number) => (
          <div key={idx} className="bg-gray-50 p-2 rounded text-sm font-mono truncate">
            {sub}
          </div>
        ))}
      </div>
      
      {subdomains.length > 30 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-4 text-blue-400 hover:text-blue-700 text-sm"
        >
          {showAll ? 'Show Less' : `Show All ${subdomains.length} Subdomains`}
        </button>
      )}
    </div>
  );
}

// Component for Subdirectory Section
function SubdirectorySection({ data }: { data: any }) {
  const [showAllPaths, setShowAllPaths] = useState(false);
  const paths = data.found_paths || [];
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
      
      {/* Phase and Wordlist Information */}
      {wordlistsUsed.length > 0 && (
        <div className="bg-gray-50 p-4 rounded-lg mb-4 border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm font-semibold text-blue-700 mb-2">Scan Phases</div>
              <div className="space-y-1">
                {wordlistsUsed.map((wl: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">
                      Phase {wl.phase}: {wl.name}
                    </span>
                    <span className="text-gray-500">{wl.entries.toLocaleString()} paths</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold text-purple-700 mb-2">Scan Summary</div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Phase Reached:</span>
                  <span className="text-gray-900 font-semibold">Phase {phaseReached}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Mode:</span>
                  <span className="text-white">{aggressiveMode ? 'Aggressive' : 'Standard'}</span>
                </div>
                {phaseReached === 1 && totalTested > 0 && (
                  <div className="text-xs text-gray-500 mt-2">
                    No valid directories found in Phase 1 - Phase 2 skipped
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Scan Statistics */}
      {totalTested > 0 && (
        <div className="bg-gray-50 p-4 rounded-lg mb-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-white">{totalTested.toLocaleString()}</div>
              <div className="text-xs text-gray-500">Paths Tested</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-green-400">{statusCounts['200'] || 0}</div>
              <div className="text-xs text-gray-500">200 OK</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-yellow-400">{statusCounts['403'] || 0}</div>
              <div className="text-xs text-gray-500">403 Forbidden</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-blue-400">{(statusCounts['301'] || 0) + (statusCounts['302'] || 0)}</div>
              <div className="text-xs text-gray-500">Redirects</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-gray-500">{statusCounts['404'] || 0}</div>
              <div className="text-xs text-gray-500">404 Not Found</div>
            </div>
          </div>
        </div>
      )}
      
      {paths.length === 0 ? (
        <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg text-center">
          <FaInfoCircle className="text-blue-400 text-3xl mx-auto mb-3" />
          <div className="text-lg font-semibold text-blue-700 mb-2">No Publicly Accessible Directories Found</div>
          <div className="text-sm text-gray-500">
            {totalTested > 0 ? (
              <>All {totalTested.toLocaleString()} tested paths returned 403/404 responses (filtered by server)</>
            ) : (
              <>This is expected for well-configured production sites</>
            )}
          </div>
        </div>
      ) : (
        <div>
          <div className="text-sm text-gray-400 mb-3">
            Found {paths.length} accessible {paths.length === 1 ? 'directory' : 'directories'}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="p-3 text-left">Path</th>
                  <th className="p-3 text-left">Status Code</th>
                  <th className="p-3 text-left">Size</th>
                </tr>
              </thead>
              <tbody>
                {displayPaths.map((path: any, idx: number) => (
                  <tr key={idx} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="p-3 font-mono">{path.path}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs ${
                        path.status_code.startsWith('2') ? 'bg-green-600' :
                        path.status_code.startsWith('3') ? 'bg-blue-600' :
                        'bg-yellow-600'
                      }`}>
                        {path.status_code}
                      </span>
                    </td>
                    <td className="p-3 text-gray-500">{path.size || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          {hasMore && (
            <button
              onClick={() => setShowAllPaths(!showAllPaths)}
              className="mt-4 w-full py-2 px-4 bg-gray-700 hover:bg-gray-600 rounded transition text-sm"
            >
              {showAllPaths ? 'Show Less' : `+${paths.length - 15} more paths (expand)`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// Component for WebTech Detection Section (Enterprise-Grade)
function WebTechSection({ data }: { data: any }) {
  console.log('WebTech data received:', JSON.stringify(data, null, 2));
  const techs = data.technologies || [];
  const coverage = data.coverage;
  const cdnDetected = data.cdn_detected;
  const cdnName = data.cdn_name;
  const note = data.note;
  
  // Get confidence badge color
  const getConfidenceBadge = (confidence: number) => {
    if (confidence >= 80) return 'bg-green-600';
    if (confidence >= 60) return 'bg-yellow-600';
    return 'bg-orange-600';
  };
  
  // Group by category
  const grouped = techs.reduce((acc: any, tech: any) => {
    if (!acc[tech.category]) {
      acc[tech.category] = [];
    }
    acc[tech.category].push(tech);
    return acc;
  }, {});
  
  return (
    <div className="bg-white p-6 rounded-xl shadow-sm mb-8 border border-gray-200">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900">
        <FaCode className="text-cyan-500" />
        Web Technologies Detected ({data.count || 0})
      </h2>
      
      Coverage/CDN Warning
      {(cdnDetected || coverage === 'minimal' || coverage === 'low-confidence') && note && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-2">
            <FaInfoCircle className="text-blue-400 mt-0.5 flex-shrink-0" />
            <div>
              <div className="text-sm font-semibold text-blue-700 mb-1">
                {cdnDetected ? `CDN Detected: ${cdnName}` : 'Limited Detection'}
              </div>
              <div className="text-xs text-gray-700">{note}</div>
              {coverage === 'minimal' && (
                <div className="mt-2 text-xs text-gray-500">
                  <div className="font-semibold mb-1">Possible reasons:</div>
                  <ul className="list-disc list-inside space-y-0.5 ml-2">
                    <li>Server headers suppressed</li>
                    <li>Client-side rendering (SPA)</li>
                    <li>Edge/proxy hiding origin stack</li>
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* No Technologies Found - Enterprise UX */}
      {techs.length === 0 ? (
        <div className="bg-blue-50 border border-blue-200 p-6 rounded-lg">
          <div className="flex items-start gap-3 mb-4">
            <FaInfoCircle className="text-blue-400 text-2xl flex-shrink-0 mt-1" />
            <div>
              <div className="text-xl font-semibold text-blue-700 mb-2">No Technologies Exposed</div>
              <div className="text-gray-300 mb-3">
                <strong>Reason:</strong>
              </div>
              <ul className="list-disc list-inside space-y-1 text-gray-300 ml-2">
                {cdnDetected && <li>Target is behind {cdnName} or edge proxy</li>}
                <li>Server headers suppressed or minimized</li>
                <li>Client-side rendering detected (minimal HTML shell)</li>
                <li>Strict CSP preventing inline clues</li>
              </ul>
            </div>
          </div>
          
          <div className="border-t border-blue-800 pt-4 mt-4">
            <div className="text-sm font-semibold text-blue-700 mb-2">Confidence:</div>
            <p className="text-sm text-gray-500">Origin stack not observable from public endpoint</p>
          </div>
          
          <div className="border-t border-blue-800 pt-4 mt-4">
            <div className="text-sm font-semibold text-blue-700 mb-2">Recommendation:</div>
            <ul className="list-disc list-inside space-y-1 text-sm text-gray-400 ml-2">
              <li>Scan origin server IP directly (if accessible)</li>
              <li>Enable authenticated scanning for detailed analysis</li>
              <li>Review other security metrics for comprehensive assessment</li>
            </ul>
          </div>
        </div>
      ) : (
        /* Technologies Display */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(grouped).map(([category, items]: [string, any]) => (
            <div key={category} className="bg-gray-50 p-4 rounded-lg border border-gray-100">
              <div className="text-sm font-semibold text-cyan-700 mb-3">{category}</div>
              <div className="space-y-3">
                {items.map((tech: any, idx: number) => (
                  <div key={idx} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-900 font-medium">
                        {tech.name}
                        {tech.version && <span className="text-gray-400 text-sm ml-2">v{tech.version}</span>}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-xs ${getConfidenceBadge(tech.confidence)}`}>
                        {tech.confidence}%
                      </span>
                    </div>
                    
                    {/* Evidence badges */}
                    {tech.evidence && tech.evidence.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {tech.evidence.slice(0, 3).map((ev: any, i: number) => (
                          <span key={i} className="text-xs bg-gray-700 px-2 py-0.5 rounded" title={ev.value}>
                            {ev.type}
                          </span>
                        ))}
                        {tech.evidence.length > 3 && (
                          <span className="text-xs text-gray-500">+{tech.evidence.length - 3} more</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Helper component for info rows
function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-200">
      <span className="text-gray-500 text-sm">{label}</span>
      <span className="text-gray-900 font-mono">{value}</span>
    </div>
  );
}