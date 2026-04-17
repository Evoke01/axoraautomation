import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { UploadZone } from './UploadZone';
import { api, type ApiSession, type ApiPost, type ApiAsset } from '../lib/api';
import {
  Eye, TrendingUp, Activity, Clock, Zap, Radio,
  ArrowUpRight, ArrowDownRight, ChevronRight,
  Globe
} from 'lucide-react';

/* ─── Sparkline SVG ─────────────────────────────────────── */
function Sparkline({ data, color, height = 32 }: { data: number[]; color: string; height?: number }) {
  if (!data.length) return null;
  const w = 80, h = height;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * h * 0.8 - h * 0.1;
    return `${x},${y}`;
  });
  const areaClose = `${w},${h} 0,${h}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      <defs>
        <linearGradient id={`sg-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`${pts.join(' ')} ${areaClose}`} fill={`url(#sg-${color.replace('#', '')})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── Ring Gauge ─────────────────────────────────────────── */
function RingGauge({ pct, color, size = 48, stroke = 5 }: { pct: number; color: string; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 1.2s cubic-bezier(.4,0,.2,1)' }} />
    </svg>
  );
}

/* ─── Animated counter ───────────────────────────────────── */
function Counter({ to, duration = 1200 }: { to: number; duration?: number }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const start = performance.now();
    const raf = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(ease * to));
      if (t < 1) requestAnimationFrame(raf);
    };
    requestAnimationFrame(raf);
  }, [to, duration]);
  return <>{val.toLocaleString()}</>;
}

/* ─── Data helpers ───────────────────────────────────────── */
const PERF_DATA = [
  { day: 'Mon', views: 1200, engagement: 48 },
  { day: 'Tue', views: 1900, engagement: 62 },
  { day: 'Wed', views: 1400, engagement: 55 },
  { day: 'Thu', views: 2800, engagement: 78 },
  { day: 'Fri', views: 2200, engagement: 71 },
  { day: 'Sat', views: 3100, engagement: 85 },
  { day: 'Sun', views: 2700, engagement: 80 },
];

const PLATFORM_DATA = [
  { name: 'YouTube', value: 58, color: '#ef4444' },
  { name: 'Instagram', value: 24, color: '#ec4899' },
  { name: 'TikTok', value: 18, color: '#06b6d4' },
];

const ASSET_SPARKS: Record<string, number[]> = {
  assets: [2, 2, 3, 3, 4, 4, 4],
  posts: [0, 0, 0, 1, 1, 1, 1],
  review: [1, 2, 1, 0, 0, 0, 0],
  views: [400, 820, 1100, 900, 1400, 1800, 2100],
};

const STATUS_STEPS = ['Upload', 'Validate', 'Analyze', 'Generate', 'Plan', 'Review', 'Publish'];

/* ─── Main component ─────────────────────────────────────── */
interface DashboardViewProps {
  session: ApiSession | null;
  onUploaded?: () => void;
}

export function DashboardView({ session, onUploaded }: DashboardViewProps) {
  const [summary, setSummary] = useState<{ assets: number; publishedPosts: number; pendingReview: number; latestOpportunityReportAt: string | null } | null>(null);
  const [posts, setPosts] = useState<ApiPost[]>([]);
  const [assets, setAssets] = useState<ApiAsset[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    api.dashboard.getSummary().then(setSummary).catch(() => {});
    api.posts.list().then(setPosts).catch(() => {});
    api.assets.list().then(setAssets).catch(() => {});
    const id = setInterval(() => setTick(t => t + 1), 3000);
    return () => clearInterval(id);
  }, []);

  const totalViews = posts.reduce((s, p) => s + (p.metrics?.views ?? 0), 0);
  const totalLikes = posts.reduce((s, p) => s + (p.metrics?.likes ?? 0), 0);
  const engRate = totalViews > 0 ? ((totalLikes / totalViews) * 100).toFixed(1) : '0.0';
  const recentPosts = posts.slice(0, 4);

  /* ─── Metric card data ─── */
  const metrics = [
    {
      label: 'Total assets', value: summary?.assets ?? 0, sub: 'Uploaded',
      trend: +12, color: '#10b981', Icon: Eye, sparks: ASSET_SPARKS.assets,
    },
    {
      label: 'Published posts', value: summary?.publishedPosts ?? 0, sub: 'Across platforms',
      trend: +8, color: '#06b6d4', Icon: TrendingUp, sparks: ASSET_SPARKS.posts,
    },
    {
      label: 'Total views', value: totalViews, sub: 'All time',
      trend: +34, color: '#8b5cf6', Icon: Activity, sparks: ASSET_SPARKS.views,
    },
    {
      label: 'Pending review', value: summary?.pendingReview ?? 0, sub: summary?.pendingReview ? 'Action needed' : 'All clear',
      trend: -(summary?.pendingReview ?? 0), color: summary?.pendingReview ? '#f59e0b' : '#10b981', Icon: Clock, sparks: ASSET_SPARKS.review,
    },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1400px]">

      {/* ─── Header ─── */}
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="flex items-center gap-3 mb-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-xs text-emerald-400 font-medium tracking-widest uppercase">Live</span>
          </div>
          <span className="text-xs text-zinc-600">Auto-refresh every 15min</span>
        </div>
        <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">Neural Dashboard</h1>
        <p className="text-zinc-500 text-sm mt-0.5">Real-time content performance and autonomous optimization.</p>
      </motion.div>

      {/* ─── Metric cards ─── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 lg:gap-4">
        {metrics.map((m, i) => {
          const Icon = m.Icon;
          const isUp = m.trend >= 0;
          return (
            <motion.div
              key={m.label}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.07 }}
              className="relative rounded-2xl overflow-hidden group"
              style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}
            >
              {/* accent bar */}
              <div className="absolute top-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${m.color}80, transparent)` }} />
              {/* hover glow */}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                style={{ background: `radial-gradient(ellipse 60% 50% at 50% 0%, ${m.color}12, transparent)` }} />
              <div className="relative p-4 lg:p-5 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon size={14} style={{ color: m.color }} />
                    <span className="text-xs text-zinc-500 font-medium">{m.label}</span>
                  </div>
                  <div className={`flex items-center gap-0.5 text-xs font-medium ${isUp ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {isUp ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {Math.abs(m.trend)}%
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <div className="text-2xl lg:text-3xl font-bold text-white tabular-nums leading-none">
                      <Counter to={m.value} />
                    </div>
                    <div className="text-xs mt-1" style={{ color: m.color }}>{m.sub}</div>
                  </div>
                  <div className="pb-1">
                    <Sparkline data={m.sparks} color={m.color} height={36} />
                  </div>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* ─── Main grid: chart + platform ─── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Performance chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.28 }}
          className="xl:col-span-2 rounded-2xl p-5 lg:p-6 relative overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, #06b6d480, transparent)' }} />
          <div className="flex items-center justify-between mb-5">
            <div>
              <div className="text-sm font-semibold text-white">Performance</div>
              <div className="text-xs text-zinc-500 mt-0.5">Last 7 days — views & engagement</div>
            </div>
            <div className="flex items-center gap-4 text-xs text-zinc-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-cyan-400" />Views
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-violet-400" />Engagement
              </span>
            </div>
          </div>
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={PERF_DATA} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="gViews" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gEng" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fill: '#52525b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#52525b', fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ background: '#09090b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }}
                  labelStyle={{ color: '#a1a1aa' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Area type="monotone" dataKey="views" stroke="#06b6d4" strokeWidth={2} fill="url(#gViews)" dot={false} />
                <Area type="monotone" dataKey="engagement" stroke="#8b5cf6" strokeWidth={2} fill="url(#gEng)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        {/* Platform distribution */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.35 }}
          className="rounded-2xl p-5 lg:p-6 relative overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, #8b5cf680, transparent)' }} />
          <div className="text-sm font-semibold text-white mb-1">Platform Mix</div>
          <div className="text-xs text-zinc-500 mb-4">Distribution by reach</div>
          <div className="flex items-center justify-center" style={{ height: 130 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={PLATFORM_DATA} cx="50%" cy="50%" innerRadius={38} outerRadius={58}
                  dataKey="value" paddingAngle={3} startAngle={90} endAngle={-270}>
                  {PLATFORM_DATA.map((p, i) => (
                    <Cell key={i} fill={p.color} opacity={0.9} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ background: '#09090b', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, fontSize: 12 }}
                  formatter={(v: number) => [`${v}%`]}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 mt-3">
            {PLATFORM_DATA.map((p) => (
              <div key={p.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                  <span className="text-xs text-zinc-400">{p.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1 rounded-full bg-zinc-800 w-16 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${p.value}%`, background: p.color }} />
                  </div>
                  <span className="text-xs text-zinc-300 tabular-nums w-8 text-right">{p.value}%</span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ─── Pipeline + Upload grid ─── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Upload zone */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.42 }}
          className="xl:col-span-2 rounded-2xl overflow-hidden relative"
          style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, #10b98180, transparent)' }} />
          <div className="p-5 pb-0">
            <div className="flex items-center justify-between mb-4">
              <div>
                <div className="text-sm font-semibold text-white">Upload Content</div>
                <div className="text-xs text-zinc-500 mt-0.5">Axora handles everything automatically</div>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs text-emerald-400"
                style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
                <Zap size={10} />
                <span>Auto-distribute</span>
              </div>
            </div>
          </div>
          <div className="px-4 pb-4">
            <UploadZone session={session} onUploaded={onUploaded} />
          </div>
        </motion.div>

        {/* Content pipeline status */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.49 }}
          className="rounded-2xl p-5 relative overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, #f59e0b80, transparent)' }} />
          <div className="text-sm font-semibold text-white mb-1">Pipeline</div>
          <div className="text-xs text-zinc-500 mb-5">Asset lifecycle stages</div>

          <div className="space-y-1.5">
            {STATUS_STEPS.map((step, i) => {
              const assetCount = assets.filter((a) => {
                const s = a.status.toLowerCase().replace('_', ' ');
                if (step === 'Upload') return s === 'validating' || s === 'draft';
                if (step === 'Validate') return s === 'validating';
                if (step === 'Analyze') return s === 'ready';
                if (step === 'Generate') return s === 'planned';
                if (step === 'Plan') return s === 'planned';
                if (step === 'Review') return s === 'pending review';
                if (step === 'Publish') return s === 'published' || s === 'approved';
                return false;
              }).length;

              const stepColors = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#10b981', '#f59e0b', '#ef4444'];
              const c = stepColors[i];
              const active = assetCount > 0;

              return (
                <div key={step} className="flex items-center gap-3 py-2 px-3 rounded-xl transition-all"
                  style={{ background: active ? `${c}12` : 'transparent', border: `1px solid ${active ? c + '30' : 'transparent'}` }}>
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'animate-pulse' : ''}`}
                      style={{ background: active ? c : 'rgba(255,255,255,0.15)' }} />
                    <span className={`text-xs font-medium truncate ${active ? 'text-white' : 'text-zinc-600'}`}>{step}</span>
                  </div>
                  {assetCount > 0 && (
                    <span className="text-xs tabular-nums px-1.5 py-0.5 rounded-md font-semibold"
                      style={{ background: `${c}25`, color: c }}>
                      {assetCount}
                    </span>
                  )}
                  <ChevronRight size={12} className="text-zinc-700 flex-shrink-0" />
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>

      {/* ─── Recent posts + Platform health ─── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Recent posts */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.56 }}
          className="xl:col-span-2 rounded-2xl p-5 relative overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, #06b6d480, transparent)' }} />
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-semibold text-white">Recent Posts</div>
              <div className="text-xs text-zinc-500 mt-0.5">Live performance tracking</div>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Radio size={11} className="text-emerald-400" />
              <span>Polling active</span>
            </div>
          </div>

          {recentPosts.length === 0 ? (
            <div className="py-10 text-center">
              <Globe size={28} className="text-zinc-700 mx-auto mb-2" />
              <p className="text-sm text-zinc-600">No posts yet — upload a video to begin</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentPosts.map((post, i) => {
                const views = post.metrics?.views ?? 0;
                const likes = post.metrics?.likes ?? 0;
                const eng = views > 0 ? ((likes / views) * 100).toFixed(1) : '—';
                const platColors: Record<string, string> = { YOUTUBE: '#ef4444', INSTAGRAM: '#ec4899', TIKTOK: '#06b6d4' };
                const pc = platColors[post.platform] ?? '#71717a';
                const isPublished = post.status === 'PUBLISHED';
                return (
                  <motion.div key={post.id}
                    initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-3 p-3 rounded-xl group transition-all hover:bg-white/5"
                    style={{ border: '1px solid rgba(255,255,255,0.05)' }}
                  >
                    <div className="w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center"
                      style={{ background: `${pc}20`, border: `1px solid ${pc}40` }}>
                      <span className="text-xs font-bold" style={{ color: pc }}>{post.platform[0]}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-white font-medium truncate">{post.asset.title}</div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-xs px-1.5 py-px rounded font-medium ${isPublished ? 'text-emerald-400' : 'text-amber-400'}`}
                          style={{ background: isPublished ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)' }}>
                          {post.status.toLowerCase()}
                        </span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-semibold text-white tabular-nums">
                        {views >= 1000 ? `${(views / 1000).toFixed(1)}K` : views || '—'}
                      </div>
                      <div className="text-xs text-zinc-500">{eng !== '—' ? `${eng}% eng` : 'no data'}</div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* System health */}
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.63 }}
          className="rounded-2xl p-5 relative overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.07)' }}
        >
          <div className="absolute top-0 left-0 right-0 h-px"
            style={{ background: 'linear-gradient(90deg, transparent, #10b98180, transparent)' }} />
          <div className="text-sm font-semibold text-white mb-1">System Health</div>
          <div className="text-xs text-zinc-500 mb-5">Platform quotas & status</div>

          <div className="space-y-5">
            {[
              { label: 'YouTube Quota', pct: 28, color: '#ef4444', used: '2,800', total: '10,000' },
              { label: 'Storage Used', pct: 72, color: '#8b5cf6', used: '7.2 GB', total: '10 GB' },
              { label: 'AI Credits', pct: 45, color: '#06b6d4', used: '450', total: '1,000' },
            ].map(({ label, pct, color, used, total }) => (
              <div key={label} className="flex items-center gap-4">
                <div className="relative flex-shrink-0">
                  <RingGauge pct={pct} color={color} size={48} stroke={4} />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-[10px] font-bold text-white">{pct}%</span>
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-zinc-300">{label}</div>
                  <div className="text-xs text-zinc-600 mt-0.5">{used} / {total}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-5 pt-4 border-t border-white/5 space-y-2">
            <div className="text-xs font-medium text-zinc-500 uppercase tracking-widest mb-3">Automation</div>
            {[
              { label: 'Auto-distribute', on: true },
              { label: 'AI metadata', on: true },
              { label: 'Manual review', on: summary?.pendingReview !== 0 },
            ].map(({ label, on }) => (
              <div key={label} className="flex items-center justify-between">
                <span className="text-xs text-zinc-400">{label}</span>
                <div className={`flex items-center gap-1 text-xs font-medium ${on ? 'text-emerald-400' : 'text-zinc-600'}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${on ? 'bg-emerald-400' : 'bg-zinc-700'}`} />
                  {on ? 'On' : 'Off'}
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

    </div>
  );
}
