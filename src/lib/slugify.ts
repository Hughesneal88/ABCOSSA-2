export function slugifyTitle(title: string) {
  return title
    .toLowerCase()
    .trim()
    .replace(/['']/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function uniqueSlug(base: string) {
  const suffix = Math.random().toString(36).slice(2, 6);
  return base ? `${base}-${suffix}` : `post-${suffix}`;
}
