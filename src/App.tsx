// ==========================================
// 应用主组件
// ==========================================
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './components/auth/AuthContext';
import { Toaster } from "sonner";

const queryClient = new QueryClient();

const routerOptions = {
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true
  }
};

// 懒加载路由组件
const HomePage = lazy(() => import('./pages/HomePage'));
const MoviePage = lazy(() => import('./pages/MoviePage'));
const TVShowPage = lazy(() => import('./pages/TVShowPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const UserProfilePage = lazy(() => import('./pages/UserProfilePage'));
const FavoriteListPage = lazy(() => import('./pages/FavoriteListPage'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const AuthConfirmPage = lazy(() => import('./pages/AuthConfirmPage'));
const AuthErrorPage = lazy(() => import('./pages/AuthErrorPage'));

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter {...routerOptions}>
          <div className="min-h-screen bg-gray-50">
            <Suspense fallback={<div className="flex items-center justify-center min-h-screen">加载中...</div>}>
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/movie/:id" element={<MoviePage />} />
                <Route path="/tv/:id" element={<TVShowPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/auth/confirm" element={<AuthConfirmPage />} />
                <Route path="/auth/auth-code-error" element={<AuthErrorPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route path="/favorite-lists/:id" element={<FavoriteListPage />} />
                <Route path="/profile/:id" element={<UserProfilePage />} />
              </Routes>
            </Suspense>
          </div>
        </BrowserRouter>
        <Toaster position="top-center" />
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;