import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { Login, Register, Home, Overview_page,ScanDetails} from './pages';
import Layout from './components/Layout';
import ScandetailsLayout from './components/ScanDetailsLayout';

// Scan service pages
import DnsPage         from './pages/scan_pages/Dns_section';
import IpPage          from './pages/scan_pages/Ipscan';
import SslPage         from './pages/scan_pages/Ssl';
import WebtechPage     from './pages/scan_pages/Web_tech';
import HttpSecurityPage from './pages/scan_pages/Httpsecurity';
import CvePage         from './pages/scan_pages/Cve_page';
import SubdomainPage   from './pages/scan_pages/SubdomainPage';
import SubdirectoryPage from './pages/scan_pages/SubdirectoryPage';
import ScoreFactorsPage from './pages/ScoreFactor';


function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Main layout: navbar + sidebar */}
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />

            {/* Scan details: dedicated two-column layout with left sidebar */}
            <Route path="/scan/:domain" element={<ScandetailsLayout />}>
              <Route index              element={<Overview_page />} />
              <Route path='score'       element={<ScoreFactorsPage />} />
              <Route path="dns"         element={<DnsPage />} />
              <Route path="ip"          element={<IpPage />} />
              <Route path="ssl"         element={<SslPage />} />
              <Route path="webtech"     element={<WebtechPage />} />
              <Route path="http_security" element={<HttpSecurityPage/>}/>
              <Route path="cve"         element={<CvePage />} />
              <Route path="subdomain"   element={<SubdomainPage />} />
              <Route path="subdirectory" element={<SubdirectoryPage />} /> 
              <Route path="scandetails"  element ={<ScanDetails/>}/>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;