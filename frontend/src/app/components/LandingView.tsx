import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

/**
 * Breathing dot-matrix canvas background
 */
function BreathingCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const startTime = useRef(Date.now());
  const raf = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.scale(dpr, dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    const CELL = 18;
    const DOT = 1.0;
    const OPACITIES = [0.05, 0.05, 0.08, 0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4];

    function rand(x: number, y: number) {
      const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
      return v - Math.floor(v);
    }

    const draw = () => {
      const W = window.innerWidth;
      const H = window.innerHeight;
      ctx.clearRect(0, 0, W, H);

      const t = (Date.now() - startTime.current) / 1000;
      const cx = W / 2 / CELL, cy = H / 2 / CELL;
      const cols = Math.ceil(W / CELL) + 1, rows = Math.ceil(H / CELL) + 1;

      // Global breathing cycle (sine wave)
      const breath = Math.sin(t * 1.5) * 0.15 + 0.85;

      for (let gx = 0; gx < cols; gx++) {
        for (let gy = 0; gy < rows; gy++) {
          const r0 = rand(gx, gy);
          const r1 = rand(gx * 3.1 + 0.5, gy * 2.7 + 0.3);
          const base = OPACITIES[Math.floor(r1 * 10) % 10];
          const dist = Math.sqrt((gx - cx) ** 2 + (gy - cy) ** 2);
          
          // Scanning intro sweep
          const timing = dist * 0.012 + r0 * 0.18;
          const progress = (t * 0.4) - timing;
          let opacity = progress < 0 ? 0 : Math.min(base, progress * base * 5);

          // Fast flicker + Slow breathing
          const flicker = Math.sin(t * 0.8 + r0 * 6.28) * 0.5 + 0.5;
          opacity *= (0.7 + flicker * 0.3) * breath;

          if (opacity < 0.01) continue;
          ctx.beginPath();
          ctx.arc(gx * CELL, gy * CELL, DOT / 2, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(180,180,180,${opacity.toFixed(3)})`;
          ctx.fill();
        }
      }
      raf.current = requestAnimationFrame(draw);
    };
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className="fixed inset-0 z-0 pointer-events-none" 
      style={{ width: '100%', height: '100%' }}
    />
  );
}

export function LandingView() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleJoin = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!email || !email.includes('@')) return;
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen bg-black text-white font-sans overflow-x-hidden selection:bg-white/10 relative">
      <BreathingCanvas />
      
      {/* Premium Gradient Overlays */}
      <div className="fixed inset-0 z-[1] pointer-events-none bg-[radial-gradient(ellipse_70%_70%_at_50%_50%,_rgba(0,0,0,0.88)_0%,_transparent_100%)]" />
      <div className="fixed top-0 left-0 right-0 h-[200px] z-[1] pointer-events-none bg-gradient-to-b from-black to-transparent" />
      <div className="fixed bottom-0 left-0 right-0 h-[160px] z-[1] pointer-events-none bg-gradient-to-t from-black to-transparent" />

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-[10] flex items-center justify-between p-7 lg:px-12">
        <div className="flex items-center gap-3 group">
          <svg className="w-8 h-8 flex-shrink-0" viewBox="0 0 100 100" fill="none">
            <circle cx="50" cy="50" r="44" stroke="url(#nr)" strokeWidth="5" fill="none"/>
            <circle cx="50" cy="21" r="7" fill="url(#nd)"/>
            <circle cx="25" cy="67" r="7" fill="url(#nd)"/>
            <circle cx="75" cy="67" r="7" fill="url(#nd)"/>
            <path d="M50 21 L25 67" stroke="url(#na)" strokeWidth="5" strokeLinecap="round"/>
            <path d="M50 21 L75 67" stroke="url(#na)" strokeWidth="5" strokeLinecap="round"/>
            <path d="M25 67 Q50 79 75 67" stroke="url(#na)" strokeWidth="5" strokeLinecap="round" fill="none"/>
            <defs>
              <linearGradient id="nr" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#b0b0b0"/><stop offset="50%" stopColor="#fff"/><stop offset="100%" stopColor="#707070"/>
              </linearGradient>
              <linearGradient id="nd" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#fff"/><stop offset="100%" stopColor="#999"/>
              </linearGradient>
              <linearGradient id="na" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#d0d0d0"/><stop offset="100%" stopColor="#666"/>
              </linearGradient>
            </defs>
          </svg>
          <span className="font-['Rajdhani'] text-xl font-bold tracking-[0.18em] text-transparent bg-clip-text bg-gradient-to-r from-zinc-400 via-white to-zinc-500">
            AXORA
          </span>
        </div>
        <div className="flex items-center gap-2 text-[10px] text-zinc-500 tracking-[0.18em] uppercase font-bold">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse" />
          Building
        </div>
      </nav>

      <main className="relative z-[5] min-h-screen flex flex-col items-center justify-center p-6 pt-[140px] pb-[100px]">
        {/* Intro Badge */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="inline-flex items-center gap-2 border border-white/10 rounded-full px-4 py-1.5 mb-10 text-[10px] text-zinc-500 tracking-[0.2em] uppercase bg-white/[0.03] backdrop-blur-md"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
          Coming soon
        </motion.div>

        {/* Hero Title */}
        <motion.h1 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className="font-['Rajdhani'] text-6xl md:text-8xl lg:text-[110px] font-bold leading-[0.85] text-center tracking-[-0.04em] mb-4"
        >
          <span className="text-transparent bg-clip-text bg-gradient-to-b from-white via-white/90 to-zinc-600">
            Content that
          </span>
          <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-b from-white via-white/90 to-zinc-600">
            distributes itself
          </span>
        </motion.h1>

        {/* Subtitle */}
        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.4 }}
          className="text-zinc-500 text-sm md:text-lg font-light text-center max-w-[500px] leading-relaxed mb-12"
        >
          Upload once. Axora selects the platform, writes the caption, picks the time, and publishes — automatically. Forever.
        </motion.p>

        {/* Features Matrix */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.6 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-px bg-white/5 border border-white/5 rounded-2xl overflow-hidden max-w-[800px] w-full mb-16"
        >
          <FeatureCard 
            title="Autonomous posting"
            desc="Platform selection, timing, and publishing — all decided by the engine."
            Icon={AutonomousIcon}
          />
          <FeatureCard 
            title="AI-written metadata"
            desc="Titles, captions, hooks, and hashtags generated from your video — platform-native."
            Icon={AIIcon}
          />
          <FeatureCard 
            title="Self-optimizing"
            desc="Every post makes the next decision smarter. The engine learns from your results."
            Icon={OptimizedIcon}
          />
        </motion.div>

        {/* Form Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.8 }}
          className="w-full max-w-[440px] text-center"
        >
          <div className="text-[10px] text-zinc-500 tracking-[0.2em] uppercase mb-5 font-bold">
            Join the waitlist
          </div>

          <AnimatePresence mode="wait">
            {!submitted ? (
              <motion.form 
                key="form"
                exit={{ opacity: 0, y: -10 }}
                onSubmit={handleJoin}
                className="flex items-center gap-1 p-1.5 border border-white/10 rounded-full bg-white/[0.03] backdrop-blur-xl focus-within:border-white/20 transition-all"
              >
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your@email.com"
                  className="flex-1 bg-transparent border-none outline-none px-4 text-sm text-white placeholder:text-zinc-700 font-light"
                />
                <button 
                  type="submit"
                  className="px-6 py-2.5 rounded-full bg-gradient-to-r from-zinc-200 via-white to-zinc-400 text-black text-xs font-bold tracking-wide hover:opacity-90 active:scale-95 transition-all"
                >
                  Join Access
                </button>
              </motion.form>
            ) : (
              <motion.div 
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="py-4 border border-zinc-800 rounded-full bg-zinc-900 shadow-[0_0_20px_rgba(0,0,0,0.5)] text-sm text-zinc-400 font-medium tracking-wide"
              >
                You're on the list. We'll reach out soon.
              </motion.div>
            )}
          </AnimatePresence>

          <p className="text-[10px] text-zinc-700 mt-5 tracking-wide">
            Be among the first creators to run <span className="text-zinc-500 font-semibold italic">fully autonomous distribution</span>
          </p>
        </motion.div>
      </main>

      <footer className="relative z-[5] text-center pb-12 text-[10px] text-zinc-700 tracking-[0.2em] uppercase font-medium">
        Axora &nbsp;·&nbsp; Autonomous Content Engine
      </footer>
    </div>
  );
}

function FeatureCard({ title, desc, Icon }: { title: string, desc: string, Icon: React.FC }) {
  return (
    <div className="bg-black/90 p-8 flex flex-col gap-3 hover:bg-white/[0.02] transition-colors group">
      <div className="text-zinc-600 group-hover:text-white transition-colors">
        <Icon />
      </div>
      <div className="text-sm font-semibold text-zinc-300 group-hover:text-white transition-colors">{title}</div>
      <div className="text-[12px] leading-relaxed text-zinc-600 font-light">{desc}</div>
    </div>
  );
}

const AutonomousIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
  </svg>
);

const AIIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

const OptimizedIcon = () => (
  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);
