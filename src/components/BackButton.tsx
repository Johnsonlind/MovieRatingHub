import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function BackButton() {
  const navigate = useNavigate();

  return (
    <button
      onClick={() => navigate(-1)}
      className="fixed top-2 sm:top-4 left-2 sm:left-4 z-10 bg-white/80 backdrop-blur-sm hover:bg-white/90 p-1.5 sm:p-2 rounded-full shadow-lg transition-colors"
      aria-label="Go back"
    >
      <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6 text-gray-700" />
    </button>
  );
}