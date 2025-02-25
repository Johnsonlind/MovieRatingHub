import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import HomePage from './pages/HomePage';
import MoviePage from './pages/MoviePage';
import TVShowPage from './pages/TVShowPage';

const queryClient = new QueryClient();

// 配置 Router 的未来特性
const routerOptions = {
  future: {
    v7_startTransition: true,
    v7_relativeSplatPath: true
  }
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router {...routerOptions}>
        <div className="min-h-screen bg-gray-50">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/movie/:id" element={<MoviePage />} />
            <Route path="/tv/:id" element={<TVShowPage />} />
          </Routes>
        </div>
      </Router>
    </QueryClientProvider>
  );
}

export default App;