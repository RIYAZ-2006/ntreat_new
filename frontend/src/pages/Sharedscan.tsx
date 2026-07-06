import { FaSpinner, FaClock, FaTimes } from 'react-icons/fa';

export function LoadingCard({ service, status }: { service: string; status: string }) {
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
      <div className="flex items-center justify-center h-32 bg-gray-50 rounded-lg border border-gray-100">
        {status === 'processing' ? (
          <div className="text-center">
            <FaSpinner className="text-3xl text-yellow-400 animate-spin mx-auto mb-2" />
            <p className="text-gray-500">Scanning in progress…</p>
            <p className="text-xs text-gray-400 mt-1">This may take 5–20 minutes</p>
          </div>
        ) : status === 'failed' ? (
          <div className="text-center">
            <FaTimes className="text-3xl text-red-400 mx-auto mb-2" />
            <p className="text-gray-500">Scan failed</p>
          </div>
        ) : (
          <div className="text-center">
            <FaClock className="text-3xl text-gray-500 mx-auto mb-2" />
            <p className="text-gray-500">Waiting to start…</p>
          </div>
        )}
      </div>
    </div>
  );
}

export function PageSpinner() {
  return (
    <div className="flex items-center justify-center h-64">
      <FaSpinner className="text-4xl animate-spin text-blue-500" />
    </div>
  );
}