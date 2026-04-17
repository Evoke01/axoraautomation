import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";

const STATUS_MESSAGES = [
  "Initializing neural core",
  "Synthesizing environment",
  "Synchronizing assets",
  "Calibrating autonomous engine",
  "Loading interface"
];

export function LoadingScreen() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % STATUS_MESSAGES.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#030303] overflow-hidden">
      {/* Dynamic Background Elements */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[100vw] h-[100vh] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-500/10 via-transparent to-transparent blur-[120px]" />
        <div className="absolute top-0 left-0 w-full h-full opacity-20 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:40px_40px]" />
      </div>

      <div className="relative flex flex-col items-center gap-12">
        {/* Animated Logo Container */}
        <div className="relative group">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="relative z-10"
          >
            <img
              src="/assets/logo-full.png"
              alt="Axora"
              className="h-10 w-auto object-contain brightness-110 contrast-125"
              style={{ filter: "drop-shadow(0 0 20px rgba(99, 102, 241, 0.3))" }}
            />
          </motion.div>

          {/* Shimmer / Scanning Effect */}
          <motion.div
            animate={{
              left: ["-100%", "200%"],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              ease: "easeInOut",
              repeatDelay: 0.5
            }}
            className="absolute top-0 bottom-0 w-1/2 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12 z-20 pointer-events-none"
          />

          {/* Ambient Pulse */}
          <motion.div
            animate={{ opacity: [0.2, 0.4, 0.2] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="absolute inset-[-20px] bg-indigo-500/20 blur-3xl pointer-events-none rounded-full"
          />
        </div>

        {/* Progress & Status */}
        <div className="flex flex-col items-center gap-6">
          <div className="flex gap-1.5">
            {[0, 1, 2, 3].map((i) => (
              <motion.div
                key={i}
                animate={{
                  scale: [1, 1.3, 1],
                  opacity: [0.3, 0.8, 0.3],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  delay: i * 0.4,
                  ease: "easeInOut"
                }}
                className="w-1.5 h-1.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.6)]"
              />
            ))}
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={messageIndex}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.5 }}
              className="text-zinc-500 text-[10px] font-bold tracking-[0.4em] uppercase"
            >
              {STATUS_MESSAGES[messageIndex]}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Footer Decoration */}
      <div className="absolute bottom-12 flex flex-col items-center gap-2 opacity-30">
        <div className="w-px h-12 bg-gradient-to-b from-transparent via-indigo-500/50 to-transparent" />
        <div className="text-[8px] text-zinc-600 tracking-[0.3em] uppercase font-medium">
          Axora Neural Engine 1.0
        </div>
      </div>
    </div>
  );
}
