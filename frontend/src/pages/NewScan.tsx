import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/client';
import { FaGlobe, FaSearch } from 'react-icons/fa';

export default function NewScan() {
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const navigate = useNavigate();

  const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

  const startScans = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!domain) return;
    
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '');

    setLoading(true);
    setLogs([]);
    addLog(`Starting analysis for: ${cleanDomain}`);
    
    const services = ['dns', 'ip', 'ssl', 'webtech', 'subdomain', 'subdirectory', 'cve'];
    
    try {
      const promises = services.map(service => 
        api.post(`/${service}/scan`, { domain: cleanDomain })
           .then(() => addLog(`Started ${service.toUpperCase()} scan...`))
           .catch(err => addLog(`Failed to start ${service}: ${err.message}`))
      );
      
      await Promise.all(promises);
      addLog('All scans queued successfully.');
      addLog('Redirecting to Dashboard...');
      
      setTimeout(() => {
        navigate(`/?domain=${encodeURIComponent(cleanDomain)}`);
      }, 1500);
      
    } catch (err: any) {
      addLog(`Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Start New Security Assessment</h1>
        <p className="text-gray-500 text-sm mt-1">Enter a domain to run a full security scan across all services</p>
      </div>
      
      <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 mb-6">
        <form onSubmit={startScans} className="flex gap-3">
          <div className="flex-1 relative">
            <FaGlobe className="absolute left-3 top-3.5 text-gray-400" />
            <input 
              type="text" 
              placeholder="Enter domain (e.g., example.com)"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              className="w-full bg-gray-50 text-gray-900 border border-gray-300 pl-10 pr-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
            />
          </div>
          <button 
            type="submit"
            disabled={loading || !domain}
            className={`px-6 py-3 rounded-lg font-semibold flex items-center gap-2 text-sm transition-all shadow-sm ${
              loading || !domain 
                ? 'bg-gray-100 text-gray-400 cursor-not-allowed border border-gray-200' 
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {loading ? 'Queueing...' : <><FaSearch /> Scan Target</>}
          </button>
        </form>
      </div>
      
      {logs.length > 0 && (
        <div className="bg-gray-900 p-6 rounded-xl font-mono text-sm h-64 overflow-y-auto border border-gray-300 shadow-sm">
          {logs.map((log, i) => (
            <div key={i} className="mb-1 text-green-400">
              <span className="text-gray-500 mr-2">$</span>
              {log}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}