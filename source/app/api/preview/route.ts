import { APP } from "../../../core/config.ts";
import type { ProductPreview } from "../../../core/items.ts";
import { productId } from "../../../core/prices.ts";

function validProductUrl(raw: string) {
  if (!productId(raw)) {
    throw new Error("Paste a valid bjs.com product link.");
  }
  const url = new URL(raw);
  url.search = "";
  url.hash = "";
  return url;
}

function fallbackPreview(url: URL): ProductPreview {
  const parts = url.pathname.split("/").filter(Boolean);
  const productIndex = parts.indexOf("product");
  const slug = productIndex >= 0 ? parts[productIndex + 1] : null;
  const name = slug
    ? decodeURIComponent(slug)
        .split("-")
        .filter(Boolean)
        .map((word) => {
          const lower = word.toLowerCase();
          if (lower === "ct") return "ct.";
          if (lower === "pk") return "pk.";
          if (lower === "oz") return "oz.";
          if (lower === "bjs") return "BJ’s";
          return lower.charAt(0).toUpperCase() + lower.slice(1);
        })
        .join(" ")
    : null;

  return { name, imageUrl: null, itemNumber: null, price: null };
}

function meta(html: string, key: string) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const value = html.match(pattern)?.[1];
    if (value) return value.replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  }
  return null;
}

function findProductJson(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (const child of value) {
      const found = findProductJson(child);
      if (found) return found;
    }
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record["@type"] === "Product" || (Array.isArray(record["@type"]) && record["@type"].includes("Product"))) {
    return record;
  }
  for (const child of Object.values(record)) {
    const found = findProductJson(child);
    if (found) return found;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { url?: string; clubId?: string };
    if (!payload.url) return Response.json({ error: "Paste a BJ’s product link." }, { status: 400 });
    const url = validProductUrl(payload.url);
    const fallback = fallbackPreview(url);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; ClubPriceWatch/1.0)" },
        redirect: "follow",
        signal: AbortSignal.timeout(APP.requestTimeoutMs),
      });
    } catch {
      return Response.json({ preview: fallbackPreview(url), source: "url" });
    }
    if (!response.ok) {
      return Response.json({ preview: fallbackPreview(url), source: "url" });
    }
    const html = await response.text();

    let product: Record<string, unknown> | null = null;
    for (const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
      try {
        product = findProductJson(JSON.parse(match[1]));
        if (product) break;
      } catch {
        // Some BJ's scripts contain non-JSON text; metadata below remains a fallback.
      }
    }

    const idFromUrl = url.pathname.match(/\/(\d{10,})\/?$/)?.[1] ?? null;
    const preview: ProductPreview = {
      name: (typeof product?.name === "string" ? product.name : null) ?? meta(html, "og:title"),
      imageUrl:
        (typeof product?.image === "string"
          ? product.image
          : Array.isArray(product?.image) && typeof product.image[0] === "string"
            ? product.image[0]
            : null) ?? meta(html, "og:image"),
      itemNumber:
        (typeof product?.sku === "string" ? product.sku : null) ??
        html.match(/Item:\s*([0-9]+)/i)?.[1] ??
        idFromUrl,
      // Generic page offers may belong to a different club. Only the club parser
      // is the only price parser; anonymous metadata is never a club-price check.
      price: null,
    };
    return Response.json({ preview, source: "page" });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not read that product page." },
      { status: 400 },
    );
  }
}
