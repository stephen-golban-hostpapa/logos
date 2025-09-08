// /functions/search.ts
// Works with docs like:
// { id: "966294985", category: "Finance & Insurance", categories: ["Finance & Insurance"], keywords: [...], labels: [...], svg: "966294985.svg" }

import Fuse from "fuse.js";

type Doc = {
	id: string;
	category?: string;
	categories?: string[];
	keywords?: string[];
	labels?: string[];
	svg?: string; // relative filename like "966294985.svg"
};

let docs: Doc[] | null = null;

async function loadIndex(baseUrl: string) {
	if (!docs) {
		const url = new URL("/logos/index.json", baseUrl).toString();
		const res = await fetch(url, { cf: { cacheTtl: 3600 } });
		docs = (await res.json()) as Doc[];
	}
}

function absoluteSvg(baseUrl: string, svg?: string) {
	if (!svg) return null;
	// ensure absolute URL for the client:
	return new URL(`/logos/${svg}`, baseUrl).toString();
}

function buildFuse(collection: Doc[]) {
	return new Fuse(collection, {
		threshold: 0.35, // stricter than default for better precision
		ignoreLocation: true,
		keys: [
			{ name: "keywords", weight: 0.6 },
			{ name: "category", weight: 0.25 },
			{ name: "categories", weight: 0.15 },
		],
	});
}

// Support both POST (structured body) and GET (?q=, &category=)
export const onRequest: PagesFunction = async (ctx) => {
	await loadIndex(ctx.request.url);

	const url = new URL(ctx.request.url);
	const isPost = ctx.request.method === "POST";
	let category = "";
	let company = "";
	let slogan = "";
	let description = "";
	let q = "";
	let limit = 24;

	if (isPost) {
		const body = await ctx.request.json().catch(() => ({}));
		category = (body.category || "").trim();
		company = (body.company || "").trim();
		slogan = (body.slogan || "").trim();
		description = (body.description || "").trim();
		limit = Number(body.limit || 24);
	} else {
		// GET fallback
		category = (url.searchParams.get("category") || "").trim();
		q = (url.searchParams.get("q") || "").trim();
		limit = Number(url.searchParams.get("limit") || 24);
	}

	// 1) Start with candidates filtered by category (strict filter if provided)
	let candidates = docs!;
	if (category) {
		const cat = category.toLowerCase();
		candidates = candidates.filter(
			(d) =>
				(d.category && d.category.toLowerCase() === cat) ||
				(Array.isArray(d.categories) &&
					d.categories.some((c) => c.toLowerCase() === cat)),
		);
	}

	// 2) Build the search string (company+slogan+description for POST; or q for GET)
	const text = isPost
		? [company, slogan, description].filter(Boolean).join(" ")
		: q;

	// 3) Fuzzy search (or simple slice when no text provided)
	let results: Doc[];
	if (text) {
		const fuse = buildFuse(candidates);
		results = fuse.search(text, { limit }).map((r) => r.item);
	} else {
		results = candidates.slice(0, limit);
	}

	// 4) Normalize SVG to absolute URLs
	const normalized = results.map((d) => ({
		...d,
		svg: absoluteSvg(url.origin, d.svg!),
	}));

	return new Response(JSON.stringify({ results: normalized }), {
		headers: {
			"Content-Type": "application/json",
			// CORS – since you’re calling this from a Next.js app on another origin
			"Access-Control-Allow-Origin": "*",
			"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
			"Access-Control-Allow-Headers": "Content-Type",
			"Cache-Control": "no-store",
		},
	});
};
