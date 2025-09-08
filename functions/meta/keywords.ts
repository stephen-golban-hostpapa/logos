type Doc = { keywords?: string[] };
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
	new Response(null, { status: 204, headers: CORS }); // <-- OK preflight

export const onRequestGet: PagesFunction = async (ctx) => {
	const data = await load(ctx.request.url);
	const map = new Map<string, number>();
	for (const d of data)
		for (const k of d.keywords ?? []) {
			const t = k.trim().toLowerCase();
			if (t) map.set(t, (map.get(t) ?? 0) + 1);
		}
	const keywords = Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
	return new Response(JSON.stringify({ keywords }), {
		headers: {
			"Content-Type": "application/json",
			...CORS,
			"Cache-Control": "public, max-age=3600",
		},
	});
};
