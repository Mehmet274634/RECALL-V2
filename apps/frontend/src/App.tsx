import { Routes, Route } from 'react-router-dom';

import LandingPage from './pages/landing/LandingPage';
import LoginPage from './pages/LoginPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      {/* Faz 2: Secretary dashboard routes will be added here, wrapped in SecretaryLayout */}
    </Routes>
  );
}

export default App;
