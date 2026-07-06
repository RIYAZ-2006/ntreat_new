import { useAuth } from '../context/AuthContext';
import { Navigate, Outlet, Link } from 'react-router-dom';
import {
  FaShieldAlt,
  FaBell,
  FaQuestionCircle,
  FaSignOutAlt
} from 'react-icons/fa';

export default function Layout() {
  const { user, logout, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-700 text-xl">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Top Navbar */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="h-16 px-6 flex items-center justify-between">

          {/* Left Section */}
          <div className="flex items-center gap-10">

            <Link
              to="/"
              className="flex items-center gap-3"
            >
              <FaShieldAlt className="text-blue-600 text-2xl" />
              <span className="font-bold text-xl text-gray-900">
                NTREAT
              </span>
            </Link>

          </div>

          {/* Search */}
          <div className="hidden lg:block w-[500px]">
            <input
              type="text"
              placeholder="Search companies, domains, reports..."
              className="
                w-full
                px-4
                py-2
                border
                border-gray-300
                rounded-lg
                bg-white
                text-gray-700
                placeholder-gray-400
                focus:outline-none
                focus:ring-2
                focus:ring-blue-500
              "
            />
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-5">

            <FaQuestionCircle
              className="text-gray-500 hover:text-blue-600 cursor-pointer transition-colors"
              size={18}
            />

            <FaBell
              className="text-gray-500 hover:text-blue-600 cursor-pointer transition-colors"
              size={18}
            />

            <div className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold shadow-sm">
              {user.email[0].toUpperCase()}
            </div>

            <button
              onClick={logout}
              className="flex items-center gap-2 text-gray-500 hover:text-red-500 transition-colors"
            >
              <FaSignOutAlt size={18} />
            </button>

          </div>
        </div>
      </header>

      {/* Secondary Navigation */}
      <div className="bg-white border-b border-gray-200">
        <div className="h-12 px-6 flex items-center gap-8 text-sm font-medium text-gray-600">

          <Link
            to="/"
            className="hover:text-blue-600 transition-colors"
          >
            Home
          </Link>

          <button className="hover:text-blue-600 transition-colors">
            Organization
          </button>

          <button className="hover:text-blue-600 transition-colors">
            Companies
          </button>

          <button className="hover:text-blue-600 transition-colors">
            Reports
          </button>

        </div>
      </div>

      {/* Page Content */}
      <main className="p-6">
        <Outlet />
      </main>

    </div>
  );
}