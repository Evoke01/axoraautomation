import { useEffect, useState } from 'react';
import { TrendingUp, Eye, Users, Clock, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';
import { api } from '../lib/api';

interface Summary {
  assets: number;
  publishedPosts: number;
  pendingReview: number;
  latestOpportunityReportAt: string | null;
}

export function MetricsOverview() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api.dashboard
      .getSummary()
      .then(setSummary)
      .catch(() => setError(true));
  }, []);

  const metrics = summary
    ? [
        {
          label: 'Total assets',
          value: summary.assets.toLocaleString(),
          change: 'Uploaded',
          trend: 'up' as const,
          icon: Eye,
        },
        {
          label: 'Published posts',
          value: summary.publishedPosts.toLocaleString(),
          change: 'Across platforms',
          trend: 'up' as const,
          icon: TrendingUp,
        },
        {
          label: 'Pending review',
          value: summary.pendingReview.toLocaleString(),
          change: summary.pendingReview > 0 ? 'Action needed' : 'All clear',
          trend: summary.pendingReview > 0 ? ('neutral' as const) : ('up' as const),
          icon: Users,
        },
        {
          label: 'Last report',
          value: summary.latestOpportunityReportAt
            ? new Date(summary.latestOpportunityReportAt).toLocaleDateString()
            : '—',
          change: 'Opportunity report',
          trend: 'neutral' as const,
          icon: Clock,
        },
      ]
    : [
        { label: 'Total assets', value: '—', change: 'Loading...', trend: 'neutral' as const, icon: Eye },
        { label: 'Published posts', value: '—', change: 'Loading...', trend: 'neutral' as const, icon: TrendingUp },
        { label: 'Pending review', value: '—', change: 'Loading...', trend: 'neutral' as const, icon: Users },
        { label: 'Last report', value: '—', change: 'Loading...', trend: 'neutral' as const, icon: Clock },
      ];

  if (error) {
    return (
      <div className="p-6 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center gap-3">
        <AlertCircle size={20} className="text-red-400" />
        <span className="text-red-400 text-sm">Unable to connect to backend. Is the server running at port 4000?</span>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
      {metrics.map((metric, i) => {
        const Icon = metric.icon;
        const colorVariants = [
          'from-emerald-500/10 to-transparent border-emerald-500/20',
          'from-cyan-500/10 to-transparent border-cyan-500/20',
          'from-violet-500/10 to-transparent border-violet-500/20',
          'from-rose-500/10 to-transparent border-rose-500/20',
        ];
        
        return (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.1 }}
            className={`space-y-3 p-5 lg:p-6 rounded-2xl bg-gradient-to-br ${colorVariants[i]} bg-zinc-950/40 backdrop-blur-xl border-t border-l border-r border-b-0 shadow-[0_8px_32px_-8px_rgba(0,0,0,0.5)] relative overflow-hidden group`}
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition-colors" />
            <div className="flex items-center gap-2 text-zinc-400 font-medium relative z-10">
              <Icon size={16} />
              <span className="text-sm">{metric.label}</span>
            </div>
            <div className="space-y-1 relative z-10">
              <motion.div
                className="text-3xl lg:text-4xl font-bold tabular-nums tracking-tight text-white drop-shadow-md"
                animate={summary && metric.trend === 'up' ? { scale: [1, 1.02, 1] } : {}}
                transition={{ duration: 2, repeat: Infinity, repeatDelay: 3 }}
              >
                {metric.value}
              </motion.div>
              <div className={`text-sm ${
                metric.trend === 'up' ? 'text-emerald-400' : 'text-zinc-400'
              }`}>
                {metric.change}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
