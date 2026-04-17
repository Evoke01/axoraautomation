import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Analytics } from '@vercel/analytics/react';
import { Sidebar } from './components/Sidebar';
import { MetricsOverview } from './components/MetricsOverview';
import { UploadZone } from './components/UploadZone';
import { PerformanceFeed } from './components/PerformanceFeed';
import { AssetLibrary } from './components/AssetLibrary';
import { CompetitiveIntel } from './components/CompetitiveIntel';
import { Settings } from './components/Settings';
import { Queue } from './components/Queue';
import { LoadingScreen } from './components/LoadingScreen';
import { api, type ApiSession } from './lib/api';

export default function App() {
  const initialView = new URLSearchParams(window.location.search).get('view') ?? 'dashboard';
  const [activeView, setActiveView] = useState(initialView);
  const [session, setSession] = useState<ApiSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [dashboardKey, setDashboardKey] = useState(0);

  // AUTH BYPASS: We assume the user is authenticated for now to allow direct access to the rework.
  // We still try to resolve the session in the background for real data but don't block.
  useEffect(() => {
    // Artificial delay to show off the premium loading screen
    const timer = setTimeout(() => {
      api.auth.resolveSession()
        .then(setSession)
        .catch(() => {
          console.warn("Auth session could not be resolved, using bypass mode.");
          // Create a mock session if needed or just leave as null
        })
        .finally(() => setLoading(false));
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  function handleUploaded() {
    setDashboardKey((k: number) => k + 1);
  }

  return (
    <div className="size-full min-h-screen bg-[#030303] text-zinc-100 relative overflow-hidden font-sans selection:bg-indigo-500/30">
      <AnimatePresence mode="wait">
        {loading ? (
          <LoadingScreen key="loader" />
        ) : (
          <motion.div
            key="app-main"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, ease: [0.23, 0.86, 0.39, 0.96] }}
            className="flex size-full relative z-10"
          >
            {/* Cinematic Background Glows */}
            <div className="fixed inset-0 pointer-events-none z-0">
               <div className="absolute top-[-20%] left-[-10%] w-[60vw] h-[60vw] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-500/12 via-emerald-500/0 to-transparent blur-[120px] rounded-full mix-blend-screen animate-pulse" style={{ animationDuration: '8s' }} />
               <div className="absolute top-[30%] right-[-20%] w-[70vw] h-[70vw] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-violet-600/12 via-violet-600/0 to-transparent blur-[140px] rounded-full mix-blend-screen animate-pulse" style={{ animationDuration: '12s' }} />
               <div className="absolute bottom-[-30%] left-[20%] w-[80vw] h-[80vw] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-cyan-500/12 via-cyan-500/0 to-transparent blur-[160px] rounded-full mix-blend-screen animate-pulse" style={{ animationDuration: '10s' }} />
            </div>

            <Sidebar activeView={activeView} onViewChange={setActiveView} />

            <main className="flex-1 overflow-auto relative z-10 scroll-smooth">
               <AnimatePresence mode="wait">
                <motion.div
                  key={activeView}
                  initial={{ opacity: 0, y: 10, scale: 0.99 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -10, scale: 0.99 }}
                  transition={{ duration: 0.5, ease: [0.23, 0.86, 0.39, 0.96] }}
                  className="min-h-full"
                >
                  {activeView === 'dashboard' && (
                    <div className="p-8 space-y-8 max-w-7xl mx-auto">
                      <header className="mb-10">
                        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Neural Dashboard</h1>
                        <p className="text-zinc-500 text-sm font-medium">Real-time content performance and autonomous optimization.</p>
                      </header>
                      <MetricsOverview key={dashboardKey} />
                      <UploadZone session={session} onUploaded={handleUploaded} />
                      <PerformanceFeed key={dashboardKey} />
                    </div>
                  )}
                  {activeView === 'queue' && <div className="p-8 max-w-7xl mx-auto"><Queue /></div>}
                  {activeView === 'assets' && <div className="p-8 max-w-7xl mx-auto"><AssetLibrary /></div>}
                  {activeView === 'intelligence' && <div className="p-8 max-w-7xl mx-auto"><CompetitiveIntel /></div>}
                  {activeView === 'settings' && <div className="p-8 max-w-7xl mx-auto"><Settings /></div>}
                </motion.div>
              </AnimatePresence>
            </main>
          </motion.div>
        )}
      </AnimatePresence>
      <Analytics />
    </div>
  );
}