// Returns all unique industries (from category + categories[])
// GET /industries            -> { industries: ["Finance & Insurance", ...] }
// GET /industries?counts=1   -> { industries: [{ name:"Finance & Insurance", count:42 }, ...] }

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
		const res = await fetch(url, { cf: { cacheTtl: 3600 } }); // cached at edge
		docs = (await res.json()) as Doc[];
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
	const map = new Map<string, { name: string; count: number }>();

	for (const d of data) {
		const bag = new Set<string>();
		if (d.category) bag.add(d.category);
		(d.categories ?? []).forEach((c) => bag.add(c));
		for (const name of bag) {
			const key = name.toLowerCase();
			const cur = map.get(key);
			if (cur) cur.count++;
			else map.set(key, { name, count: 1 });
		}
	}

	const items = Array.from(map.values());
	const payload = withCounts
		? items.sort((a, b) => b.count - a.count)
		: items.map((i) => i.name).sort((a, b) => a.localeCompare(b));

	return new Response(JSON.stringify({ industries: payload }), {
		headers: {
			"Content-Type": "application/json",
			...cors(),
			"Cache-Control": "public, max-age=3600",
		},
	});
};
