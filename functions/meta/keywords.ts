// Returns all unique keywords (optionally with counts)
// GET /keywords            -> { keywords: ["analysis","clean",... ] }
// GET /keywords?counts=1   -> { keywords: [{ term:"analysis", count:12 }, ...] }

type Doc = {
	id: string;
	category?: string;
	categories?: string[];
	keywords?: string[];
	labels?: string[];
	svg?: string;
};

let docs: Doc[] | null = null;

async function loadIndex(baseUrl: string) {
	if (!docs) {
		const url = new URL("/logos/index.json", baseUrl).toString();
		// Cache index.json at the edge for 1h
		const res = await fetch(url, { cf: { cacheTtl: 3600 } }); // Workers cache override
		docs = (await res.json()) as Doc[]; // :contentReference[oaicite:1]{index=1}
	}
	return docs!;
}

function cors() {
	return {
		"Access-Control-Allow-Origin": "*",
		"Access-Control-Allow-Methods": "GET, OPTIONS",
		"Access-Control-Allow-Headers": "Content-Type",
	};
}

export const onRequestOptions: PagesFunction = async () =>
	new Response(null, { headers: cors() });

export const onRequestGet: PagesFunction = async (ctx) => {
	const url = new URL(ctx.request.url);
	const withCounts = url.searchParams.get("counts") === "1";

	const data = await loadIndex(ctx.request.url);
	const freq = new Map<string, number>();

	for (const d of data) {
		for (const k of d.keywords ?? []) {
			const key = k.trim().toLowerCase();
			if (!key) continue;
			freq.set(key, (freq.get(key) ?? 0) + 1);
		}
	}

	const payload = withCounts
		? Array.from(freq.entries())
				.sort((a, b) => b[1] - a[1])
				.map(([term, count]) => ({ term, count }))
		: Array.from(freq.keys()).sort((a, b) => a.localeCompare(b));

	return new Response(JSON.stringify({ keywords: payload }), {
		headers: {
			"Content-Type": "application/json",
			...cors(),
			"Cache-Control": "public, max-age=3600",
		},
	});
};
