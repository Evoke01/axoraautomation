import { TrendingUp, AlertCircle, Clock, Target, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export function CompetitiveIntel() {
  const [data, setData] = useState<{ opportunities: any[], competitors: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  async function loadReport() {
    try {
      const res = await api.intelligence.weekly();
      if (res && res.report) {
        setData(res.report);
        setLastUpdated(res.generatedAt);
      }
    } catch (err) {
      console.error("Failed to load intelligence", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReport();
  }, []);

  async function handleGenerate() {
    setGenerating(true);
    try {
      await api.intelligence.generate();
      await loadReport();
    } catch (err) {
      console.error(err);
    } finally {
      setGenerating(false);
    }
  }

  const priorityColors: Record<string, string> = {
    high: 'text-emerald-400 bg-emerald-400/10',
    medium: 'text-amber-400 bg-amber-400/10',
    low: 'text-zinc-400 bg-zinc-800',
  };

  const typeIcons: Record<string, typeof TrendingUp> = {
    Gap: Target,
    Trend: TrendingUp,
    Saturation: AlertCircle,
  };

  if (loading) {
    return <div className="text-zinc-400 animate-pulse">Loading intelligence...</div>;
  }

  const opportunities = data?.opportunities || [];
  const competitors = data?.competitors || [];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold bg-gradient-to-r from-emerald-400 via-cyan-400 to-violet-400 bg-clip-text text-transparent drop-shadow-sm">
            Competitive intelligence
          </h2>
          <p className="text-zinc-400 mt-2 font-medium">
            YouTube market gaps and trend analysis 
            {lastUpdated && ` - Updated ${new Date(lastUpdated).toLocaleString()}`}
          </p>
        </div>
        
        <button
          onClick={handleGenerate}
          disabled={generating}
          className="flex items-center gap-2 px-4 py-2 bg-zinc-900 border border-white/10 rounded-lg text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={16} className={generating ? "animate-spin text-cyan-400" : "text-zinc-400"} />
          {generating ? "Analyzing..." : "Refresh Analysis"}
        </button>
      </div>

      {!data && !generating && (
         <div className="p-8 text-center bg-zinc-900/40 border border-white/10 rounded-xl">
            <Target size={32} className="mx-auto text-zinc-600 mb-3" />
            <p className="text-zinc-400 font-medium">No intelligence report generated yet.</p>
            <p className="text-sm text-zinc-500 mt-1">Click refresh to scan your competitors and recent assets.</p>
         </div>
      )}

      {data && (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-semibold tracking-wider uppercase text-zinc-500 mb-4">Opportunities this week</h3>
            {opportunities.length === 0 ? (
              <p className="text-zinc-500 text-sm">No new actionable gaps detected this cycle.</p>
            ) : (
              <div className="space-y-3">
                {opportunities.map((opportunity, index) => {
                  const TypeIcon = typeIcons[opportunity.type] || Target;
                  return (
                    <div
                      key={index}
                      className="p-4 sm:p-6 bg-gradient-to-br from-zinc-900/60 to-zinc-950/60 backdrop-blur-xl rounded-2xl border border-white/10 hover:border-white/30 space-y-4 shadow-xl hover:shadow-cyan-500/10 transition-all overflow-hidden relative group"
                    >
                      <div className="absolute top-0 right-0 w-40 sm:w-48 h-40 sm:h-48 bg-cyan-500/5 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                      <div className="flex items-start gap-4 relative z-10">
                        <div className="p-3 bg-gradient-to-tr from-white/10 to-white/5 backdrop-blur-md rounded-xl border border-white/20 shadow-md shrink-0">
                          <TypeIcon size={20} className="text-cyan-400" />
                        </div>
                        <div className="flex-1 space-y-2 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-semibold uppercase tracking-wider px-2.5 py-1 rounded-md border border-white/10 shadow-sm ${priorityColors[opportunity.priority] || priorityColors.medium}`}>
                              {opportunity.priority} priority
                            </span>
                            <span className="text-xs text-zinc-600">|</span>
                            <span className="text-xs font-medium text-zinc-400">{opportunity.platform}</span>
                          </div>
                          <h4 className="text-lg font-bold text-white drop-shadow-sm break-words">{opportunity.title}</h4>
                          <p className="text-sm font-medium text-zinc-400 leading-relaxed">{opportunity.description}</p>
                        </div>
                      </div>
                      <div className="pt-4 mt-2 border-t border-white/10 flex items-start gap-2 text-sm relative z-10">
                        <Clock size={16} className="text-cyan-500 mt-0.5 shrink-0" />
                        <span className="text-white font-medium">{opportunity.action}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-sm font-semibold tracking-wider uppercase text-zinc-500 mb-4">Tracked competitors</h3>
            {competitors.length === 0 ? (
               <p className="text-zinc-500 text-sm">No competitor signals tracked yet.</p>
            ) : (
              <div className="space-y-2">
                {competitors.map((competitor, index) => (
                  <div
                    key={index}
                    className="p-4 bg-gradient-to-r from-zinc-900/40 to-zinc-950/40 backdrop-blur-md rounded-xl border border-white/10 shadow-lg hover:border-white/20 transition-all group"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-12 h-12 bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-md rounded-full border border-white/20 flex items-center justify-center shadow-inner group-hover:scale-110 transition-transform shrink-0">
                          <span className="text-white/60 font-bold">{competitor.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="text-white font-semibold drop-shadow-sm truncate">{competitor.name}</div>
                          <div className="text-sm font-medium text-cyan-400/80">{competitor.followers} followers</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-4 sm:gap-8 tabular-nums items-center">
                        <div className="text-left sm:text-right">
                          <div className="text-white font-bold text-lg bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-transparent">{competitor.engagement}</div>
                          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">engagement</div>
                        </div>
                        <div className="text-left sm:text-right">
                          <div className="text-white font-bold text-lg bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-transparent">{competitor.posts}</div>
                          <div className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">frequency</div>
                        </div>
                        <div className="text-left sm:text-right">
                          <div
                            className={`font-bold text-xl ${
                              competitor.trend === 'up'
                                ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]'
                                : competitor.trend === 'down'
                                  ? 'text-rose-400 drop-shadow-[0_0_8px_rgba(251,113,133,0.5)]'
                                  : 'text-zinc-500'
                            }`}
                          >
                            {competitor.trend === 'up' ? 'up' : competitor.trend === 'down' ? 'down' : 'flat'}
                          </div>
                          <div className="text-xs text-zinc-600">trend</div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
