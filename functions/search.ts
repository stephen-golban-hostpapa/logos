// /functions/search.ts
// POST body: { industry?: string, keywords?: string[], company?: string, limit?: number }

type Doc = {
	id: string;
	category?: string;
	categories?: string[];
	keywords?: string[];
	labels?: string[];
	svg?: string; // e.g. "966294985.svg"
};

let docs: Doc[] | null = null;

const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

const norm = (s: string) => s.trim().toLowerCase();
const toSet = (arr?: string[]) =>
	new Set((arr ?? []).map(norm).filter(Boolean));

async function loadIndex(baseUrl: string) {
	if (!docs) {
		const url = new URL("/logos/index.json", baseUrl).toString();
		// keep index hot at the edge (applies to GET/HEAD)
		const r = await fetch(url, { cf: { cacheTtl: 3600 } });
		docs = (await r.json()) as Doc[];
	}
	return docs!;
}

export const onRequestOptions: PagesFunction = async () =>
	new Response(null, { status: 204, headers: CORS }); // CORS preflight OK

export const onRequestPost: PagesFunction = async (ctx) => {
	await loadIndex(ctx.request.url);
	const origin = new URL(ctx.request.url).origin;

	const body = await ctx.request.json().catch(() => ({}));
	const industry = typeof body.industry === "string" ? norm(body.industry) : "";
	const kwSet = toSet(body.keywords); // AND, exact (case-insensitive)
	const limit = Math.max(1, Math.min(200, Number(body.limit ?? 24)));

	const out: Doc[] = [];
	for (const d of docs!) {
		// INDUSTRY = ANY (single string provided -> must match category or categories[])
		if (industry) {
			const bag = new Set<string>();
			if (d.category) bag.add(norm(d.category));
			for (const c of d.categories ?? []) bag.add(norm(c));
			if (!bag.has(industry)) continue;
		}

		// KEYWORDS = AND (every provided keyword must be present exactly)
		if (kwSet.size) {
			const dkw = new Set((d.keywords ?? []).map(norm));
			let all = true;
			for (const k of kwSet)
				if (!dkw.has(k)) {
					all = false;
					break;
				}
			if (!all) continue;
		}

		out.push(d);
		if (out.length >= limit) break;
	}

	// upgrade svg -> absolute URL for direct <img src=...>
	const results = out.map((d) => ({
		...d,
		svg: d.svg ? new URL(`/logos/${d.svg}`, origin).toString() : null,
	}));

	return new Response(JSON.stringify({ results }), {
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "no-store",
			...CORS,
		},
	});
};
