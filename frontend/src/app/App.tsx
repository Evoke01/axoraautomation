import { useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { Sidebar } from './components/Sidebar';
import { MetricsOverview } from './components/MetricsOverview';
import { UploadZone } from './components/UploadZone';
import { PerformanceFeed } from './components/PerformanceFeed';
import { AssetLibrary } from './components/AssetLibrary';
import { CompetitiveIntel } from './components/CompetitiveIntel';
import { Settings } from './components/Settings';
import { Queue } from './components/Queue';
import { GeometricBackground } from './components/GeometricBackground';
import { LoadingScreen } from './components/LoadingScreen';
import { api, type ApiSession } from './lib/api';

export default function App() {
  const initialView = new URLSearchParams(window.location.search).get('view') ?? 'dashboard';
  const [activeView, setActiveView] = useState(initialView);
  const [session, setSession] = useState<ApiSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [dashboardKey, setDashboardKey] = useState(0);

  useEffect(() => {
    api.auth.resolveSession()
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, []);

  function handleUploaded() {
    setDashboardKey((k: number) => k + 1);
  }

  if (loading) return <LoadingScreen />;

  return (
    <>
      <div className="size-full flex bg-[#030303] text-zinc-100 relative overflow-hidden">
        {/* Geometric theme background */}
        <GeometricBackground />

        {/* Sidebar */}
        <Sidebar activeView={activeView} onViewChange={setActiveView} />

        {/* Main content */}
        <main className="flex-1 overflow-auto relative z-10">
          {activeView === 'dashboard' && (
            <div className="p-8 space-y-8">
              <MetricsOverview key={dashboardKey} />
              <UploadZone session={session} onUploaded={handleUploaded} />
              <PerformanceFeed key={dashboardKey} />
            </div>
          )}
          {activeView === 'queue' && <div className="p-8"><Queue /></div>}
          {activeView === 'assets' && <div className="p-8"><AssetLibrary /></div>}
          {activeView === 'intelligence' && <div className="p-8"><CompetitiveIntel /></div>}
          {activeView === 'settings' && <div className="p-8"><Settings /></div>}
        </main>
      </div>
      <Analytics />
    </>
  );
}