import type { MetadataRoute } from "next";
import { CATEGORIES, FLORIDA_CITIES } from "@/lib/cities";
import { db } from "@/lib/db";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://onsitedumpsterservice.com";

const STATIC_ROUTES: Array<{ path: string; priority: number; changeFrequency: "daily" | "weekly" }> = [
  { path: "/", priority: 1, changeFrequency: "daily" },
  { path: "/search", priority: 0.9, changeFrequency: "daily" },
  { path: "/quiz", priority: 0.8, changeFrequency: "weekly" },
  { path: "/terms", priority: 0.3, changeFrequency: "weekly" },
  { path: "/privacy", priority: 0.3, changeFrequency: "weekly" },
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const entries: MetadataRoute.Sitemap = [
    ...STATIC_ROUTES.map((r) => ({
      url: `${APP_URL}${r.path}`,
      lastModified: now,
      changeFrequency: r.changeFrequency,
      priority: r.priority,
    })),
    ...CATEGORIES.map((c) => ({
      url: `${APP_URL}/categories/${c.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    ...FLORIDA_CITIES.map((c) => ({
      url: `${APP_URL}/cities/${c.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];

  // Active listings — best effort; the build-time database may be unreachable.
  try {
    const listings = await db.listing.findMany({
      where: { status: "active" },
      select: { slug: true, updatedAt: true },
      take: 5000,
    });
    for (const l of listings) {
      entries.push({
        url: `${APP_URL}/listings/${l.slug}`,
        lastModified: l.updatedAt,
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
  } catch {
    // Leave dynamic entries out rather than failing the build.
  }

  return entries;
}
