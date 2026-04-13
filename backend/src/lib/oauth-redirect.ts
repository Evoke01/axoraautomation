export function buildOAuthRedirect(
  frontendUrl: string,
  platform: string,
  status: "success" | "error",
  message?: string
) {
  const url = new URL(frontendUrl);
  url.searchParams.set("view", "settings");
  url.searchParams.set("oauthPlatform", platform);
  url.searchParams.set("oauthStatus", status);

  if (message) {
    url.searchParams.set("oauthMessage", message);
  }

  return url.toString();
}
