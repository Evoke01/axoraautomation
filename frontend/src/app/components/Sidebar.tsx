import { useState } from 'react';
import { LayoutDashboard, FolderOpen, TrendingUp, Settings, CalendarClock, Zap, Menu, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
}

export function Sidebar({ activeView, onViewChange }: SidebarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'queue', label: 'Queue', icon: CalendarClock },
    { id: 'assets', label: 'Assets', icon: FolderOpen },
    { id: 'intelligence', label: 'Intelligence', icon: TrendingUp },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const handleNav = (id: string) => {
    onViewChange(id);
    setMobileOpen(false);
  };

  const navContent = (
    <>
      <div className="p-6 border-b border-white/10 relative overflow-hidden flex flex-col items-center">
        <img src="/assets/logo-full.png" alt="Axora" className="h-10 w-auto" />
        <p className="text-[10px] font-medium text-zinc-500 mt-2 uppercase tracking-[0.2em]">
          Autonomous engine
        </p>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all border ${
                isActive
                  ? 'bg-white/10 text-white backdrop-blur-md shadow-lg shadow-violet-500/10 border-white/20'
                  : 'text-zinc-400 hover:text-white hover:bg-white/5 border-transparent hover:border-white/10'
              } relative overflow-hidden group`}
            >
              {isActive && (
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/20 via-violet-500/20 to-rose-500/20 pointer-events-none" />
              )}
              <Icon size={18} className={isActive ? 'text-indigo-400' : 'text-zinc-500 group-hover:text-indigo-400/70 transition-colors'} />
              <span className="relative z-10 font-medium flex-1 text-left">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10 space-y-3">
        <div className="flex items-center gap-3 px-2">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500/30 to-cyan-500/30 border border-white/20 flex items-center justify-center text-xs font-bold text-white">
            EV
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-zinc-300 truncate">Evoke</div>
            <div className="text-xs text-zinc-600 truncate">evoke@axora.ai</div>
          </div>
          <div className="w-2 h-2 rounded-full bg-rose-400 shadow-[0_0_6px_rgba(251,113,133,0.8)] flex-shrink-0" />
        </div>
        <div className="text-xs text-zinc-600 space-y-1 px-2 pt-1 border-t border-white/5">
          <div className="flex justify-between"><span>Plan</span><span className="text-rose-400 font-medium">Pro</span></div>
          <div className="flex justify-between"><span>Platforms</span><span className="text-zinc-400">YouTube</span></div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2.5 rounded-xl bg-zinc-900/80 backdrop-blur-xl border border-white/10 text-zinc-300 hover:text-white transition-colors shadow-lg"
      >
        <Menu size={22} />
      </button>

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-64 xl:w-72 border-r border-white/10 flex-col backdrop-blur-xl bg-zinc-950/50 relative z-20">
        {navContent}
      </aside>

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="lg:hidden fixed top-0 left-0 bottom-0 w-[calc(100vw-1rem)] max-w-xs z-50 flex flex-col bg-zinc-950/95 backdrop-blur-xl border-r border-white/10"
            >
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-4 right-4 p-2 rounded-xl text-zinc-400 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
              {navContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
