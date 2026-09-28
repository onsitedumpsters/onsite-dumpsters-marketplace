import { db } from "@/lib/db";

export interface FaqItem {
  q: string;
  a: string;
}

export interface ContentOverride {
  title: string;
  metaDescription: string;
  h1: string;
  intro: string;
  faq: FaqItem[];
}

/**
 * Fetch an admin-authored content override for a public page.
 * Keys: "home", "category:<slug>", "city:<slug>".
 * Returns null when no override exists (or the DB is unreachable) so pages
 * fall back to their static defaults in src/lib/cities.ts.
 */
export async function getContentOverride(key: string): Promise<ContentOverride | null> {
  try {
    const page = await db.contentPage.findUnique({ where: { key } });
    if (!page) return null;
    let faq: FaqItem[] = [];
    const raw = page.faqJson as unknown;
    if (Array.isArray(raw)) {
      faq = raw
        .filter(
          (f): f is FaqItem =>
            typeof f === "object" &&
            f !== null &&
            typeof (f as FaqItem).q === "string" &&
            typeof (f as FaqItem).a === "string"
        )
        .slice(0, 20);
    }
    return {
      title: page.title,
      metaDescription: page.metaDescription,
      h1: page.h1,
      intro: page.intro,
      faq,
    };
  } catch {
    return null;
  }
}

/**
 * Serialize an object for embedding inside <script type="application/ld+json">.
 * JSON.stringify alone does not escape `</script>`, which would let stored
 * content break out of the script block. Escaping `<` as \u003c neutralizes
 * that while remaining valid JSON-LD.
 */
export function safeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
