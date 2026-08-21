import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const sourceCache = new Map();
const MAX_URLS = 2;
const MAX_BYTES = 750_000;
const MAX_EVIDENCE_CHARACTERS = 8_000;
const MAX_VISIBLE_TEXT_CHARACTERS = 3_000;
const CACHE_TTL_MS = 30 * 60 * 1000;

export function extractResearchUrls(value) {
  const matches = String(value || "").match(/https?:\/\/[^\s<>"')\]]+/gi) || [];
  return [...new Set(matches.map((match) => match.replace(/[.,!?;:]+$/, "")))].slice(0, MAX_URLS);
}

function isPrivateAddress(address) {
  const normalized = String(address || "").toLowerCase();
  if (!normalized) return true;
  if (normalized === "::1" || normalized === "0.0.0.0" || normalized === "::") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")) return true;
  const ipv4 = normalized.startsWith("::ffff:") ? normalized.slice(7) : normalized;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ipv4)) return false;
  const parts = ipv4.split(".").map(Number);
  return parts[0] === 10
    || parts[0] === 127
    || parts[0] === 0
    || (parts[0] === 169 && parts[1] === 254)
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
    || parts[0] >= 224;
}

async function assertPublicUrl(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error("Only HTTP sources can be researched.");
  if (!url.hostname || url.username || url.password || url.hostname.toLowerCase() === "localhost" || url.hostname.toLowerCase().endsWith(".local")) {
    throw new Error("The supplied source is not a public web address.");
  }
  if (isIP(url.hostname)) {
    if (isPrivateAddress(url.hostname)) throw new Error("The supplied source is not a public web address.");
    return url;
  }
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("The supplied source did not resolve to a public address.");
  }
  return url;
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function htmlText(value) {
  return decodeHtml(String(value || "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<(?:svg|noscript|template)\b[^>]*>[\s\S]*?<\/(?:svg|noscript|template)>/gi, " ")
    .replace(/<br\s*\/?\s*>|<\/(?:p|div|section|article|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

function metaValue(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`<meta[^>]+(?:name|property)=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:name|property)=["']${escaped}["'][^>]*>`, "i"),
  ];
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) return decodeHtml(match[1]).trim();
  }
  return "";
}

function collectJsonLd(value, output = []) {
  if (!value || output.length >= 20) return output;
  if (Array.isArray(value)) {
    for (const entry of value) collectJsonLd(entry, output);
    return output;
  }
  if (typeof value !== "object") return output;
  const object = value;
  if (Array.isArray(object["@graph"])) collectJsonLd(object["@graph"], output);
  const type = Array.isArray(object["@type"]) ? object["@type"].join(", ") : object["@type"];
  const fields = ["name", "description", "brand", "sku", "category"]
    .flatMap((key) => typeof object[key] === "string" && object[key].trim() ? [`${key}: ${htmlText(object[key])}`] : []);
  if (type || fields.length) output.push([type ? `type: ${type}` : "", ...fields].filter(Boolean).join("\n"));
  return output;
}

function extractPageEvidence(html, url) {
  const title = htmlText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const description = metaValue(html, "description") || metaValue(html, "og:description");
  const jsonLd = [];
  for (const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { collectJsonLd(JSON.parse(decodeHtml(match[1])), jsonLd); } catch { /* Ignore malformed publisher metadata. */ }
  }
  const body = htmlText(html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html);
  const structuredFacts = jsonLd.join("\n\n");
  // Product JSON-LD is usually cleaner and more complete than storefront chrome.
  // Keep a small visible-text fallback for pages without useful structured facts.
  const visibleFallback = structuredFacts.length >= 1_000
    ? ""
    : body.slice(0, MAX_VISIBLE_TEXT_CHARACTERS);
  const evidence = [
    `Source URL: ${url}`,
    title ? `Page title: ${title}` : "",
    description ? `Page description: ${description}` : "",
    structuredFacts ? `Structured page facts:\n${structuredFacts}` : "",
    visibleFallback ? `Visible page text:\n${visibleFallback}` : "",
  ].filter(Boolean).join("\n\n");
  return evidence.slice(0, MAX_EVIDENCE_CHARACTERS);
}

async function readLimitedBody(response) {
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      await reader.cancel();
      throw new Error("The source page was too large to inspect safely.");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

async function fetchSource(urlValue, redirectsRemaining = 3) {
  const url = await assertPublicUrl(urlValue);
  const response = await fetch(url, {
    redirect: "manual",
    signal: AbortSignal.timeout(15_000),
    headers: {
      accept: "text/html,application/xhtml+xml,application/json,text/plain;q=0.8",
      "user-agent": "IdealDayResearch/1.0 (+personal activity assistant)",
    },
  });
  if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
    if (redirectsRemaining <= 0) throw new Error("The source redirected too many times.");
    return fetchSource(new URL(response.headers.get("location"), url).toString(), redirectsRemaining - 1);
  }
  if (!response.ok) throw new Error(`The source returned HTTP ${response.status}.`);
  const contentType = response.headers.get("content-type") || "";
  if (!/text\/html|application\/xhtml\+xml|application\/json|text\/plain/i.test(contentType)) {
    throw new Error("The supplied source was not a readable page.");
  }
  const body = await readLimitedBody(response);
  return /html|xhtml/i.test(contentType)
    ? extractPageEvidence(body, url.toString())
    : `Source URL: ${url}\n\nSource content:\n${body.slice(0, MAX_EVIDENCE_CHARACTERS)}`;
}

async function cachedSource(url) {
  const cached = sourceCache.get(url);
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return cached.value;
  const value = await fetchSource(url);
  sourceCache.set(url, { createdAt: Date.now(), value });
  return value;
}

export async function researchEvidenceForMessage(message) {
  const urls = extractResearchUrls(message);
  if (!urls.length) return null;
  const results = await Promise.all(urls.map(async (url) => {
    try {
      return await cachedSource(url);
    } catch (error) {
      return `Source URL: ${url}\nSource fetch failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }));
  return results.join("\n\n---\n\n");
}
