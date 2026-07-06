import { useScanData } from '../Userscandata';
import { LoadingCard, PageSpinner } from '../Sharedscan';
import { FaMapMarkerAlt } from 'react-icons/fa';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconRetinaUrl: markerIcon2x, iconUrl: markerIcon, shadowUrl: markerShadow });

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

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm mb-8 border border-gray-200">
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2 text-gray-900">
        <FaMapMarkerAlt className="text-red-500" />
        IP Geolocation
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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