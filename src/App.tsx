// ==========================================
// 应用主组件
// ==========================================
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './components/auth/AuthContext';
import HomePage from './pages/HomePage';
import MoviePage from './pages/MoviePage';
import TVShowPage from './pages/TVShowPage';
import ProfilePage from './pages/ProfilePage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import AuthConfirmPage from './pages/AuthConfirmPage';
import AuthErrorPage from './pages/AuthErrorPage';

const queryClient = new QueryClient();

const routerOptions = {
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true
  }
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router {...routerOptions}>
          <div className="min-h-screen bg-gray-50">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/movie/:id" element={<MoviePage />} />
              <Route path="/tv/:id" element={<TVShowPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/auth/confirm" element={<AuthConfirmPage />} />
              <Route path="/auth/auth-code-error" element={<AuthErrorPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
            </Routes>
          </div>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;