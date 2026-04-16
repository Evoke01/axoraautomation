import React from "react";
import CpuArchitecture from "./ui/cpu-architecture";
import { motion } from "motion/react";

export function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black">
      <div className="relative w-80 h-40">
        <CpuArchitecture 
          className="w-full h-full text-emerald-500/40" 
          text="AXORA"
          animateLines={true}
          animateText={true}
        />
        
        {/* Ambient glow behind CPU */}
        <div className="absolute inset-0 bg-emerald-500/5 blur-[100px] rounded-full pointer-events-none" />
      </div>
      
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5, duration: 0.8 }}
        className="mt-8 flex flex-col items-center gap-4"
      >
        <img src="/assets/logo-full.png" alt="Axora" className="h-12 w-auto" />
        <div className="flex flex-col items-center gap-2">
          <div className="text-zinc-500 text-[10px] font-medium tracking-[0.4em] uppercase">
            Initializing Neural Engine
          </div>
          <div className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              animate={{
                opacity: [0.2, 1, 0.2],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.2,
              }}
              className="w-1.5 h-1.5 rounded-full bg-emerald-500"
            />
          ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
