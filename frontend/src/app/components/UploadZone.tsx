import { useRef, useState } from 'react';
import { Upload, Film, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { api, type ApiSession } from '../lib/api';

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB per part (S3 minimum)

const STEPS = [
  'Validating video',
  'Initializing secure upload',
  'Uploading to Axora storage',
  'Analyzing content',
  'Generating AI metadata',
  'Planning distribution',
  'Complete — autonomous execution enabled',
];

interface Props {
  session: ApiSession | null;
  onUploaded?: () => void;
}

export function UploadZone({ session, onUploaded }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [step, setStep] = useState(-1);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isProcessingRef = useRef(false);

  const isUploading = step >= 0;

  function advanceTo(index: number) {
    setStep(index);
    setCompletedSteps(STEPS.slice(0, index));
  }

  async function handleFile(file: File) {
    if (isProcessingRef.current) return;
    
    if (!session?.workspace?.id || !session?.creator?.id) {
      setError('Session not ready. Try refreshing.');
      return;
    }

    const MAX_SIZE = 500 * 1024 * 1024;
    if (file.size > MAX_SIZE) { setError('File too large. Max 500MB.'); return; }
    if (!file.type.startsWith('video/')) { setError('Please upload a video file.'); return; }

    setError(null);
    isProcessingRef.current = true;
    advanceTo(0);

    try {
      // Step 1 — init upload
      advanceTo(1);
      const init = await api.uploads.init({
        workspaceId: session.workspace.id,
        fileName: file.name,
        contentType: file.type,
        fileSizeBytes: file.size,
      });

      // Step 2 — upload parts
      advanceTo(2);
      const totalParts = Math.ceil(file.size / CHUNK_SIZE);
      const parts: { ETag: string; PartNumber: number }[] = [];

      for (let i = 0; i < totalParts; i++) {
        const partNumber = i + 1;
        const start = i * CHUNK_SIZE;
        const chunk = file.slice(start, start + CHUNK_SIZE);

        const { url } = await api.uploads.partUrl({
          uploadSessionId: init.uploadSessionId,
          partNumber,
        });

        const res = await fetch(url, { method: 'PUT', body: chunk });
        if (!res.ok) throw new Error(`Part ${partNumber} upload failed`);

        const etag = res.headers.get('ETag');
        if (!etag) {
          throw new Error('Connection error: ETag missing from response. Please check storage CORS settings.');
        }

        parts.push({ ETag: etag.replace(/"/g, ''), PartNumber: partNumber });

        setUploadProgress(Math.round((partNumber / totalParts) * 100));
      }

      await api.uploads.complete({ uploadSessionId: init.uploadSessionId, parts });

      // Step 3 — create asset
      advanceTo(3);
      const titleFromFilename = file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ');
      const asset = await api.assets.create({
        workspaceId: session.workspace.id,
        creatorId: session.creator.id,
        uploadSessionId: init.uploadSessionId,
        title: titleFromFilename,
      });

      // Steps 4-6 — these happen in the backend job queue, show them with delays
      advanceTo(4);
      await delay(1200);
      advanceTo(5);
      await delay(800);
      advanceTo(6);
      await delay(1000);

      setCompletedSteps(STEPS);
      setStep(-1);
      setUploadProgress(0);
      isProcessingRef.current = false;
      onUploaded?.();
    } catch (err) {
      setStep(-1);
      setUploadProgress(0);
      isProcessingRef.current = false;
      setError(err instanceof Error ? err.message : 'Upload failed. Please try again.');
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) void handleFile(file);
    e.target.value = '';
  }

  const currentStepLabel = step >= 0 ? STEPS[step] : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-lg">Upload</h2>
        <span className="text-sm text-zinc-500">Axora handles the rest</span>
      </div>

      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <div
        onClick={() => !isUploading && fileInputRef.current?.click()}
        onDragEnter={() => setIsDragging(true)}
        onDragLeave={() => setIsDragging(false)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className={`group border-2 border-dashed rounded-3xl p-6 sm:p-8 lg:p-12 min-h-[260px] sm:min-h-[300px] transition-all backdrop-blur-xl relative overflow-hidden ${
          isUploading
            ? 'border-transparent bg-gradient-to-br from-emerald-500/20 via-cyan-500/10 to-violet-500/20 shadow-2xl shadow-emerald-500/30 ring-2 ring-emerald-400'
            : isDragging
            ? 'border-transparent bg-gradient-to-br from-emerald-500/20 via-cyan-500/10 to-violet-500/20 shadow-2xl shadow-cyan-500/30 ring-2 ring-cyan-400'
            : 'border-white/10 hover:border-white/30 bg-white/5 hover:bg-white/10 shadow-lg cursor-pointer'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/*"
          className="hidden"
          onChange={onFileSelect}
        />

        <AnimatePresence mode="wait">
          {!isUploading ? (
            <motion.div
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex min-h-[210px] flex-col items-center justify-center gap-4 text-center"
            >
              <div className="p-5 rounded-full bg-gradient-to-tr from-white/10 to-white/5 backdrop-blur-md border border-white/20 shadow-lg group-hover:scale-110 transition-transform duration-300">
                {isDragging
                  ? <Film size={36} className="text-cyan-400" />
                  : <Upload size={36} className="text-emerald-400 group-hover:text-cyan-400 transition-colors" />
                }
              </div>
              <div className="space-y-1">
                <p className="text-lg font-medium text-white">Drop video or click to upload</p>
                <p className="text-sm text-zinc-400">Platform selection, timing, and metadata generated automatically</p>
                <p className="text-xs text-zinc-600 mt-1">MP4, MOV, AVI · Max 500MB · Max 10 minutes</p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="uploading"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex min-h-[210px] flex-col justify-center space-y-3 px-2"
            >
              {completedSteps.map((s, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-3 text-sm"
                >
                  <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
                  <span className="text-zinc-400">{s}</span>
                </motion.div>
              ))}
              {currentStepLabel && (
                <motion.div
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center gap-3 text-sm"
                >
                  <Loader2 size={16} className="text-cyan-400 animate-spin flex-shrink-0" />
                  <span className="text-white font-medium">{currentStepLabel}</span>
                  {step === 2 && uploadProgress > 0 && (
                    <span className="text-zinc-500 text-xs ml-auto">{uploadProgress}%</span>
                  )}
                </motion.div>
              )}
              {step === 2 && (
                <div className="mt-2 h-1 rounded-full bg-white/10 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-cyan-400"
                    animate={{ width: `${uploadProgress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function delay(ms: number) {
  return new Promise(res => setTimeout(res, ms));
}
