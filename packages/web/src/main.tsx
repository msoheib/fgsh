import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/index.css';
import { initializeSupabase } from '@fakash/shared';

// Initialize Supabase client for web
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (supabaseUrl && supabaseAnonKey) {
  initializeSupabase(supabaseUrl, supabaseAnonKey);
} else {
  console.error('❌ Supabase credentials missing. Check .env.local file.');
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
