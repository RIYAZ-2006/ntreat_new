import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import api from '../api/client';

export interface ScanData {
  scan_id: string;
  domain: string;
  service: string;
  status: string;
  created_at: string;
  completed_at?: string;
  results?: any;
  error?: string;
}

export interface ScanSummary {
  domain: string;
  domain_name: string | null;
  status: 'not_started' | 'in_progress' | 'completed';
  scans: Record<string, ScanData>;
  score: any;
  fast_services: { total: number; completed: number };
  slow_services: { total: number; completed: number };
}

interface ScanContextValue {
  domain: string | undefined;
  summary: ScanSummary | null;
  loading: boolean;
  scans: Record<string, ScanData>;
}

const ScanContext = createContext<ScanContextValue | null>(null);

export function ScanProvider({ children }: { children: React.ReactNode }) {
  const { domain } = useParams<{ domain: string }>();
  const [summary, setSummary] = useState<ScanSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!domain) return;

    const fetchInitial = async () => {
      try {
        const res = await api.get(`/scoring/scan/summary/${domain}`);
        setSummary(res.data);
        setLoading(false);
        if (res.data.status === 'in_progress') startSSE();
      } catch (err) {
        console.error('Failed to fetch scan summary:', err);
        setLoading(false);
      }
    };

    const startSSE = () => {
      eventSourceRef.current?.close();
      const baseURL = api.defaults.baseURL || 'http://localhost:5000';
      const eventSource = new EventSource(`${baseURL}/scoring/scan/stream/${domain}`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data?.scans) setSummary(data);
          if (data.status === 'completed') eventSource.close();
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
    return () => { eventSourceRef.current?.close(); };
  }, [domain]);

  return (
    <ScanContext.Provider value={{ domain, summary, loading, scans: summary?.scans || {} }}>
      {children}
    </ScanContext.Provider>
  );
}

export function useScanContext() {
  const ctx = useContext(ScanContext);
  if (!ctx) throw new Error('useScanContext must be used inside ScanProvider');
  return ctx;
}