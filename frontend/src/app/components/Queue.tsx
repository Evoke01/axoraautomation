import { Clock, CheckCircle2, Circle, PlayCircle, MoreHorizontal, RefreshCw, Sparkles, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { api, type ApiPost } from '../lib/api';

type StatusType = 'live' | 'scheduled' | 'pending' | 'processing' | 'needs-review';

function mapStatus(post: ApiPost): StatusType {
  if (post.status === 'PUBLISHED') {
    const publishedAt = post.publishedAt ? new Date(post.publishedAt).getTime() : 0;
    if (Date.now() - publishedAt < 3 * 60 * 60 * 1000) return 'live';
    return 'pending';
  }
  if (post.status === 'PUBLISHING') return 'processing';
  if (post.status === 'SCHEDULED') {
    if (post.asset.status === 'PENDING_REVIEW') return 'needs-review';
    return 'scheduled';
  }
  return 'pending';
}

function formatScheduled(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

  if (d.toDateString() === now.toDateString()) return `Today · ${time}`;
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow · ${time}`;
  return `${d.toLocaleDateString('en-US', { weekday: 'short' })} · ${time}`;
}

const statusConfig: Record<StatusType, { label: string; color: string; dot: string; icon: typeof Clock }> = {
  live:           { label: 'Live',         color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', dot: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]', icon: PlayCircle },
  scheduled:      { label: 'Scheduled',    color: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',         dot: 'bg-cyan-400',   icon: Clock },
  pending:        { label: 'Pending',      color: 'text-zinc-400 bg-zinc-800 border-zinc-700',               dot: 'bg-zinc-500',   icon: Circle },
  processing:     { label: 'Processing',   color: 'text-violet-400 bg-violet-400/10 border-violet-400/20',   dot: 'bg-violet-400', icon: RefreshCw },
  'needs-review': { label: 'Needs review', color: 'text-amber-400 bg-amber-400/10 border-amber-400/20',      dot: 'bg-amber-400',  icon: CheckCircle2 },
};

const platformColors: Record<string, string> = {
  YOUTUBE: 'text-red-400',
  INSTAGRAM: 'text-pink-400',
  TIKTOK: 'text-zinc-300',
  LINKEDIN: 'text-cyan-400',
  X: 'text-zinc-300',
};

const platformLabels: Record<string, string> = {
  YOUTUBE: 'YouTube',
  INSTAGRAM: 'Instagram',
  LINKEDIN: 'LinkedIn',
  TIKTOK: 'TikTok',
  X: 'X',
};

export function Queue() {
  const [posts, setPosts] = useState<ApiPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState('All');
  const [approvingId, setApprovingId] = useState<string | null>(null);

  useEffect(() => {
    api.posts.list()
      .then(setPosts)
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, []);

  const needsReviewCount = posts.filter(p => p.asset.status === 'PENDING_REVIEW').length;

  const filtered = posts.filter(p => {
    if (filter === 'All') return true;
    if (filter === 'Needs review') return p.asset.status === 'PENDING_REVIEW';
    return p.platform === filter.toUpperCase();
  });

  const handleApprove = async (post: ApiPost) => {
    setApprovingId(post.id);
    try {
      await api.assets.approve(post.asset.id);
      setPosts(prev => prev.map(p =>
        p.id === post.id ? { ...p, asset: { ...p.asset, status: 'APPROVED' } } : p
      ));
    } catch {
      // ignore
    } finally {
      setApprovingId(null);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl">Post queue</h2>
        <div className="flex items-center gap-3 text-zinc-400 p-12 justify-center">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading queue...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl">Post queue</h2>
          <p className="text-zinc-500 mt-1">
            {posts.length} posts scheduled
            {needsReviewCount > 0 && (
              <span className="ml-2 text-amber-400">· {needsReviewCount} need review</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-zinc-500 px-3 py-1.5 bg-white/5 rounded-lg border border-white/10">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Auto-posting on
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {['All', 'YouTube', 'Instagram', 'Needs review'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              filter === f
                ? 'bg-white/10 text-white border-white/20'
                : 'border-white/10 text-zinc-400 hover:text-white hover:bg-white/5'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="p-12 text-center text-zinc-500 text-sm border border-white/10 rounded-2xl bg-white/5">
          No posts in this filter. Upload a video to get started.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((post) => {
            const status = mapStatus(post);
            const cfg = statusConfig[status];
            const StatusIcon = cfg.icon;
            const isExpanded = selected === post.id;
            const caption = post.decision?.metadataVariant?.caption ?? '';
            const hashtags = (post.decision?.metadataVariant?.hashtags ?? []) as string[];
            const waveNumber = post.decision?.campaignWave?.waveNumber ?? 1;

            return (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`bg-gradient-to-r from-zinc-900/60 to-zinc-950/60 backdrop-blur-xl rounded-2xl border transition-all overflow-hidden ${
                  isExpanded ? 'border-white/20 shadow-[0_0_30px_-5px_rgba(255,255,255,0.06)]' : 'border-white/10 hover:border-white/20'
                }`}
              >
                <button onClick={() => setSelected(isExpanded ? null : post.id)} className="w-full p-5 text-left">
                  <div className="flex items-center gap-4">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot} ${status === 'live' ? 'animate-pulse' : ''}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-sm font-medium ${platformColors[post.platform] ?? 'text-zinc-400'}`}>
                          {platformLabels[post.platform] ?? post.platform}
                        </span>
                        <span className="text-zinc-700">·</span>
                        <span className="text-sm text-zinc-500">
                          {post.decision?.scheduledFor ? formatScheduled(post.decision.scheduledFor) : '—'}
                        </span>
                        <span className="text-zinc-700">·</span>
                        <span className="text-xs text-zinc-600">Wave {waveNumber}</span>
                        {caption && (
                          <span className="flex items-center gap-1 text-xs text-violet-400/70">
                            <Sparkles size={10} />
                            AI
                          </span>
                        )}
                      </div>
                      <p className="text-white font-medium truncate">{post.asset.title}</p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border ${cfg.color}`}>
                        <StatusIcon size={11} className={status === 'processing' ? 'animate-spin' : ''} />
                        {cfg.label}
                      </span>
                      <button className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/5 transition-all">
                        <MoreHorizontal size={16} />
                      </button>
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    className="border-t border-white/10 p-5 space-y-4"
                  >
                    {status === 'processing' ? (
                      <div className="flex items-center gap-3 text-sm text-zinc-400">
                        <RefreshCw size={14} className="animate-spin text-violet-400" />
                        Axora is generating caption and hashtags...
                      </div>
                    ) : (
                      <>
                        {caption ? (
                          <div>
                            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">AI-generated caption</div>
                            <p className="text-sm text-zinc-300 leading-relaxed bg-white/5 rounded-xl p-4 border border-white/10">{caption}</p>
                          </div>
                        ) : (
                          <p className="text-sm text-zinc-600 italic">No caption generated yet</p>
                        )}
                        {hashtags.length > 0 && (
                          <div>
                            <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Hashtags</div>
                            <div className="flex flex-wrap gap-2">
                              {hashtags.map((tag, j) => (
                                <span key={j} className="text-xs px-2 py-1 bg-violet-500/10 text-violet-400 rounded-md border border-violet-500/20">{tag}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="flex gap-2 pt-2 flex-wrap">
                          {status === 'needs-review' && (
                            <button
                              onClick={() => handleApprove(post)}
                              disabled={approvingId === post.id}
                              className="px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-sm font-medium hover:bg-emerald-500/30 transition-all disabled:opacity-50"
                            >
                              {approvingId === post.id ? 'Approving...' : 'Approve & publish'}
                            </button>
                          )}
                          {post.externalUrl && (
                            <a
                              href={post.externalUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-4 py-2 bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-lg text-sm hover:bg-cyan-500/20 transition-all"
                            >
                              View on platform ↗
                            </a>
                          )}
                        </div>
                      </>
                    )}
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
