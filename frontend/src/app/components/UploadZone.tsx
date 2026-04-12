import { useState } from 'react';
import { Upload, Film, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export function UploadZone() {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<string[]>([]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg">Upload</h2>
        <span className="text-sm text-zinc-500">Axora handles the rest</span>
      </div>

      <div
        onDragEnter={() => setIsDragging(true)}
        onDragLeave={() => setIsDragging(false)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          setIsProcessing(true);

          const steps = [
            'Analyzing content',
            'Selecting optimal platforms',
            'Generating metadata',
            'Scheduling distribution',
            'Complete - autonomous execution enabled'
          ];

          steps.forEach((step, i) => {
            setTimeout(() => {
              setProcessingSteps(prev => [...prev, step]);
              if (i === steps.length - 1) {
                setTimeout(() => {
                  setIsProcessing(false);
                  setProcessingSteps([]);
                }, 2000);
              }
            }, i * 800);
          });
        }}
        className={`border-2 border-dashed rounded-3xl p-12 transition-all cursor-pointer backdrop-blur-xl relative overflow-hidden ${
          isDragging
            ? 'border-transparent bg-gradient-to-br from-emerald-500/20 via-cyan-500/10 to-violet-500/20 shadow-2xl shadow-cyan-500/30 ring-2 ring-cyan-400'
            : isProcessing
            ? 'border-transparent bg-gradient-to-br from-emerald-500/20 via-cyan-500/10 to-violet-500/20 shadow-2xl shadow-emerald-500/30 ring-2 ring-emerald-400'
            : 'border-white/10 hover:border-white/30 bg-white/5 hover:bg-white/10 shadow-lg'
        }`}
      >
        {isDragging || isProcessing ? (
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.05] mix-blend-overlay pointer-events-none" />
        ) : null}
        <AnimatePresence mode="wait">
          {!isProcessing ? (
            <motion.div
              key="upload"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-4 text-center"
            >
              <div className="p-5 rounded-full bg-gradient-to-tr from-white/10 to-white/5 backdrop-blur-md border border-white/20 shadow-lg shadow-black/20 group-hover:scale-110 transition-transform duration-300">
                {isDragging ? <Film size={36} className="text-cyan-400" /> : <Upload size={36} className="text-emerald-400 group-hover:text-cyan-400 transition-colors" />}
              </div>
              <div className="space-y-1">
                <p className="text-lg font-medium text-white">Drop video or click to upload</p>
                <p className="text-sm text-zinc-400">
                  Platform selection, timing, and metadata generated automatically
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-4"
            >
              {processingSteps.map((step, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3 }}
                  className="flex items-center gap-3 text-sm"
                >
                  <CheckCircle2 size={16} className="text-emerald-400" />
                  <span className={i === processingSteps.length - 1 ? 'text-emerald-400' : 'text-zinc-400'}>
                    {step}
                  </span>
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
