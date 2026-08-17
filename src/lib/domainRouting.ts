/**
 * Domain Routing Utilities for Subdomain Management (e.g. admin.abcossa.org)
 */

export function isAdminSubdomain(): boolean {
  if (typeof window === "undefined") return false;
  const hostname = window.location.hostname.toLowerCase();
  return hostname.startsWith("admin.") || hostname.startsWith("portal.");
}

export function getAdminSubdomainUrl(): string {
  if (typeof window === "undefined") return "/admin";
  const { protocol, host } = window.location;
  if (host.startsWith("admin.") || host.startsWith("portal.")) {
    return window.location.href;
  }
  
  // Replace main domain with admin subdomain
  const baseDomain = host.replace(/^www\./, "");
  return `${protocol}//admin.${baseDomain}`;
}
