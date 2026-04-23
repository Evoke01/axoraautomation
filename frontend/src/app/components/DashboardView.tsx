import { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { Activity, AlertTriangle, Clock3, Eye, RefreshCw, TrendingUp, UploadCloud, Youtube } from 'lucide-react';

import { UploadZone } from './UploadZone';
import { api, type ApiAsset, type ApiPost, type ApiSession, type ApiSummary } from '../lib/api';

interface DashboardViewProps {
  session: ApiSession | null;
}

export function DashboardView({ session }: DashboardViewProps) {
  const [summary, setSummary] = useState<ApiSummary | null>(null);
  const [posts, setPosts] = useState<ApiPost[]>([]);
  const [assets, setAssets] = useState<ApiAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadDashboard() {
    const [nextSummary, nextPosts, nextAssets] = await Promise.all([
      api.dashboard.getSummary(),
      api.posts.list(),
      api.assets.list()
    ]);

    setSummary(nextSummary);
    setPosts(nextPosts);
    setAssets(nextAssets);
  }

  useEffect(() => {
    loadDashboard()
      .catch(() => undefined)
      .finally(() => setLoading(false));

    const interval = window.setInterval(() => {
      void loadDashboard().catch(() => undefined);
    }, 60_000);

    const handleFocus = () => {
      void loadDashboard().catch(() => undefined);
    };

    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await loadDashboard();
    } finally {
      setRefreshing(false);
    }
  }

  const recentPosts = posts.slice(0, 5);
  const freshnessLabel = buildFreshnessLabel(summary?.freshness.channelAnalyticsMinutes, summary?.partialFlags.youtubeReconnectRequired);
  const metricCards = [
    {
      label: 'Channel videos',
      value: summary?.channelTotals.totalVideos ?? 0,
      sub: 'YouTube channel-wide',
      icon: Youtube,
      color: '#ef4444'
    },
    {
      label: 'Axora posts',
      value: summary?.axoraTotals.axoraPublishedPosts ?? 0,
      sub: 'Axora-managed',
      icon: UploadCloud,
      color: '#06b6d4'
    },
    {
      label: 'Recent channel views',
      value: summary?.channelTotals.channelViewsRecentWindow ?? 0,
      sub: 'YouTube analytics window',
      icon: TrendingUp,
      color: '#10b981'
    },
    {
      label: 'Axora managed views',
      value: summary?.axoraTotals.axoraManagedViews ?? 0,
      sub: 'Latest canonical post metrics',
      icon: Eye,
      color: '#8b5cf6'
    },
    {
      label: 'Pending review',
      value: summary?.pendingReview ?? 0,
      sub: (summary?.pendingReview ?? 0) > 0 ? 'Action needed' : 'All clear',
      icon: Clock3,
      color: '#f59e0b'
    },
    {
      label: 'Tracked assets',
      value: summary?.assets ?? assets.length,
      sub: 'Uploaded into Axora',
      icon: Activity,
      color: '#14b8a6'
    }
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3 text-xs uppercase tracking-[0.28em] text-zinc-500">
            <span className={`inline-flex items-center gap-2 ${summary?.freshness.channelAnalyticsMinutes !== null && (summary?.freshness.channelAnalyticsMinutes ?? 999) <= 15 ? 'text-emerald-400' : 'text-zinc-500'}`}>
              <span className={`h-2 w-2 rounded-full ${(summary?.freshness.channelAnalyticsMinutes ?? 999) <= 15 ? 'bg-emerald-400 animate-pulse' : 'bg-zinc-600'}`} />
              Near real-time
            </span>
            <span>{freshnessLabel}</span>
          </div>
          <h1 className="mt-3 text-3xl lg:text-4xl font-bold tracking-tight text-white">Axora Dashboard</h1>
          <p className="mt-2 text-sm text-zinc-500">Channel-wide YouTube analytics and Axora-managed post performance, split cleanly.</p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 self-start rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-200 hover:bg-white/10 disabled:opacity-60"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          Refresh now
        </button>
      </div>

      {summary?.partialFlags.youtubeReconnectRequired && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-400" />
            <div>Reconnect YouTube to enable channel analytics totals and the intelligence overview.</div>
          </div>
        </div>
      )}

      {summary?.partialFlags.metricsSyncing && !summary?.partialFlags.youtubeReconnectRequired && (
        <div className="rounded-2xl border border-cyan-500/20 bg-cyan-500/10 p-4 text-sm text-cyan-100">
          Metrics are syncing. Newly published videos can take a few minutes before the dashboard catches up.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {metricCards.map((card) => {
          const Icon = card.icon;
          return (
            <motion.div
              key={card.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl"
            >
              <div className="flex items-center justify-between">
                <div className="text-sm text-zinc-400">{card.label}</div>
                <Icon size={16} style={{ color: card.color }} />
              </div>
              <div className="mt-4 text-3xl font-semibold text-white tabular-nums">{formatNumber(card.value)}</div>
              <div className="mt-2 text-xs" style={{ color: card.color }}>{card.sub}</div>
            </motion.div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-white">Channel performance history</div>
              <div className="text-xs text-zinc-500">Daily channel analytics, not summed post snapshots.</div>
            </div>
            <div className="text-xs text-zinc-500">
              Axora views: {formatNumber(summary?.axoraTotals.axoraManagedViews ?? 0)}
            </div>
          </div>
          <div className="mt-4 h-60">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={summary?.performanceHistory ?? []} margin={{ top: 8, right: 8, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="axoraViewsFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="axoraEngFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.24} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#09090b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12 }}
                  labelStyle={{ color: '#a1a1aa' }}
                />
                <Area dataKey="views" type="monotone" stroke="#06b6d4" fill="url(#axoraViewsFill)" strokeWidth={2} />
                <Area dataKey="engagement" type="monotone" stroke="#8b5cf6" fill="url(#axoraEngFill)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
          <div className="text-sm font-medium text-white">Upload</div>
          <div className="mt-1 text-xs text-zinc-500">Creator uploads once. Axora handles the rest.</div>
          <div className="mt-4">
            <UploadZone session={session} onUploaded={() => void loadDashboard()} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium text-white">Axora-managed posts</div>
              <div className="text-xs text-zinc-500">Latest metrics only, with explicit freshness.</div>
            </div>
            <div className="text-xs text-zinc-500">
              {summary?.freshness.axoraMetricsMinutes !== null
                ? `Updated ${summary?.freshness.axoraMetricsMinutes}m ago`
                : 'Waiting for metrics'}
            </div>
          </div>
          <div className="mt-4 space-y-3">
            {loading && recentPosts.length === 0 && (
              <div className="text-sm text-zinc-500">Loading posts...</div>
            )}
            {!loading && recentPosts.length === 0 && (
              <div className="text-sm text-zinc-500">No published Axora posts yet.</div>
            )}
            {recentPosts.map((post) => (
              <div key={post.id} className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-white">{post.asset.title}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {post.platform} · {post.status.toLowerCase()} · {post.metricsFreshnessMinutes !== null ? `${post.metricsFreshnessMinutes}m freshness` : 'pending'}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-white tabular-nums">{formatNumber(post.metrics?.views ?? 0)}</div>
                  <div className="text-xs text-zinc-500">views</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl">
          <div className="text-sm font-medium text-white">System state</div>
          <div className="mt-4 space-y-4">
            {summary?.systemHealth.map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between text-xs text-zinc-400">
                  <span>{item.label}</span>
                  <span>{item.used} / {item.total}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-900">
                  <div className="h-full rounded-full" style={{ width: `${item.pct}%`, background: item.color }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatNumber(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}

function buildFreshnessLabel(freshnessMinutes: number | null | undefined, reconnectRequired?: boolean) {
  if (reconnectRequired) return 'analytics scope missing';
  if (freshnessMinutes === null || freshnessMinutes === undefined) return 'awaiting first sync';
  return `updated ${freshnessMinutes}m ago`;
}
