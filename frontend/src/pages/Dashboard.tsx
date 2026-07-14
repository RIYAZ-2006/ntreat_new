import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/client';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title } from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, Title);

export default function Dashboard() {
    const [searchParams] = useSearchParams();
    const [domain, setDomain] = useState('');
    const [loading, setLoading] = useState(false);
    const [scoreData, setScoreData] = useState<any>(null);
    const [error, setError] = useState('');
    const [recentScans, setRecentScans] = useState<any[]>([]);

    useEffect(() => {
        const domainFromUrl = searchParams.get('domain');
        if (domainFromUrl) {
            setDomain(domainFromUrl);
            setTimeout(() => {
                fetchScoreForDomain(domainFromUrl);
            }, 2000);
        }
        fetchRecentScans();
    }, [searchParams]);

    const fetchRecentScans = async () => {
        try {
            const res = await api.get('/scoring/scans/recent');
            setRecentScans(res.data.scans || []);
        } catch (err) {
            console.error('Failed to fetch recent scans:', err);
        }
    };

    const fetchScoreForDomain = async (targetDomain: string) => {
        let cleanDomain = targetDomain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');

        if (!cleanDomain) {
            setError('Please enter a domain');
            return;
        }

        setLoading(true);
        setError('');
        setScoreData(null);

        try {
            let res = await api.get(`/scoring/domain/${cleanDomain}`);
            setScoreData(res.data);
        } catch (err: any) {
            if (err.response && err.response.status === 404) {
               try {
                  const calcRes = await api.post('/scoring/calculate', { domain: cleanDomain });
                  setScoreData(calcRes.data);
               } catch (calcErr) {
                  setError('No scan data found. Scans may still be processing. Please wait and try again.');
               }
            } else {
               setError('Failed to fetch dashboard data.');
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchScore = async (e?: React.FormEvent) => {
        if(e) e.preventDefault();
        fetchScoreForDomain(domain);
    };

    const getGradeColor = (grade: string) => {
        switch(grade) {
            case 'A': case 'A+': return 'text-green-500';
            case 'B': return 'text-lime-400';
            case 'C': return 'text-yellow-400';
            case 'D': return 'text-orange-500';
            default: return 'text-red-500';
        }
    }

    const serviceScores = scoreData?.service_scores || {};
    const skippedServices: string[] = scoreData?.skipped_services || [];
    const serviceWeights = scoreData?.service_weights || {};

    return (
        <div className="max-w-6xl mx-auto">
            <h1 className="text-3xl font-bold mb-8">Security Dashboard</h1>

            <div className="bg-gray-800 p-6 rounded-lg shadow-lg mb-8 flex gap-4">
               <input
                 type="text"
                 placeholder="Search domain results..."
                 value={domain}
                 onChange={(e) => setDomain(e.target.value)}
                 className="flex-1 bg-gray-700 text-white px-4 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
               />
               <button
                 onClick={fetchScore}
                 disabled={loading}
                 className="bg-blue-600 px-6 py-2 rounded font-bold hover:bg-blue-700"
               >
                 View Report
               </button>
            </div>

            {error && (
                <div className="bg-red-900/50 border border-red-500 text-red-200 p-4 rounded mb-8">
                    {error}
                </div>
            )}

            {!scoreData && !loading && (
                <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                    <h3 className="text-xl font-bold mb-4">Recent Scans</h3>
                    {recentScans.length === 0 ? (
                        <p className="text-gray-400">
                            No scans yet. Visit the <a href="/scans" className="text-blue-400 hover:underline">New Scan</a> page to start your first analysis.
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="border-b border-gray-700">
                                    <tr className="text-gray-400 text-sm">
                                        <th className="pb-2 pr-4">Domain</th>
                                        <th className="pb-2 pr-4">Service</th>
                                        <th className="pb-2 pr-4">Status</th>
                                        <th className="pb-2">Created</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentScans.map((scan: any) => (
                                        <tr key={scan.scan_id} className="border-b border-gray-700/50 hover:bg-gray-700/30">
                                            <td className="py-2 pr-4">
                                                <button
                                                    onClick={() => {
                                                        setDomain(scan.domain);
                                                        fetchScoreForDomain(scan.domain);
                                                    }}
                                                    className="text-blue-400 hover:underline"
                                                >
                                                    {scan.domain}
                                                </button>
                                            </td>
                                            <td className="py-2 pr-4 capitalize">{scan.service}</td>
                                            <td className="py-2 pr-4">
                                                <span className={`px-2 py-1 rounded text-xs ${
                                                    scan.status === 'completed' ? 'bg-green-900/50 text-green-400' :
                                                    scan.status === 'failed' ? 'bg-red-900/50 text-red-400' :
                                                    scan.status === 'processing' ? 'bg-yellow-900/50 text-yellow-400' :
                                                    'bg-gray-700 text-gray-400'
                                                }`}>
                                                    {scan.status}
                                                </span>
                                            </td>
                                            <td className="py-2 text-gray-400 text-sm">
                                                {new Date(scan.created_at).toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {scoreData && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                        <div className="bg-gray-800 p-6 rounded-lg shadow-lg text-center md:col-span-1">
                            <h3 className="text-gray-400 mb-2 uppercase text-sm font-bold">Overall Grade</h3>
                            <div className={`text-9xl font-black ${getGradeColor(scoreData.grade)}`}>
                                {scoreData.grade}
                            </div>
                            <div className="text-3xl font-bold mt-2 text-white">
                                {scoreData.score} <span className="text-lg text-gray-500">/ 100</span>
                            </div>
                        </div>

                        <div className="bg-gray-800 p-6 rounded-lg shadow-lg md:col-span-2">
                             <h3 className="text-xl font-bold mb-4 border-b border-gray-700 pb-2">Analysis Details</h3>
                             {(!scoreData.details || scoreData.details.length === 0) ? (
                                 <p className="text-green-400">No major issues detected.</p>
                             ) : (
                                 <ul className="space-y-3 max-h-64 overflow-y-auto pr-2">
                                     {scoreData.details.map((detail: string, i: number) => (
                                         <li key={i} className="flex items-start gap-2 text-red-300 bg-red-900/20 p-2 rounded">
                                             <span>•</span>
                                             <span>{detail}</span>
                                         </li>
                                     ))}
                                 </ul>
                             )}

                             <div className="mt-6">
                                <h4 className="font-bold mb-2 text-gray-400">Modules Analyzed:</h4>
                                <div className="flex flex-wrap gap-2">
                                    {(scoreData.components_analyzed || []).map((c: string) => (
                                        <span key={c} className="bg-gray-700 px-3 py-1 rounded-full text-sm capitalize">
                                            {c}
                                        </span>
                                    ))}
                                </div>
                             </div>

                             {skippedServices.length > 0 && (
                                <div className="mt-4">
                                    <h4 className="font-bold mb-2 text-gray-400">Skipped (no data / failed):</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {skippedServices.map((c: string) => (
                                            <span key={c} className="bg-gray-900 border border-gray-700 text-gray-500 px-3 py-1 rounded-full text-sm capitalize">
                                                {c}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                             )}
                        </div>
                    </div>

                    {/* Per-service breakdown — new, matches service_scores in the scores doc */}
                    <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                        <h3 className="text-xl font-bold mb-4 border-b border-gray-700 pb-2">Per-Service Breakdown</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {Object.entries(serviceScores).map(([service, breakdown]: [string, any]) => (
                                <div key={service} className="bg-gray-900 border border-gray-700 rounded-lg p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="font-semibold capitalize text-gray-200">{service}</span>
                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-gray-500">weight {((serviceWeights[service] || 0) * 100).toFixed(0)}%</span>
                                            <span className={`font-bold ${getGradeColor(breakdown.grade)}`}>{breakdown.grade}</span>
                                            <span className="text-gray-400 text-sm">{breakdown.score}/100</span>
                                        </div>
                                    </div>
                                    {breakdown.skipped && (
                                        <div className="text-xs text-gray-500 italic mb-1">Skipped — no usable data</div>
                                    )}
                                    {breakdown.details?.length > 0 && (
                                        <ul className="text-xs text-gray-400 space-y-1 mt-2">
                                            {breakdown.details.slice(0, 4).map((d: string, i: number) => (
                                                <li key={i}>• {d}</li>
                                            ))}
                                            {breakdown.details.length > 4 && (
                                                <li className="text-gray-600">…and {breakdown.details.length - 4} more</li>
                                            )}
                                        </ul>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}