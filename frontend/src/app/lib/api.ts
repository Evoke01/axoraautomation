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
    list: () =>
      request<
        Array<{
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
          };
          connectedAccount: { accountLabel: string } | null;
        }>
      >("/posts"),
  },

  assets: {
    get: (id: string) => request<Record<string, unknown>>(`/assets/${id}`),
    create: (data: { workspaceId: string; creatorId: string; title: string; rawNotes?: string }) =>
      request<Record<string, unknown>>("/assets", {
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

  health: {
    check: () => request<{ status: string }>("/health"),
  }
};
