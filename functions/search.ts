// /functions/search.ts
// POST body: { industries?: string[], keywords?: string[], company?: string, limit?: number }
// Exact, case-insensitive matches. Industry: ANY; Keywords: AND.

type Doc = {
	id: string;
	category?: string;
	categories?: string[];
	keywords?: string[];
	labels?: string[];
	svg?: string; // e.g. "966294985.svg"
};

let docs: Doc[] | null = null;

const cors = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

async function loadIndex(baseUrl: string) {
	if (!docs) {
		const url = new URL("/logos/index.json", baseUrl).toString();
		// Keep index hot at the edge (doesn't cache the response we return)
		const res = await fetch(url, { cf: { cacheTtl: 3600 } });
		docs = (await res.json()) as Doc[];
	}
	return docs!;
}

const norm = (s: string) => s.trim().toLowerCase();
const toSet = (arr?: string[]) =>
	new Set((arr ?? []).map(norm).filter(Boolean));

export const onRequestOptions: PagesFunction = async () =>
	new Response(null, { headers: cors });

export const onRequestPost: PagesFunction = async (ctx) => {
	await loadIndex(ctx.request.url);
	const origin = new URL(ctx.request.url).origin;

	const body = await ctx.request.json().catch(() => ({}));
	const industriesSet = toSet(body.industries);
	const keywordsSet = toSet(body.keywords);
	const limit = Math.max(1, Math.min(200, Number(body.limit ?? 24))); // cap it

	// Filter: industries = ANY (or no filter if none provided)
	//         keywords  = AND (every provided keyword must be present exactly)
	const results: Doc[] = [];
	for (const d of docs!) {
		// industries check (ANY)
		if (industriesSet.size) {
			const docIndustries = new Set<string>();
			if (d.category) docIndustries.add(norm(d.category));
			for (const c of d.categories ?? []) docIndustries.add(norm(c));
			let hit = false;
			for (const i of industriesSet) {
				if (docIndustries.has(i)) {
					hit = true;
					break;
				}
			}
			if (!hit) continue;
		}

		// keywords check (AND)
		if (keywordsSet.size) {
			const docKeywords = new Set((d.keywords ?? []).map(norm));
			let all = true;
			for (const k of keywordsSet) {
				if (!docKeywords.has(k)) {
					all = false;
					break;
				}
			}
			if (!all) continue;
		}

		results.push(d);
		if (results.length >= limit) break;
	}

	// Absolute SVG URLs
	const payload = results.map((d) => ({
		...d,
		svg: d.svg ? new URL(`/logos/${d.svg}`, origin).toString() : null,
	}));

	return new Response(JSON.stringify({ results: payload }), {
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "no-store",
			...cors,
		},
	});
};
