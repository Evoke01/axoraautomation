const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers }
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message || `Request failed: ${res.status}`);
  }
  return res.json();
}

export interface ApiConnection {
  platform: string;
  label: string;
  note: string;
  connectable: boolean;
  connected: boolean;
  accounts: Array<{
    id: string;
    accountLabel: string;
    status: string;
    externalAccountId: string | null;
    tokenExpiresAt: string | null;
    metadata?: Record<string, unknown> | null;
  }>;
}

export interface ApiPost {
  id: string;
  platform: string;
  status: string;
  publishedAt: string | null;
  externalUrl: string | null;
  lastPolledAt: string | null;
  nextPollAt: string | null;
  metricsFreshnessMinutes: number | null;
  metrics: { views?: number; likes?: number; comments?: number } | null;
  asset: { id: string; title: string; status: string };
  decision: {
    id: string;
    platform: string;
    format: string;
    scheduledFor: string;
    score: number;
    metadataVariant: { caption: string; hashtags: string[]; title: string; hook: string } | null;
    campaignWave: { waveNumber: number } | null;
  };
  connectedAccount: { accountLabel: string } | null;
}

export interface ApiAsset {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  rawNotes: string | null;
  totalViews?: number;
  metricsFreshnessMinutes?: number | null;
  tags: { label: string; kind: string }[];
  campaigns: Array<{
    id: string;
    status: string;
    waves: Array<{
      id: string;
      waveNumber: number;
      status: string;
      decisions: Array<{
        id: string;
        platform: string;
        format: string;
        status: string;
        scheduledFor: string;
        post: {
          id: string;
          status: string;
          publishedAt: string | null;
          externalUrl: string | null;
          externalPostId?: string | null;
          lastPolledAt?: string | null;
          nextPollAt?: string | null;
          metrics?: { views?: number; likes?: number; comments?: number } | null;
          snapshots: Array<{ views: number | null; likes: number | null; comments: number | null; capturedAt?: string }>;
        } | null;
      }>;
    }>;
  }>;
  assetIntelligence?: {
    summary?: string;
    hook?: string;
    keywords?: string[];
  } | null;
  youtubeContext?: {
    externalVideoId: string;
    genreHint: string | null;
    channelId: string;
    channelTrend: {
      avgViews30d: number;
      medianViews30d: number;
      confidence: number;
      computedAt: string;
      publishingWindows: Record<string, number>;
    } | null;
  } | null;
  freshnessAt?: string | null;
}

export interface ApiSession {
  user: { id: string; name: string | null; email: string | null };
  workspace: { id: string; name: string };
  creator: { id: string; name: string } | null;
  entitlements: { plan: string; autoPublishEnabled: boolean } | null;
}

export interface ApiSummary {
  assets: number;
  publishedPosts: number;
  pendingReview: number;
  latestOpportunityReportAt: string | null;
  channelTotals: {
    totalVideos: number;
    totalViews: number;
    subscriberCount: number | null;
    channelViewsRecentWindow: number | null;
  };
  axoraTotals: {
    axoraPublishedPosts: number;
    axoraManagedViews: number;
    axoraManagedLikes: number;
    axoraManagedComments: number;
  };
  performanceHistory: Array<{
    day: string;
    date: string;
    views: number;
    likes: number;
    comments: number;
    engagement: number;
    watchTimeMinutes: number;
  }>;
  platformMix: Array<{ name: string; value: number; color: string }>;
  systemHealth: Array<{ label: string; used: string; total: string; pct: number; color: string }>;
  freshness: {
    channelAnalyticsMinutes: number | null;
    axoraMetricsMinutes: number | null;
    competitorMinutes: number | null;
  };
  partialFlags: {
    youtubeReconnectRequired: boolean;
    channelAnalyticsAvailable: boolean;
    competitorWarmup: boolean;
    metricsSyncing: boolean;
  };
}

export interface ApiIntelligenceOverview {
  channel: {
    connected: boolean;
    reconnectRequired: boolean;
    analyticsEnabled: boolean;
    freshnessMinutes: number | null;
    totals: {
      totalViews: number;
      totalSubscribers: number | null;
      totalVideos: number;
      recentViews: number | null;
    } | null;
    bestPublishingWindows: Record<string, number> | null;
    topMovers: Array<{
      id: string;
      assetId: string;
      title: string;
      views: number;
      likes: number;
      comments: number;
      publishedAt: string | null;
      freshnessMinutes: number | null;
    }>;
    formatSplit: Array<{ label: string; count: number }>;
    underperformers: Array<{
      id: string;
      assetId: string;
      title: string;
      views: number;
      baselineViews: number;
      recommendedAction: string;
      publishedAt: string | null;
    }>;
  };
  competitors: {
    freshnessMinutes: number | null;
    warmup: boolean;
    channels: Array<{
      id: string;
      name: string;
      subscriberCount: number | null;
      totalVideos: number | null;
      avgViews: number;
      postingWindow: string;
      topicKeywords: string[];
      trend: string;
      freshnessMinutes: number | null;
    }>;
    opportunities: Array<{
      type: string;
      title: string;
      description: string;
      action: string;
      confidence: number;
      sourceFreshnessMinutes: number | null;
    }>;
  };
  weeklyBrief: {
    generatedAt: string;
    status: string;
  } | null;
  partialFlags: {
    youtubeReconnectRequired: boolean;
    competitorWarmup: boolean;
  };
}

export const api = {
  auth: {
    resolveSession: () => request<ApiSession>("/auth/session/resolve", { method: "POST" }),
  },

  connections: {
    list: () => request<ApiConnection[]>("/connections"),
    start: (platform: string) =>
      request<{ url: string }>(`/connections/${platform}/start`, { method: "POST" }),
    disconnect: (accountId: string) =>
      request<{ disconnected: boolean }>(`/connections/${accountId}`, { method: "DELETE" }),
  },

  uploads: {
    init: (body: { workspaceId: string; fileName: string; contentType: string; fileSizeBytes: number }) =>
      request<{ uploadSessionId: string; uploadId: string; objectKey: string }>(
        "/uploads/multipart/init", { method: "POST", body: JSON.stringify(body) }
      ),
    partUrl: (body: { uploadSessionId: string; partNumber: number }) =>
      request<{ url: string; partNumber: number }>(
        "/uploads/multipart/part-url", { method: "POST", body: JSON.stringify(body) }
      ),
    complete: (body: { uploadSessionId: string; parts: { etag: string; partNumber: number }[] }) =>
      request<{ completed: boolean }>(
        "/uploads/multipart/complete", { method: "POST", body: JSON.stringify(body) }
      ),
  },

  dashboard: {
    getSummary: () => request<ApiSummary>("/dashboard/summary"),
  },

  posts: {
    list: () => request<ApiPost[]>("/posts"),
  },

  assets: {
    list: () => request<ApiAsset[]>("/assets"),
    get: (id: string) => request<ApiAsset>(`/assets/${id}`),
    create: (data: { workspaceId: string; creatorId: string; uploadSessionId: string; title: string; rawNotes?: string }) =>
      request<ApiAsset>("/assets", { method: "POST", body: JSON.stringify(data) }),
    plan: (id: string) =>
      request<{ queued: boolean }>(`/assets/${id}/plan`, { method: "POST" }),
    approve: (id: string) =>
      request<{ approved: boolean }>(`/assets/${id}/approve`, { method: "POST" }),
  },

  health: {
    check: () => request<{ status: string }>("/health"),
  },

  intelligence: {
    overview: () => request<ApiIntelligenceOverview>("/intelligence/overview"),
    weekly: () => request<{ report: { opportunities: any[]; competitors: any[] }; generatedAt: string } | null>("/intelligence/weekly"),
    refresh: () => request<{ queued: boolean }>("/intelligence/refresh", { method: "POST" }),
    generate: () => request<{ success: boolean }>("/intelligence/generate", { method: "POST" }),
  }
};
