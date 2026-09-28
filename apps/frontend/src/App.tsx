import { Routes, Route, Navigate } from 'react-router-dom';

import LandingPage from './pages/landing/LandingPage';
import LoginPage from './pages/LoginPage';
import SignUpPage from './pages/SignUpPage';
import SecretaryLayout from './components/layout/SecretaryLayout';
import DashboardPage from './pages/dashboard/DashboardPage';
import CallsPage from './pages/dashboard/CallsPage';
import DoctorsPage from './pages/dashboard/DoctorsPage';
import ClinicSettingsPage from './pages/dashboard/ClinicSettingsPage';
import ReportsPage from './pages/dashboard/ReportsPage';
import AdminLayout from './components/layout/AdminLayout';
import AdminClinicsPage from './pages/admin/AdminClinicsPage';
import AdminNewClinicPage from './pages/admin/AdminNewClinicPage';
import { ProtectedRoute } from './components/auth/ProtectedRoute';

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login/*" element={<LoginPage />} />
      <Route path="/sign-up/*" element={<SignUpPage />} />

      {/* Secretary Dashboard Shell */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute requiredRole="secretary">
            <SecretaryLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="calls" element={<CallsPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="doctors" element={<DoctorsPage />} />
        <Route path="settings" element={<ClinicSettingsPage />} />
        {/* Redirect unknown dashboard sub-routes */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>

      {/* Admin Management Shell */}
      <Route
        path="/admin"
        element={
          <ProtectedRoute requiredRole="admin">
            <AdminLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<AdminClinicsPage />} />
        <Route path="new" element={<AdminNewClinicPage />} />
        <Route path="*" element={<Navigate to="/admin" replace />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;

