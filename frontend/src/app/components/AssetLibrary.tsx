import { Play, RefreshCw, Archive, ChevronDown, Loader2, Upload, ExternalLink, TrendingUp, TrendingDown, Edit2, Save, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { api, type ApiAsset } from '../lib/api';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 14) return '1 week ago';
  return `${Math.floor(days / 7)} weeks ago`;
}

function getStage(asset: ApiAsset): string {
  if (asset.status === 'ARCHIVED') return 'Archived';
  const allWaves = asset.campaigns.flatMap((campaign) => campaign.waves);
  if (allWaves.length === 0) return asset.status.toLowerCase().replace('_', ' ');
  const maxWave = Math.max(...allWaves.map((wave) => wave.waveNumber));
  const activeWave = allWaves.find((wave) => wave.status === 'ACTIVE');
  if (activeWave) return `Active - Wave ${activeWave.waveNumber}`;
  return `Wave ${maxWave} complete`;
}

function getTotalViews(asset: ApiAsset): number {
  if (typeof asset.totalViews === 'number') {
    return asset.totalViews;
  }

  return asset.campaigns
    .flatMap((campaign) => campaign.waves)
    .flatMap((wave) => wave.decisions)
    .reduce((sum, decision) => sum + (decision.post?.metrics?.views ?? decision.post?.snapshots?.[0]?.views ?? 0), 0);
}

function formatViews(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n > 0 ? n.toString() : '--';
}

function trendDirection(value: number | null): 'up' | 'down' | 'flat' {
  if (value === null) return 'flat';
  if (value > 0.15) return 'up';
  if (value < -0.15) return 'down';
  return 'flat';
}

const platformLabels: Record<string, string> = {
  YOUTUBE: 'YouTube',
  INSTAGRAM: 'Instagram',
  LINKEDIN: 'LinkedIn',
  TIKTOK: 'TikTok',
  X: 'X',
};

export function AssetLibrary() {
  const [assets, setAssets] = useState<ApiAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: '', caption: '', thumbnailBrief: '' });
  const [saving, setSaving] = useState(false);

  const handleEditSave = async (assetId: string) => {
    setSaving(true);
    try {
      await api.assets.override(assetId, {
        title: editForm.title,
        caption: editForm.caption,
        thumbnailBrief: editForm.thumbnailBrief,
      });
      setAssets((prev) => prev.map((a) => {
        if (a.id === assetId) {
          const updatedVariants = a.metadataVariants ? [...a.metadataVariants] : [];
          if (updatedVariants.length > 0) {
            updatedVariants[0].title = editForm.title;
            updatedVariants[0].caption = editForm.caption;
            updatedVariants[0].thumbnailBrief = editForm.thumbnailBrief;
          }
          return { ...a, title: editForm.title, metadataVariants: updatedVariants };
        }
        return a;
      }));
      setEditingId(null);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const load = () =>
      api.assets
        .list()
        .then(setAssets)
        .catch(() => setAssets([]))
        .finally(() => setLoading(false));

    void load();
    const interval = window.setInterval(() => void load(), 60_000);
    const handleFocus = () => void load();
    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl">Asset library</h2>
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 sm:p-6 h-32 animate-pulse flex flex-col justify-between">
              <div className="flex gap-3 items-center">
                <div className="w-4 h-4 rounded-full bg-white/10" />
                <div className="h-4 w-24 bg-white/10 rounded" />
              </div>
              <div className="h-6 w-64 bg-white/10 rounded" />
              <div className="flex gap-2 mt-2">
                <div className="h-6 w-16 bg-white/10 rounded-md" />
                <div className="h-6 w-24 bg-white/10 rounded-md" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (assets.length === 0) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl">Asset library</h2>
          <p className="text-zinc-500 mt-1">Multi-wave lifecycle tracking</p>
        </div>
        <div className="p-10 sm:p-16 border border-white/10 rounded-2xl bg-white/5 text-center space-y-3">
          <Upload size={32} className="text-zinc-600 mx-auto" />
          <p className="text-zinc-500 text-sm">No assets yet. Upload a video from the dashboard to get started.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl">Asset library</h2>
        <p className="text-zinc-500 mt-1">Multi-wave lifecycle tracking - {assets.length} assets</p>
      </div>

      <div className="space-y-3">
        {assets.map((asset) => {
          const isExpanded = expanded === asset.id;
          const stage = getStage(asset);
          const totalViews = getTotalViews(asset);
          const allWaves = asset.campaigns.flatMap((campaign) => campaign.waves);
          const latestConfidence = asset.youtubeContext?.channelTrend?.confidence ?? null;
          const avgViews30d = asset.youtubeContext?.channelTrend?.avgViews30d ?? null;
          const trendDelta = avgViews30d && totalViews > 0 ? (totalViews - avgViews30d) / avgViews30d : null;
          const trend = trendDirection(trendDelta);
          const platforms = [
            ...new Set(
              asset.campaigns
                .flatMap((campaign) => campaign.waves)
                .flatMap((wave) => wave.decisions)
                .map((decision) => decision.platform)
            ),
          ];

          const stageColor =
            stage.includes('Active')
              ? 'text-emerald-400'
              : stage === 'Archived'
                ? 'text-zinc-500'
                : 'text-amber-400';

          const StageIcon = stage.includes('Wave 1')
            ? Play
            : stage === 'Archived'
              ? Archive
              : RefreshCw;

          return (
            <div
              key={asset.id}
              className="bg-gradient-to-br from-zinc-900/80 to-zinc-950/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden shadow-2xl relative group hover:border-white/20 transition-all"
            >
              <div className="absolute top-[-50px] left-[-50px] w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <button
                onClick={() => {
                  if (expanded === asset.id) {
                    setExpanded(null);
                    setEditingId(null);
                  } else {
                    setExpanded(asset.id);
                  }
                }}
                className="w-full p-4 sm:p-6 text-left hover:bg-white/[0.02] transition-colors relative z-10"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex-1 min-w-0 space-y-3">
                    <div className="flex items-center gap-3 flex-wrap">
                      <StageIcon size={16} className={stageColor} />
                      <span className={`text-sm ${stageColor}`}>{stage}</span>
                      <span className="text-sm text-zinc-600">|</span>
                      <span className="text-sm text-zinc-500">{timeAgo(asset.createdAt)}</span>
                    </div>
                    <h3 className="text-lg sm:text-xl font-semibold text-white tracking-tight drop-shadow-sm break-words">
                      {asset.title}
                    </h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      {platforms.map((platform) => (
                        <span
                          key={platform}
                          className="text-xs px-2.5 py-1 bg-gradient-to-r from-white/10 to-white/5 backdrop-blur-md rounded-md text-zinc-300 border border-white/10 font-medium"
                        >
                          {platformLabels[platform] ?? platform}
                        </span>
                      ))}
                      {asset.youtubeContext?.genreHint && (
                        <span className="text-xs px-2.5 py-1 bg-violet-500/20 rounded-md text-violet-300 border border-violet-400/30 font-medium">
                          genre: {asset.youtubeContext.genreHint}
                        </span>
                      )}
                      {latestConfidence !== null && (
                        <span className="text-xs px-2.5 py-1 bg-white/10 rounded-md text-zinc-300 border border-white/10 font-medium">
                          confidence {(latestConfidence * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between lg:justify-end gap-4 sm:gap-6">
                    <div className="text-left sm:text-right">
                      <div className="text-2xl sm:text-3xl font-bold bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent tabular-nums">
                        {formatViews(totalViews)}
                      </div>
                      <div className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">total views</div>
                    </div>
                    <ChevronDown
                      size={20}
                      className={`text-zinc-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs">
                  {trend === 'up' && (
                    <span className="inline-flex items-center gap-1 text-emerald-400">
                      <TrendingUp size={12} /> trend up vs 30d
                    </span>
                  )}
                  {trend === 'down' && (
                    <span className="inline-flex items-center gap-1 text-red-400">
                      <TrendingDown size={12} /> trend down vs 30d
                    </span>
                  )}
                  {asset.freshnessAt && (
                    <span className="text-zinc-500">freshness: {timeAgo(asset.freshnessAt)}</span>
                  )}
                </div>
              </button>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="border-t border-white/10 overflow-hidden"
                  >
                    <div className="p-4 sm:p-6 space-y-4">
                      {editingId === asset.id ? (
                        <div className="space-y-4 bg-white/5 border border-white/10 p-4 rounded-xl">
                          <div className="flex justify-between items-center mb-2">
                            <h4 className="font-medium text-white">Edit Video Details</h4>
                            <div className="flex gap-2">
                              <button
                                onClick={() => setEditingId(null)}
                                className="p-1.5 hover:bg-white/10 rounded text-zinc-400 hover:text-white transition-colors"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          </div>
                          
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-zinc-400 mb-1">Title</label>
                              <input
                                type="text"
                                value={editForm.title}
                                onChange={(e) => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                                className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-zinc-400 mb-1">Description (Caption)</label>
                              <textarea
                                value={editForm.caption}
                                onChange={(e) => setEditForm(prev => ({ ...prev, caption: e.target.value }))}
                                className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 h-24 resize-y"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-zinc-400 mb-1">Thumbnail Brief</label>
                              <textarea
                                value={editForm.thumbnailBrief}
                                onChange={(e) => setEditForm(prev => ({ ...prev, thumbnailBrief: e.target.value }))}
                                className="w-full bg-black/40 border border-white/10 rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-cyan-500 h-16 resize-y"
                                placeholder="Describe the thumbnail layout, text, etc."
                              />
                            </div>
                            <div className="flex justify-end pt-2">
                              <button
                                onClick={() => void handleEditSave(asset.id)}
                                disabled={saving}
                                className="flex items-center gap-2 bg-white text-black px-4 py-2 rounded-md text-sm font-medium hover:bg-zinc-200 transition-colors disabled:opacity-50"
                              >
                                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                Save Changes
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex justify-between items-center">
                          <h4 className="text-sm font-medium text-zinc-400 uppercase tracking-wider">Distribution Plan</h4>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                const variant = asset.metadataVariants?.[0];
                                setEditForm({
                                  title: variant?.title || asset.title || '',
                                  caption: variant?.caption || '',
                                  thumbnailBrief: variant?.thumbnailBrief || '',
                                });
                                setEditingId(asset.id);
                              }}
                              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white px-2 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                            >
                              <Edit2 size={12} /> Edit Video
                            </button>
                            <button
                              onClick={async () => {
                                if (!confirm("Are you sure you want to archive this video? It will be removed from your dashboard and queue.")) return;
                                setSaving(true);
                                try {
                                  await api.assets.override(asset.id, { archive: true });
                                  setAssets(prev => prev.filter(a => a.id !== asset.id));
                                } finally {
                                  setSaving(false);
                                }
                              }}
                              disabled={saving}
                              className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 px-2 py-1 rounded bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 transition-colors"
                            >
                              <Archive size={12} /> Archive
                            </button>
                          </div>
                        </div>
                      )}

                      {allWaves.length === 0 ? (
                        <p className="text-sm text-zinc-600 italic">No waves yet - planning in progress.</p>
                      ) : (
                        <div className="space-y-2">
                          {allWaves.flatMap((wave) =>
                            wave.decisions.map((decision) => {
                              const snapshot = decision.post?.snapshots?.[0];
                              const views = decision.post?.metrics?.views ?? snapshot?.views ?? 0;
                              const likes = decision.post?.metrics?.likes ?? snapshot?.likes ?? 0;
                              const engagement = views > 0 ? `${((likes / views) * 100).toFixed(1)}%` : '--';

                              return (
                                <div
                                  key={decision.id}
                                  className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between p-3 bg-white/5 backdrop-blur-sm rounded-lg border border-white/10"
                                >
                                  <div className="flex flex-wrap items-center gap-3 lg:gap-4">
                                    <span className="text-sm text-zinc-500">Wave {wave.waveNumber}</span>
                                    <span className="text-sm text-zinc-300">{platformLabels[decision.platform] ?? decision.platform}</span>
                                    <span
                                      className={`text-xs px-2 py-1 rounded ${
                                        decision.status === 'PUBLISHED'
                                          ? 'bg-emerald-500/20 text-emerald-400'
                                          : decision.status === 'SCHEDULED'
                                            ? 'bg-cyan-500/20 text-cyan-400'
                                            : decision.status === 'FAILED'
                                              ? 'bg-red-500/20 text-red-400'
                                              : 'bg-white/10 text-zinc-400'
                                      }`}
                                    >
                                      {decision.status.toLowerCase()}
                                    </span>
                                  </div>
                                  <div className="flex gap-4 sm:gap-6 tabular-nums text-sm">
                                    <div>
                                      <span className="text-zinc-400">{formatViews(views)}</span>
                                      <span className="text-zinc-600 ml-1">views</span>
                                    </div>
                                    <div>
                                      <span className="text-zinc-400">{engagement}</span>
                                      <span className="text-zinc-600 ml-1">eng.</span>
                                    </div>
                                    {decision.post?.externalUrl && (
                                      <a
                                        href={decision.post.externalUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300"
                                        onClick={(event) => event.stopPropagation()}
                                      >
                                        video <ExternalLink size={12} />
                                      </a>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}

                      <div className="pt-3 border-t border-white/10 text-sm text-zinc-500 break-words">
                        Status: {asset.status.toLowerCase().replace(/_/g, ' ')}
                        {asset.rawNotes && <span className="ml-2 text-zinc-600">| {asset.rawNotes}</span>}
                      </div>
                      {asset.assetIntelligence?.summary && (
                        <div className="text-sm text-zinc-400 bg-white/5 border border-white/10 rounded-lg p-3">
                          <span className="text-zinc-500 mr-1">AI report:</span>
                          {asset.assetIntelligence.summary}
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
