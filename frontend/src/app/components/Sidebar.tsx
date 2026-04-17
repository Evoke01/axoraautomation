import { useState } from 'react';
import { LayoutDashboard, FolderOpen, TrendingUp, Settings, CalendarClock, Menu, X } from 'lucide-react';
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
    <div className="flex flex-col h-full">
      {/* Brand Header */}
      <div className="p-7 mb-4 relative">
        <div className="relative z-10">
          <img
            src="/assets/logo-full.png"
            alt="Axora"
            className="h-7 w-auto object-contain brightness-110"
          />
          <p className="text-[9px] font-bold text-zinc-600 mt-2 uppercase tracking-[0.4em] pl-1">
            Autonomous engine
          </p>
        </div>
        {/* Subtle accent glow */}
        <div className="absolute top-0 left-0 w-16 h-16 bg-indigo-500/10 blur-3xl rounded-full -translate-x-1/2 -translate-y-1/2" />
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 px-4 space-y-1.5 overflow-y-auto custom-scrollbar">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => handleNav(item.id)}
              className={`w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl transition-all duration-300 border relative group overflow-hidden ${
                isActive
                  ? 'bg-white/10 text-white border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.3)]'
                  : 'text-zinc-500 hover:text-zinc-200 hover:bg-white/[0.03] border-transparent hover:border-white/5'
              }`}
            >
              {/* Active Item Background Shine */}
              {isActive && (
                <motion.div 
                  layoutId="sidebar-active-pill"
                  className="absolute inset-0 bg-gradient-to-r from-indigo-500/10 via-violet-500/5 to-transparent z-0" 
                />
              )}
              
              <div className={`relative z-10 transition-transform duration-300 group-hover:scale-110 ${isActive ? 'text-indigo-400' : 'text-zinc-500'}`}>
                <Icon size={19} strokeWidth={isActive ? 2.5 : 2} />
              </div>
              
              <span className="relative z-10 text-sm font-semibold tracking-tight tracking-wide flex-1 text-left">
                {item.label}
              </span>

              {isActive && (
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.8)]"
                />
              )}
            </button>
          );
        })}
      </nav>

      {/* User & System Status */}
      <div className="p-4 mt-auto">
        <div className="bg-white/[0.03] border border-white/5 rounded-3xl p-4 space-y-4 backdrop-blur-md relative overflow-hidden group">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-white/10 flex items-center justify-center text-xs font-bold text-zinc-200 shadow-inner group-hover:scale-105 transition-transform duration-500">
                EV
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#030303] flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-zinc-100 truncate">Evoke Studio</div>
              <div className="text-[10px] text-zinc-600 truncate font-medium">Enterprise Plan</div>
            </div>
          </div>

          <div className="pt-3 border-t border-white/5 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-zinc-600 font-bold uppercase tracking-wider">Storage</span>
              <span className="text-[10px] text-zinc-400 font-mono">72%</span>
            </div>
            <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: '72%' }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                className="h-full bg-gradient-to-r from-indigo-500 to-violet-500"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-6 left-6 z-50 p-3 rounded-2xl bg-zinc-950/80 backdrop-blur-2xl border border-white/10 text-zinc-300 hover:text-white transition-all shadow-2xl active:scale-95"
      >
        <Menu size={20} />
      </button>

      <aside className="hidden lg:flex w-64 xl:w-72 border-r border-white-[0.05] flex-col backdrop-blur-3xl bg-zinc-950/40 sticky top-0 h-screen z-30">
        {navContent}
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 z-40 bg-black/80 backdrop-blur-md"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className="lg:hidden fixed top-0 left-0 bottom-0 w-80 z-50 flex flex-col bg-zinc-950/95 backdrop-blur-3xl border-r border-white/10 shadow-[20px_0_60px_rgba(0,0,0,0.5)]"
            >
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute top-6 right-6 p-2 rounded-xl text-zinc-500 hover:text-zinc-100 transition-colors"
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
