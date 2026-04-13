import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Check, Link2, Loader2 } from 'lucide-react';

import { api, type ApiConnection } from '../lib/api';

const CONNECTABLE_PLATFORMS = {
  YOUTUBE: 'youtube',
  INSTAGRAM: 'instagram',
  TIKTOK: 'tiktok',
} as const;

export function Settings() {
  const [platforms, setPlatforms] = useState<ApiConnection[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const oauthNotice = useMemo(() => {
    if (typeof window === 'undefined') {
      return null;
    }

    const params = new URLSearchParams(window.location.search);
    const oauthStatus = params.get('oauthStatus');
    const oauthPlatform = params.get('oauthPlatform');
    const oauthMessage = params.get('oauthMessage');

    if (!oauthStatus || !oauthPlatform) {
      return null;
    }

    return {
      status: oauthStatus,
      platform: oauthPlatform,
      message:
        oauthStatus === 'success'
          ? `${titleCase(oauthPlatform)} connected successfully.`
          : oauthMessage ?? `${titleCase(oauthPlatform)} connection failed.`,
    };
  }, []);

  useEffect(() => {
    void loadConnections();
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const url = new URL(window.location.href);
    const hasOauthParams =
      url.searchParams.has('oauthStatus') ||
      url.searchParams.has('oauthPlatform') ||
      url.searchParams.has('oauthMessage');

    if (!hasOauthParams) {
      return;
    }

    url.searchParams.delete('oauthStatus');
    url.searchParams.delete('oauthPlatform');
    url.searchParams.delete('oauthMessage');
    window.history.replaceState({}, '', url);
  }, []);

  async function loadConnections() {
    try {
      setIsLoading(true);
      setError(null);
      const data = await api.connections.list();
      setPlatforms(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load platform connections.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleConnect(platform: keyof typeof CONNECTABLE_PLATFORMS) {
    try {
      setBusyKey(platform);
      setError(null);
      const response = await api.connections.start(CONNECTABLE_PLATFORMS[platform]);
      window.location.assign(response.url);
    } catch (err) {
      setBusyKey(null);
      setError(err instanceof Error ? err.message : 'Unable to start OAuth.');
    }
  }

  async function handleDisconnect(accountId: string) {
    try {
      setBusyKey(accountId);
      setError(null);
      await api.connections.disconnect(accountId);
      await loadConnections();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to disconnect this account.');
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h2 className="text-2xl">Settings</h2>
        <p className="text-zinc-500 mt-1">Platform connections and automation preferences</p>
      </div>

      {oauthNotice && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm shadow-lg ${
            oauthNotice.status === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'
              : 'border-red-500/30 bg-red-500/10 text-red-200'
          }`}
        >
          {oauthNotice.message}
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200 shadow-lg">
          {error}
        </div>
      )}

      <div className="space-y-6">
        <div>
          <h3 className="text-sm text-zinc-500 mb-4 uppercase tracking-wider font-medium">Connected platforms</h3>
          <div className="space-y-2">
            {isLoading && (
              <div className="p-4 bg-white/5 backdrop-blur-md rounded-xl border border-white/10 text-zinc-400">
                Loading connections...
              </div>
            )}

            {!isLoading &&
              platforms.map((platform) => {
                const primaryAccount = platform.accounts[0] ?? null;
                const isBusy = busyKey === platform.platform || busyKey === primaryAccount?.id;
                const showWarning =
                  !platform.connectable || primaryAccount?.status === 'REAUTH_REQUIRED';
                const canConnect = platform.platform in CONNECTABLE_PLATFORMS;

                return (
                  <div
                    key={platform.platform}
                    className="p-4 bg-white/5 backdrop-blur-md rounded-xl border border-white/10 flex items-center justify-between shadow-lg hover:bg-white/[0.07] transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center border ${
                          platform.connected
                            ? 'bg-emerald-500/10 border-emerald-500/30'
                            : 'bg-white/5 border-white/10'
                        }`}
                      >
                        {platform.connected ? (
                          <Check size={18} className="text-emerald-400" />
                        ) : (
                          <Link2 size={16} className="text-zinc-600" />
                        )}
                      </div>
                      <div>
                        <div className="text-zinc-100 font-medium">{platform.label}</div>
                        {primaryAccount && (
                          <div className="text-sm text-zinc-500">{primaryAccount.accountLabel}</div>
                        )}
                        <div className="text-xs text-zinc-600 mt-0.5 flex items-center gap-1">
                          {showWarning && <AlertTriangle size={10} className="text-amber-500" />}
                          {platform.note}
                        </div>
                      </div>
                    </div>

                    <button
                      disabled={isBusy || (!platform.connected && !platform.connectable)}
                      onClick={() => {
                        if (primaryAccount && platform.connected) {
                          void handleDisconnect(primaryAccount.id);
                          return;
                        }

                        if (canConnect) {
                          void handleConnect(platform.platform as keyof typeof CONNECTABLE_PLATFORMS);
                        }
                      }}
                      className={`px-4 py-2 rounded-lg text-sm transition-all inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed ${
                        platform.connected
                          ? 'bg-white/10 backdrop-blur-sm text-zinc-400 hover:bg-white/20 border border-white/10'
                          : platform.connectable
                            ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 border border-emerald-500/30 shadow-lg shadow-emerald-500/10'
                            : 'bg-white/5 text-zinc-500 border border-white/10'
                      }`}
                    >
                      {isBusy && <Loader2 size={14} className="animate-spin" />}
                      {platform.connected
                        ? 'Disconnect'
                        : platform.connectable
                          ? 'Connect via OAuth'
                          : 'Unavailable'}
                    </button>
                  </div>
                );
              })}
          </div>
        </div>

        <div>
          <h3 className="text-sm text-zinc-500 mb-4 uppercase tracking-wider font-medium">Automation mode</h3>
          <div className="space-y-3">
            <label className="flex items-center justify-between p-4 bg-white/5 backdrop-blur-md rounded-xl border border-white/10 cursor-pointer hover:bg-white/[0.07] transition-all shadow-lg group">
              <div>
                <div className="text-zinc-100 font-medium">Full automation</div>
                <div className="text-sm text-zinc-500">Axora publishes without approval (Pro tier)</div>
              </div>
              <input type="radio" name="mode" defaultChecked className="accent-emerald-500 w-4 h-4" />
            </label>
            <label className="flex items-center justify-between p-4 bg-white/5 backdrop-blur-md rounded-xl border border-white/10 cursor-pointer hover:bg-white/[0.07] transition-all shadow-lg">
              <div>
                <div className="text-zinc-100 font-medium">Review mode</div>
                <div className="text-sm text-zinc-500">Approve each post before publishing</div>
              </div>
              <input type="radio" name="mode" className="accent-emerald-500 w-4 h-4" />
            </label>
          </div>
        </div>

        <div>
          <h3 className="text-sm text-zinc-500 mb-4 uppercase tracking-wider font-medium">Distribution preferences</h3>
          <div className="space-y-3">
            {[
              {
                label: 'Multi-wave lifecycle',
                desc: 'Automatically repackage and redistribute content across waves',
              },
              {
                label: 'Competitive monitoring',
                desc: 'Track YouTube competitors and exploit posting gaps (weekly report)',
              },
              {
                label: 'Cross-platform sequencing',
                desc: 'Coordinate posts as a multi-platform campaign narrative',
              },
              {
                label: 'Account health monitoring',
                desc: 'Auto-pause posting if engagement cliff or auth failure detected',
              },
            ].map((pref) => (
              <label
                key={pref.label}
                className="flex items-center justify-between p-4 bg-white/5 backdrop-blur-md rounded-xl border border-white/10 hover:bg-white/[0.07] transition-all shadow-lg cursor-pointer"
              >
                <div>
                  <div className="text-zinc-100 font-medium">{pref.label}</div>
                  <div className="text-sm text-zinc-500">{pref.desc}</div>
                </div>
                <input type="checkbox" defaultChecked className="accent-emerald-500 w-5 h-5" />
              </label>
            ))}
          </div>
        </div>

        <div>
          <h3 className="text-sm text-zinc-500 mb-4 uppercase tracking-wider font-medium">AI generation</h3>
          <div className="p-5 bg-white/5 backdrop-blur-md rounded-xl border border-white/10 space-y-4 shadow-xl">
            <div>
              <div className="text-sm font-medium text-zinc-300 mb-2">Caption tone</div>
              <div className="flex gap-2 flex-wrap">
                {['Casual & relatable', 'Professional', 'Bold & provocative', 'Educational'].map((tone) => (
                  <button
                    key={tone}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                      tone === 'Casual & relatable'
                        ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
                        : 'bg-white/5 border-white/10 text-zinc-400 hover:border-white/20'
                    }`}
                  >
                    {tone}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm font-medium text-zinc-300 mb-2">Brand voice context</div>
              <textarea
                className="w-full bg-white/5 border border-white/10 rounded-lg p-3 text-sm text-zinc-300 placeholder:text-zinc-600 resize-none focus:outline-none focus:border-white/20 transition-all"
                rows={3}
                placeholder="e.g. 'I help developers build with AI. Direct, no fluff, occasionally funny. No corporate speak.'"
              />
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-sm text-zinc-500 mb-4 uppercase tracking-wider font-medium">Account</h3>
          <div className="p-6 bg-white/5 backdrop-blur-md rounded-xl border border-white/10 space-y-4 shadow-xl">
            <div className="flex justify-between">
              <span className="text-zinc-400">Current plan</span>
              <span className="text-emerald-400 font-medium">Pro - $19/mo</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Billing cycle</span>
              <span className="text-zinc-300">Monthly</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">Next renewal</span>
              <span className="text-zinc-300">May 12, 2026</span>
            </div>
            <div className="pt-4 border-t border-white/10">
              <button className="w-full px-4 py-2 bg-white/10 backdrop-blur-sm text-zinc-300 rounded-lg hover:bg-white/20 transition-all border border-white/10">
                Manage subscription
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function titleCase(value: string) {
  return value
    .replace(/_/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((token) => token[0]?.toUpperCase() + token.slice(1))
    .join(' ');
}
