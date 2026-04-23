import { useEffect, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { AssetLibrary } from './components/AssetLibrary';
import { CompetitiveIntel } from './components/CompetitiveIntel';
import { Settings } from './components/Settings';
import { Queue } from './components/Queue';
import { CanvasBackground } from './components/CanvasBackground';
import { LoadingScreen } from './components/LoadingScreen';
import { LandingView } from './components/LandingView';
import { api, type ApiSession } from './lib/api';

export default function App() {
  const initialView = new URLSearchParams(window.location.search).get('view') ?? 'dashboard';
  const isWaitlistPreview = new URLSearchParams(window.location.search).get('preview') === 'landing';
  const [activeView, setActiveView] = useState(initialView);
  const [session, setSession] = useState<ApiSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Artificial delay to show loading screen
    const timer = setTimeout(() => {
      api.auth.resolveSession()
        .then(setSession)
        .catch(() => setSession(null))
        .finally(() => setLoading(false));
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  // Show waitlist ONLY on specific preview URL
  if (isWaitlistPreview) {
    return <LandingView />;
  }

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <>
      <div className="size-full flex bg-black text-zinc-100 relative overflow-hidden">
        {/* Canvas dot-matrix background */}
        <div className="absolute inset-0 z-0">
          <CanvasBackground
            colors={[[255, 255, 255]]}
            opacities={[0.02, 0.02, 0.02, 0.03, 0.03, 0.04, 0.05, 0.06, 0.07, 0.08]}
            dotSize={2}
            totalSize={22}
            showGradient={false}
          />
          {/* center vignette */}
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_130%_100%_at_50%_50%,_rgba(0,0,0,0.88)_0%,_rgba(0,0,0,0.5)_55%,_transparent_100%)]" />
          {/* top fade */}
          <div className="absolute top-0 left-0 right-0 h-24 bg-gradient-to-b from-black/70 to-transparent" />
          {/* ambient glows */}
          <div className="absolute top-[-15%] left-[-5%] w-[50vw] h-[50vw] bg-[radial-gradient(circle_at_center,_rgba(16,185,129,0.06),transparent_70%)] pointer-events-none" />
          <div className="absolute top-[20%] right-[-15%] w-[60vw] h-[60vw] bg-[radial-gradient(circle_at_center,_rgba(139,92,246,0.06),transparent_70%)] pointer-events-none" />
          <div className="absolute bottom-[-20%] left-[15%] w-[70vw] h-[70vw] bg-[radial-gradient(circle_at_center,_rgba(6,182,212,0.05),transparent_70%)] pointer-events-none" />
        </div>

        <Sidebar activeView={activeView} onViewChange={setActiveView} />

        <main className="flex-1 overflow-auto relative z-10">
          {activeView === 'dashboard' && (
            <DashboardView session={session} />
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