import { useScanData } from '../Userscandata';
import { LoadingCard, PageSpinner } from '../Sharedscan';
import { FaMapMarkerAlt, FaExclamationTriangle, FaCheckCircle } from 'react-icons/fa';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

const PORT_NAMES: Record<number, string> = {
  21: 'FTP', 23: 'Telnet', 3389: 'RDP', 5900: 'VNC', 1433: 'MSSQL',
  3306: 'MySQL', 27017: 'MongoDB', 6379: 'Redis', 9200: 'Elasticsearch', 11211: 'Memcached',
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-gray-100">
      <span className="text-gray-500 text-sm">{label}</span>
      <span className="text-gray-900 font-mono text-sm">{value}</span>
    </div>
  );
}

export default function IpPage() {
  const { loading, scans } = useScanData();

  if (loading) return <PageSpinner />;

  const scan = scans['ip'];
  if (!scan || scan.status !== 'completed' || !scan.results) {
    return <LoadingCard service="IP Geolocation" status={scan?.status || 'queued'} />;
  }

  const data = scan.results;
  const position: [number, number] = [data.lat || 0, data.lon || 0];
  const openPorts: number[] = data.open_ports || [];
  const reverseDns = data.reverse_dns || {};
  const geoAnomaly = data.geo_anomaly;

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm mb-8 border border-gray-200">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900">
        <FaMapMarkerAlt className="text-red-500" />
        IP Geolocation
      </h2>

      {geoAnomaly && (
        <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-2 text-amber-700 text-sm">
            <FaExclamationTriangle className="mt-0.5 flex-shrink-0" />
            <span>{geoAnomaly}</span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="space-y-1">
          <InfoRow label="IP Address" value={data.query} />
          <InfoRow label="Country" value={`${data.country} (${data.countryCode})`} />
          <InfoRow label="Region" value={`${data.regionName}, ${data.region}`} />
          <InfoRow label="City" value={data.city} />
          <InfoRow label="ISP" value={data.isp} />
          <InfoRow label="Organization" value={data.org} />
          <InfoRow label="AS" value={data.as} />
          <InfoRow label="Timezone" value={data.timezone} />
          <InfoRow label="Coordinates" value={`${data.lat}, ${data.lon}`} />
          <InfoRow label="Reverse DNS" value={reverseDns.hostname || 'Not resolved'} />
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

      <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
        <div className="text-sm font-semibold text-gray-700 mb-3">Open Risky Ports</div>
        {openPorts.length === 0 ? (
          <div className="flex items-center gap-1.5 text-xs text-green-700">
            <FaCheckCircle className="text-green-400" /> No commonly-risky ports found open
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {openPorts.map((port) => (
              <span key={port} className="text-xs font-mono px-2 py-1 rounded bg-red-100 text-red-700 border border-red-200">
                {port} {PORT_NAMES[port] ? `(${PORT_NAMES[port]})` : ''}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}