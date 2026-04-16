import React from "react";
import CpuArchitecture from "./ui/cpu-architecture";
import { motion } from "motion/react";

export function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#030303]">
      <div className="relative w-80 h-40">
        <CpuArchitecture 
          className="w-full h-full text-indigo-500/30" 
          text="AXORA"
          animateLines={true}
          animateText={true}
        />
        
        {/* Theme-synced ambient glow */}
        <div className="absolute inset-0 bg-indigo-500/10 blur-[120px] rounded-full pointer-events-none" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 bg-rose-500/5 blur-[80px] rounded-full pointer-events-none" />
      </div>
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ delay: 0.8, duration: 1.2, ease: [0.23, 0.86, 0.39, 0.96] }}
        className="mt-12 flex flex-col items-center gap-6"
      >
        <div className="relative group">
          <img 
            src="/assets/logo-full.png" 
            alt="Axora" 
            className="h-14 w-auto mix-blend-screen brightness-125 contrast-125 transition-all duration-700" 
          />
          {/* Pulsing branding glow */}
          <motion.div 
            animate={{ opacity: [0.3, 0.6, 0.3] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-0 bg-indigo-500/30 blur-2xl pointer-events-none" 
          />
        </div>

        <div className="flex flex-col items-center gap-3">
          <div className="text-zinc-500 text-[11px] font-bold tracking-[0.5em] uppercase opacity-70">
            Initializing neural environment
          </div>
          <div className="flex gap-2">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                animate={{
                  scale: [1, 1.5, 1],
                  opacity: [0.3, 1, 0.3],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  delay: i * 0.3,
                  ease: "easeInOut"
                }}
                className="w-1.5 h-1.5 rounded-full bg-indigo-400/50 shadow-[0_0_8px_rgba(129,140,248,0.5)]"
              />
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
