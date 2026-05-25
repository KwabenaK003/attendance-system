export function getSafeRedirectPath(search = "") {
  const redirect = new URLSearchParams(search).get("redirect")?.trim();

  if (!redirect || !redirect.startsWith("/") || redirect.startsWith("//")) {
    return "/dashboard";
  }

  if (redirect.startsWith("/login") || redirect.startsWith("/register")) {
    return "/dashboard";
  }

  return redirect;
}

export function withRedirect(path, redirectPath = "") {
  if (!redirectPath || redirectPath === "/dashboard") {
    return path;
  }

  return `${path}?redirect=${encodeURIComponent(redirectPath)}`;
}
