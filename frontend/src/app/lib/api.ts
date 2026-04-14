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
  }>;
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
          snapshots: Array<{ views: number | null; likes: number | null; comments: number | null }>;
        } | null;
      }>;
    }>;
  }>;
}

export interface ApiSession {
  user: { id: string; name: string | null; email: string | null };
  workspace: { id: string; name: string };
  creator: { id: string; name: string } | null;
  entitlements: { plan: string; autoPublishEnabled: boolean } | null;
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
    complete: (body: { uploadSessionId: string; parts: { ETag: string; PartNumber: number }[] }) =>
      request<{ completed: boolean }>(
        "/uploads/multipart/complete", { method: "POST", body: JSON.stringify(body) }
      ),
  },

  dashboard: {
    getSummary: () =>
      request<{ assets: number; publishedPosts: number; pendingReview: number; latestOpportunityReportAt: string | null }>(
        "/dashboard/summary"
      ),
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
  }
};
