import { Clock, CheckCircle2, Circle, PlayCircle, MoreHorizontal, RefreshCw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { motion } from 'motion/react';

type StatusType = 'live' | 'scheduled' | 'pending' | 'processing' | 'needs-review';

interface QueuePost {
  title: string;
  platform: string;
  scheduledFor: string;
  wave: number;
  status: StatusType;
  aiGenerated: boolean;
  caption: string;
  hashtags: string[];
}

export function Queue() {
  const [selected, setSelected] = useState<number | null>(null);

  const posts: QueuePost[] = [
    {
      title: 'Morning routine optimization',
      platform: 'YouTube',
      scheduledFor: 'Today · 4:00 PM',
      wave: 1,
      status: 'live',
      aiGenerated: true,
      caption: 'The morning routine most creators sleep on 🌅 Optimizing every hour of your morning for peak creative output. Full breakdown inside.',
      hashtags: ['#morningroutine', '#productivity', '#creatorlife', '#youtuber'],
    },
    {
      title: 'Tool recommendations 2025',
      platform: 'Instagram',
      scheduledFor: 'Today · 8:30 PM',
      wave: 2,
      status: 'scheduled',
      aiGenerated: true,
      caption: 'These 5 tools changed everything for me this year. Swipe to see which ones made the cut 👆',
      hashtags: ['#tools2025', '#aitools', '#creatortips', '#contentcreator'],
    },
    {
      title: 'Deep work protocol breakdown',
      platform: 'YouTube',
      scheduledFor: 'Tomorrow · 9:00 AM',
      wave: 1,
      status: 'pending',
      aiGenerated: true,
      caption: 'The exact deep work protocol I use to get 6 hours of focus work done in 4 hours.',
      hashtags: ['#deepwork', '#focus', '#productivity', '#worksmarter'],
    },
    {
      title: 'Behind the scenes - studio setup',
      platform: 'Instagram',
      scheduledFor: 'Tomorrow · 6:00 PM',
      wave: 1,
      status: 'needs-review',
      aiGenerated: true,
      caption: 'Finally showing you the full studio setup after 2 years 👀 Every piece of gear linked in bio.',
      hashtags: ['#studiostour', '#contentcreator', '#setup', '#bts'],
    },
    {
      title: 'Why 90% of creators fail',
      platform: 'YouTube',
      scheduledFor: 'Wed · 8:00 PM',
      wave: 1,
      status: 'pending',
      aiGenerated: false,
      caption: 'The brutal truth about why most creators give up — and the one thing that separates the ones who make it.',
      hashtags: ['#contentcreator', '#youtube', '#creatortips', '#growth'],
    },
    {
      title: 'AI workflow in 2025',
      platform: 'Instagram',
      scheduledFor: 'Thu · 10:00 AM',
      wave: 1,
      status: 'processing',
      aiGenerated: true,
      caption: '',
      hashtags: [],
    },
  ];

  const statusConfig: Record<StatusType, { label: string; color: string; dot: string; icon: typeof Clock }> = {
    live:           { label: 'Live',         color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20', dot: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]', icon: PlayCircle },
    scheduled:      { label: 'Scheduled',    color: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',         dot: 'bg-cyan-400',   icon: Clock },
    pending:        { label: 'Pending',      color: 'text-zinc-400 bg-zinc-800 border-zinc-700',               dot: 'bg-zinc-500',   icon: Circle },
    processing:     { label: 'Processing',   color: 'text-violet-400 bg-violet-400/10 border-violet-400/20',   dot: 'bg-violet-400', icon: RefreshCw },
    'needs-review': { label: 'Needs review', color: 'text-amber-400 bg-amber-400/10 border-amber-400/20',      dot: 'bg-amber-400',  icon: CheckCircle2 },
  };

  const platformColors: Record<string, string> = {
    YouTube: 'text-red-400',
    Instagram: 'text-pink-400',
    TikTok: 'text-zinc-300',
    LinkedIn: 'text-cyan-400',
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl">Post queue</h2>
          <p className="text-zinc-500 mt-1">12 posts scheduled · Next in 2h 14m</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-zinc-500 px-3 py-1.5 bg-white/5 rounded-lg border border-white/10">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Auto-posting on
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2">
        {['All', 'YouTube', 'Instagram', 'Needs review'].map((f) => (
          <button key={f} className="px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 text-zinc-400 hover:text-white hover:bg-white/5 transition-all first:bg-white/10 first:text-white first:border-white/20">
            {f}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {posts.map((post, i) => {
          const cfg = statusConfig[post.status];
          const StatusIcon = cfg.icon;
          const isExpanded = selected === i;

          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`bg-gradient-to-r from-zinc-900/60 to-zinc-950/60 backdrop-blur-xl rounded-2xl border transition-all overflow-hidden ${
                isExpanded ? 'border-white/20 shadow-[0_0_30px_-5px_rgba(255,255,255,0.06)]' : 'border-white/10 hover:border-white/20'
              }`}
            >
              <button
                onClick={() => setSelected(isExpanded ? null : i)}
                className="w-full p-5 text-left"
              >
                <div className="flex items-center gap-4">
                  {/* Status dot */}
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot} ${post.status === 'live' ? 'animate-pulse' : ''}`} />

                  {/* Title + meta */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-sm font-medium ${platformColors[post.platform] ?? 'text-zinc-400'}`}>
                        {post.platform}
                      </span>
                      <span className="text-zinc-700">·</span>
                      <span className="text-sm text-zinc-500">{post.scheduledFor}</span>
                      <span className="text-zinc-700">·</span>
                      <span className="text-xs text-zinc-600">Wave {post.wave}</span>
                      {post.aiGenerated && (
                        <span className="flex items-center gap-1 text-xs text-violet-400/70">
                          <Sparkles size={10} />
                          AI
                        </span>
                      )}
                    </div>
                    <p className="text-white font-medium truncate">{post.title}</p>
                  </div>

                  {/* Status badge + action */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <span className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border ${cfg.color}`}>
                      <StatusIcon size={11} className={post.status === 'processing' ? 'animate-spin' : ''} />
                      {cfg.label}
                    </span>
                    <button className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/5 transition-all">
                      <MoreHorizontal size={16} />
                    </button>
                  </div>
                </div>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="border-t border-white/10 p-5 space-y-4"
                >
                  {post.status === 'processing' ? (
                    <div className="flex items-center gap-3 text-sm text-zinc-400">
                      <RefreshCw size={14} className="animate-spin text-violet-400" />
                      Axora is generating caption and hashtags...
                    </div>
                  ) : (
                    <>
                      <div>
                        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">AI-generated caption</div>
                        <p className="text-sm text-zinc-300 leading-relaxed bg-white/5 rounded-xl p-4 border border-white/10">
                          {post.caption}
                        </p>
                      </div>
                      <div>
                        <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Hashtags</div>
                        <div className="flex flex-wrap gap-2">
                          {post.hashtags.map((tag, j) => (
                            <span key={j} className="text-xs px-2 py-1 bg-violet-500/10 text-violet-400 rounded-md border border-violet-500/20">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="flex gap-2 pt-2">
                        {post.status === 'needs-review' && (
                          <button className="px-4 py-2 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-sm font-medium hover:bg-emerald-500/30 transition-all">
                            Approve & publish
                          </button>
                        )}
                        <button className="px-4 py-2 bg-white/5 text-zinc-400 border border-white/10 rounded-lg text-sm hover:bg-white/10 transition-all">
                          Edit caption
                        </button>
                        <button className="px-4 py-2 bg-white/5 text-zinc-400 border border-white/10 rounded-lg text-sm hover:bg-white/10 transition-all">
                          Reschedule
                        </button>
                        <button className="ml-auto px-4 py-2 bg-red-500/10 text-red-400 border border-red-500/20 rounded-lg text-sm hover:bg-red-500/20 transition-all">
                          Remove
                        </button>
                      </div>
                    </>
                  )}
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
