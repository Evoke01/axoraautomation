import { Play, RefreshCw, Archive, ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';

export function AssetLibrary() {
  const [expandedAsset, setExpandedAsset] = useState<number | null>(null);

  const assets = [
    {
      title: 'Morning routine optimization',
      uploaded: '2 days ago',
      stage: 'Active - Wave 1',
      platforms: ['TikTok', 'Instagram', 'YouTube'],
      totalViews: '847K',
      waves: [
        { wave: 1, platform: 'TikTok', views: '284K', engagement: '12.4%', status: 'active' },
        { wave: 1, platform: 'Instagram', views: '156K', engagement: '9.7%', status: 'active' },
        { wave: 1, platform: 'YouTube', views: '89K', engagement: '8.1%', status: 'active' },
      ],
      nextAction: 'Monitor until 48h, then evaluate for Wave 2',
    },
    {
      title: 'Tool recommendations',
      uploaded: '1 week ago',
      stage: 'Active - Wave 2',
      platforms: ['TikTok', 'Instagram', 'X'],
      totalViews: '1.2M',
      waves: [
        { wave: 1, platform: 'TikTok', views: '421K', engagement: '14.2%', status: 'completed' },
        { wave: 1, platform: 'Instagram', views: '198K', engagement: '11.1%', status: 'completed' },
        { wave: 2, platform: 'X', views: '89K', engagement: '8.4%', status: 'active' },
        { wave: 2, platform: 'TikTok', views: '124K', engagement: '9.8%', status: 'scheduled' },
      ],
      nextAction: 'Split into micro-clips for third distribution wave',
    },
    {
      title: 'Productivity system breakdown',
      uploaded: '2 weeks ago',
      stage: 'Archived',
      platforms: ['YouTube', 'LinkedIn'],
      totalViews: '2.1M',
      waves: [
        { wave: 1, platform: 'YouTube', views: '1.4M', engagement: '15.8%', status: 'completed' },
        { wave: 1, platform: 'LinkedIn', views: '287K', engagement: '12.3%', status: 'completed' },
        { wave: 2, platform: 'X', views: '198K', engagement: '9.1%', status: 'completed' },
        { wave: 2, platform: 'TikTok', views: '156K', engagement: '7.4%', status: 'completed' },
      ],
      nextAction: 'Performance plateau reached - archived for future trend matching',
    },
  ];

  const stageColors: Record<string, string> = {
    'Active - Wave 1': 'text-emerald-400',
    'Active - Wave 2': 'text-amber-400',
    'Archived': 'text-zinc-500',
  };

  const stageIcons: Record<string, typeof Play> = {
    'Active - Wave 1': Play,
    'Active - Wave 2': RefreshCw,
    'Archived': Archive,
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl">Asset library</h2>
        <p className="text-zinc-500 mt-1">Multi-wave lifecycle tracking</p>
      </div>

      <div className="space-y-3">
        {assets.map((asset, i) => {
          const isExpanded = expandedAsset === i;
          const StageIcon = stageIcons[asset.stage];

          return (
            <div key={i} className="bg-gradient-to-br from-zinc-900/80 to-zinc-950/80 backdrop-blur-xl rounded-2xl border border-white/10 overflow-hidden shadow-2xl relative group hover:border-white/20 transition-all">
              <div className="absolute top-[-50px] left-[-50px] w-32 h-32 bg-cyan-500/10 rounded-full blur-3xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              <button
                onClick={() => setExpandedAsset(isExpanded ? null : i)}
                className="w-full p-6 text-left hover:bg-white/[0.02] transition-colors relative z-10"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-3">
                      <StageIcon size={16} className={stageColors[asset.stage]} />
                      <span className={`text-sm ${stageColors[asset.stage]}`}>
                        {asset.stage}
                      </span>
                      <span className="text-sm text-zinc-600">•</span>
                      <span className="text-sm text-zinc-500">{asset.uploaded}</span>
                    </div>
                    <h3 className="text-xl font-semibold text-white tracking-tight drop-shadow-sm">{asset.title}</h3>
                    <div className="flex items-center gap-2">
                      {asset.platforms.map((platform, j) => (
                        <span key={j} className="text-xs px-2.5 py-1 bg-gradient-to-r from-white/10 to-white/5 backdrop-blur-md rounded-md text-zinc-300 border border-white/10 font-medium tracking-wide">
                          {platform}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-3xl font-bold bg-gradient-to-br from-white to-zinc-500 bg-clip-text text-transparent tabular-nums">{asset.totalViews}</div>
                      <div className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">total views</div>
                    </div>
                    <ChevronDown
                      size={20}
                      className={`text-zinc-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </div>
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
                    <div className="p-6 space-y-4">
                  <div className="space-y-2">
                    {asset.waves.map((wave, j) => (
                      <div key={j} className="flex items-center justify-between p-3 bg-white/5 backdrop-blur-sm rounded border border-white/10">
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-zinc-500 w-16">Wave {wave.wave}</span>
                          <span className="text-sm text-zinc-300 w-24">{wave.platform}</span>
                          <span className={`text-xs px-2 py-1 rounded ${
                            wave.status === 'active' ? 'bg-emerald-500/20 text-emerald-400' :
                            wave.status === 'scheduled' ? 'bg-blue-500/20 text-blue-400' :
                            'bg-white/10 text-zinc-400'
                          }`}>
                            {wave.status}
                          </span>
                        </div>
                        <div className="flex gap-6 tabular-nums text-sm">
                          <div>
                            <span className="text-zinc-400">{wave.views}</span>
                            <span className="text-zinc-600 ml-1">views</span>
                          </div>
                          <div>
                            <span className="text-zinc-400">{wave.engagement}</span>
                            <span className="text-zinc-600 ml-1">eng.</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                      <div className="pt-3 border-t border-white/10 text-sm text-zinc-500">
                        Next: {asset.nextAction}
                      </div>
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
