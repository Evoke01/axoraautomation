import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { MetricsOverview } from './components/MetricsOverview';
import { UploadZone } from './components/UploadZone';
import { PerformanceFeed } from './components/PerformanceFeed';
import { AssetLibrary } from './components/AssetLibrary';
import { CompetitiveIntel } from './components/CompetitiveIntel';
import { Settings } from './components/Settings';
import { Queue } from './components/Queue';
import { api, type ApiSession } from './lib/api';

export default function App() {
  const initialView = new URLSearchParams(window.location.search).get('view') ?? 'dashboard';
  const [activeView, setActiveView] = useState(initialView);
  const [session, setSession] = useState<ApiSession | null>(null);
  const [dashboardKey, setDashboardKey] = useState(0);

  useEffect(() => {
    api.auth.resolveSession()
      .then(setSession)
      .catch(() => setSession(null));
  }, []);

  function handleUploaded() {
    setDashboardKey(k => k + 1);
  }

  return (
    <div className="size-full flex bg-zinc-950 text-zinc-100 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-500/15 via-emerald-500/0 to-transparent blur-[80px] pointer-events-none rounded-full mix-blend-screen" />
      <div className="absolute top-[30%] right-[-20%] w-[70vw] h-[70vw] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-violet-600/15 via-violet-600/0 to-transparent blur-[100px] pointer-events-none rounded-full mix-blend-screen" />
      <div className="absolute bottom-[-30%] left-[20%] w-[80vw] h-[80vw] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-cyan-500/15 via-cyan-500/0 to-transparent blur-[120px] pointer-events-none rounded-full mix-blend-screen" />
      <div className="absolute inset-0 bg-black/40 pointer-events-none mix-blend-overlay" />

      <Sidebar activeView={activeView} onViewChange={setActiveView} />

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
  );
}

