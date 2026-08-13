import { useState } from 'react';
import Header from './components/Header.jsx';
import Landing from './pages/Landing.jsx';
import BatchPage from './pages/BatchPage.jsx';

export default function App() {
  const [view, setView] = useState('landing');

  return (
    <div className="min-h-screen bg-fv-bg">
      <Header view={view} onNavigate={setView} />
      {view === 'landing' && <Landing />}
      {view === 'batch' && <BatchPage />}
    </div>
  );
}
