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
import { CanvasBackground } from './components/CanvasBackground';
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
      <div className="size-full flex bg-black text-zinc-100 relative overflow-hidden">
        {/* Canvas dot matrix background - full screen */}
        <div className="absolute inset-0 z-0">
          <CanvasBackground
            colors={[[255, 255, 255]]}
            opacities={[0.02, 0.02, 0.03, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08, 0.10]}
            dotSize={2}
            totalSize={22}
            showGradient={false}
          />
          {/* Radial dark vignette center so content is readable */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_120%_100%_at_50%_50%,_rgba(0,0,0,0.85)_0%,_rgba(0,0,0,0.4)_60%,_transparent_100%)]" />
          {/* Top gradient for navbar clarity */}
          <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-black/80 to-transparent" />
          {/* Bottom gradient */}
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/60 to-transparent" />
          {/* Ambient color blobs */}
          <div className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-500/8 via-emerald-500/0 to-transparent blur-[80px] pointer-events-none rounded-full mix-blend-screen" />
          <div className="absolute top-[30%] right-[-20%] w-[70vw] h-[70vw] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-violet-600/8 via-violet-600/0 to-transparent blur-[100px] pointer-events-none rounded-full mix-blend-screen" />
          <div className="absolute bottom-[-30%] left-[20%] w-[80vw] h-[80vw] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-cyan-500/8 via-cyan-500/0 to-transparent blur-[120px] pointer-events-none rounded-full mix-blend-screen" />
        </div>

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