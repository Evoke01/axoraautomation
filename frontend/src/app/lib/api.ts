const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    }
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(body.message || `Request failed: ${res.status}`);
  }

  return res.json();
}

export interface ApiPost {
  id: string;
  platform: string;
  status: string;
  publishedAt: string | null;
  externalUrl: string | null;
  metrics: { views?: number; likes?: number; comments?: number } | null;
  asset: { id: string; title: string; status: string };
  decision: {
    id: string;
    platform: string;
    format: string;
    scheduledFor: string;
    score: number;
    metadataVariant: {
      caption: string;
      hashtags: string[];
      title: string;
      hook: string;
    } | null;
    campaignWave: {
      waveNumber: number;
    } | null;
  };
  connectedAccount: { accountLabel: string } | null;
}

export interface ApiAsset {
  id: string;
  title: string;
  status: string;
  createdAt: string;
  rawNotes: string | null;
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
          snapshots: Array<{
            views: number | null;
            likes: number | null;
            comments: number | null;
          }>;
        } | null;
      }>;
    }>;
  }>;
}

export interface ApiConnectionAccount {
  id: string;
  accountLabel: string;
  externalAccountId: string | null;
  status: string;
  tokenExpiresAt: string | null;
  metadata: unknown;
}

export interface ApiConnection {
  platform: string;
  label: string;
  connectable: boolean;
  configured: boolean;
  connected: boolean;
  note: string;
  accounts: ApiConnectionAccount[];
}

type ConnectablePlatform = "youtube" | "instagram" | "tiktok";

export const api = {
  dashboard: {
    getSummary: () =>
      request<{
        assets: number;
        publishedPosts: number;
        pendingReview: number;
        latestOpportunityReportAt: string | null;
      }>("/dashboard/summary"),
  },

  posts: {
    list: () => request<ApiPost[]>("/posts"),
  },

  assets: {
    list: () => request<ApiAsset[]>("/assets"),
    get: (id: string) => request<ApiAsset>(`/assets/${id}`),
    create: (data: { workspaceId: string; creatorId: string; title: string; rawNotes?: string }) =>
      request<ApiAsset>("/assets", {
        method: "POST",
        body: JSON.stringify(data)
      }),
    plan: (id: string) =>
      request<{ queued: boolean }>(`/assets/${id}/plan`, { method: "POST" }),
    approve: (id: string) =>
      request<{ approved: boolean }>(`/assets/${id}/approve`, { method: "POST" }),
  },

  auth: {
    resolveSession: () =>
      request<{
        user: { id: string; name: string; email: string };
        workspace: { id: string; name: string };
        creator: { id: string; name: string } | null;
        entitlements: { plan: string } | null;
      }>("/auth/session/resolve", { method: "POST" }),
  },

  connections: {
    list: () => request<ApiConnection[]>("/connections"),
    start: (platform: ConnectablePlatform) =>
      request<{ url: string }>(`/connections/${platform}/start`, { method: "POST" }),
    disconnect: (id: string) =>
      request<{ disconnected: boolean; account: ApiConnectionAccount | null }>(
        `/connections/${id}/disconnect`,
        { method: "POST" }
      )
  },

  health: {
    check: () => request<{ status: string }>("/health"),
  }
};
