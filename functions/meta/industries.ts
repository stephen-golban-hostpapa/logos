type Doc = { category?: string; categories?: string[] };
let docs: Doc[] | null = null;

const CORS = {
	"Access-Control-Allow-Origin": "*",
	"Access-Control-Allow-Methods": "GET, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

async function load(base: string) {
	if (!docs) {
		const url = new URL("/logos/index.json", base).toString();
		const r = await fetch(url, { cf: { cacheTtl: 3600 } });
		docs = await r.json();
	}
	return docs!;
}

export const onRequestOptions: PagesFunction = async () =>
	new Response(null, { status: 204, headers: CORS });

export const onRequestGet: PagesFunction = async (ctx) => {
	const data = await load(ctx.request.url);
	const m = new Map<string, number>();
	for (const d of data) {
		const bag = new Set<string>();
		if (d.category) bag.add(d.category);
		(d.categories ?? []).forEach((c) => bag.add(c));
		for (const name of bag) m.set(name, (m.get(name) ?? 0) + 1);
	}
	const industries = Array.from(m.keys()).sort((a, b) => a.localeCompare(b));
	return new Response(JSON.stringify({ industries }), {
		headers: {
			"Content-Type": "application/json",
			...CORS,
			"Cache-Control": "public, max-age=3600",
		},
	});
};
