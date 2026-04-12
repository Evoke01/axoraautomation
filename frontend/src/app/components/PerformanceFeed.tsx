import { useEffect, useState } from 'react';
import { TrendingUp, Target, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import { api } from '../lib/api';

interface Post {
  id: string;
  platform: string;
  status: string;
  publishedAt: string | null;
  externalUrl: string | null;
  metrics: { views?: number; likes?: number; comments?: number } | null;
  asset: { id: string; title: string; status: string };
  decision: { platform: string; format: string; scheduledFor: string; score: number };
  connectedAccount: { accountLabel: string } | null;
}

function formatTimeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

export function PerformanceFeed() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.posts
      .list()
      .then((data) => setPosts(data))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false));
  }, []);

  const platformColors: Record<string, string> = {
    YOUTUBE: 'bg-red-500',
    LINKEDIN: 'bg-cyan-500',
    X: 'bg-zinc-100',
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <h2 className="text-lg">Live performance</h2>
        <div className="flex items-center gap-3 text-zinc-400 p-8 justify-center">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading posts...</span>
        </div>
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg">Live performance</h2>
          <span className="text-sm text-zinc-500">Auto-updated every 15min</span>
        </div>
        <div className="p-8 bg-gradient-to-r from-zinc-900/60 to-zinc-950/60 backdrop-blur-xl rounded-2xl border border-white/10 text-center">
          <p className="text-zinc-500 text-sm">No published posts yet. Upload a video to get started!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg">Live performance</h2>
        <span className="text-sm text-zinc-500">Auto-updated every 15min</span>
      </div>

      <div className="space-y-3">
        {posts.slice(0, 6).map((post) => {
          const views = post.metrics?.views ?? 0;
          const likes = post.metrics?.likes ?? 0;
          const engagement = views > 0 ? ((likes / views) * 100).toFixed(1) : '0.0';

          return (
            <motion.div
              key={post.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 lg:p-6 bg-gradient-to-r from-zinc-900/60 to-zinc-950/60 backdrop-blur-xl rounded-2xl border border-white/10 hover:border-white/20 space-y-4 shadow-xl hover:shadow-[0_0_30px_-5px_rgba(255,255,255,0.05)] transition-all overflow-hidden relative group"
            >
              <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 relative z-10">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className={`w-2 h-2 rounded-full ${platformColors[post.platform] ?? 'bg-zinc-500'}`} />
                    <span className="text-sm text-zinc-500">{post.platform}</span>
                    <span className="text-sm text-zinc-600">•</span>
                    <span className="text-sm text-zinc-500">
                      {post.publishedAt ? formatTimeAgo(post.publishedAt) : 'Scheduled'}
                    </span>
                  </div>
                  <h3 className="text-white font-semibold text-base lg:text-lg drop-shadow-sm">{post.asset.title}</h3>
                </div>

                <div className="flex gap-6 tabular-nums">
                  <div className="text-right relative">
                    <div className="text-xl lg:text-2xl font-bold bg-gradient-to-br from-white to-zinc-400 bg-clip-text text-transparent">{formatNumber(views)}</div>
                    <div className="text-xs text-zinc-500 uppercase tracking-wider">views</div>
                  </div>
                  <div className="text-right relative">
                    <div className="text-xl lg:text-2xl font-bold bg-gradient-to-br from-white to-zinc-400 bg-clip-text text-transparent">{engagement}%</div>
                    <div className="text-xs text-zinc-500 uppercase tracking-wider">engagement</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pt-3 border-t border-white/10 gap-2">
                <div className="flex items-center gap-2">
                  <TrendingUp size={14} className={views > 0 ? 'text-emerald-400' : 'text-zinc-400'} />
                  <span className={`text-sm ${views > 0 ? 'text-emerald-400' : 'text-zinc-400'}`}>
                    {post.status === 'PUBLISHED' ? 'published' : post.status.toLowerCase().replace('_', ' ')}
                  </span>
                </div>
                {post.externalUrl && (
                  <a
                    href={post.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    <Target size={14} />
                    <span>View on platform</span>
                  </a>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
