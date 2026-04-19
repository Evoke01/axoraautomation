import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, TrendingUp } from 'lucide-react';

import { api, type ApiIntelligenceOverview } from '../lib/api';

export function CompetitiveIntel() {
  const [data, setData] = useState<ApiIntelligenceOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadOverview() {
    const next = await api.intelligence.overview();
    setData(next);
  }

  useEffect(() => {
    loadOverview()
      .catch(() => undefined)
      .finally(() => setLoading(false));

    const interval = window.setInterval(() => void loadOverview().catch(() => undefined), 60_000);
    const handleFocus = () => void loadOverview().catch(() => undefined);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await api.intelligence.refresh();
      await loadOverview();
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return <div className="text-sm text-zinc-500">Loading intelligence...</div>;
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-3xl font-bold text-white">Intelligence</h2>
          <p className="mt-2 text-sm text-zinc-500">
            Channel analytics plus public competitor signals, refreshed near real-time.
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-zinc-100 hover:bg-white/10 disabled:opacity-60"
        >
          <RefreshCw size={15} className={refreshing ? 'animate-spin' : ''} />
          Refresh intelligence
        </button>
      </div>

      {data?.partialFlags.youtubeReconnectRequired && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          <div className="flex items-start gap-3">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-400" />
            <div>Reconnect YouTube to unlock authenticated channel analytics.</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-white">Channel intelligence</h3>
              <p className="text-xs text-zinc-500">
                {data?.channel.freshnessMinutes !== null
                  ? `Updated ${data?.channel.freshnessMinutes}m ago`
                  : 'Awaiting first analytics sync'}
              </p>
            </div>
            <TrendingUp size={18} className="text-cyan-400" />
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <StatCard label="Total views" value={formatNumber(data?.channel.totals?.totalViews ?? 0)} />
            <StatCard label="Subscribers" value={formatNumber(data?.channel.totals?.totalSubscribers ?? 0)} />
            <StatCard label="Videos" value={formatNumber(data?.channel.totals?.totalVideos ?? 0)} />
            <StatCard label="Recent views" value={formatNumber(data?.channel.totals?.recentViews ?? 0)} />
          </div>

          <div className="mt-6">
            <SectionLabel label="Top movers" />
            <div className="mt-3 space-y-2">
              {data?.channel.topMovers.length ? data.channel.topMovers.map((item) => (
                <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-sm font-medium text-white">{item.title}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {formatNumber(item.views)} views · {item.freshnessMinutes !== null ? `${item.freshnessMinutes}m freshness` : 'pending'}
                  </div>
                </div>
              )) : <EmptyLine text="No channel movers yet." />}
            </div>
          </div>

          <div className="mt-6">
            <SectionLabel label="Underperformers" />
            <div className="mt-3 space-y-2">
              {data?.channel.underperformers.length ? data.channel.underperformers.map((item) => (
                <div key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-sm font-medium text-white">{item.title}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {formatNumber(item.views)} vs {formatNumber(item.baselineViews)} baseline · {item.recommendedAction.replace(/_/g, ' ')}
                  </div>
                </div>
              )) : <EmptyLine text="No current second-wave flags." />}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
          <div>
            <h3 className="text-lg font-semibold text-white">Competitor intelligence</h3>
            <p className="text-xs text-zinc-500">
              {data?.competitors.freshnessMinutes !== null
                ? `Updated ${data?.competitors.freshnessMinutes}m ago`
                : 'Competitor scan warming up'}
            </p>
          </div>

          <div className="mt-5 space-y-3">
            {data?.competitors.channels.length ? data.competitors.channels.map((channel) => (
              <div key={channel.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-white">{channel.name}</div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {formatNumber(channel.avgViews)} avg views · {channel.postingWindow} window
                    </div>
                  </div>
                  <div className="text-right text-xs text-zinc-500">
                    <div>{formatNumber(channel.subscriberCount ?? 0)} subs</div>
                    <div>{channel.freshnessMinutes !== null ? `${channel.freshnessMinutes}m freshness` : 'warming up'}</div>
                  </div>
                </div>
                {channel.topicKeywords.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {channel.topicKeywords.map((keyword) => (
                      <span key={keyword} className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-zinc-300">
                        {keyword}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )) : <EmptyLine text="No tracked competitors yet." />}
          </div>

          <div className="mt-6">
            <SectionLabel label="Whitespace opportunities" />
            <div className="mt-3 space-y-2">
              {data?.competitors.opportunities.length ? data.competitors.opportunities.map((opportunity, index) => (
                <div key={`${opportunity.title}-${index}`} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-sm font-medium text-white">{opportunity.title}</div>
                  <div className="mt-1 text-sm text-zinc-400">{opportunity.description}</div>
                  <div className="mt-2 text-xs text-cyan-300">{opportunity.action}</div>
                </div>
              )) : <EmptyLine text="No public-signal opportunities detected yet." />}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
    </div>
  );
}

function SectionLabel({ label }: { label: string }) {
  return <div className="text-xs uppercase tracking-[0.24em] text-zinc-500">{label}</div>;
}

function EmptyLine({ text }: { text: string }) {
  return <div className="text-sm text-zinc-500">{text}</div>;
}

function formatNumber(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString();
}
