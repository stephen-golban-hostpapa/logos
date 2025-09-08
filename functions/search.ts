import Fuse from "fuse.js";

let fuse: Fuse<any> | null = null;
let docs: any[] | null = null;

async function loadIndex(baseUrl: string) {
	if (!docs) {
		const url = new URL("/index.json", baseUrl).toString();
		const res = await fetch(url, { cf: { cacheTtl: 3600 } });
		docs = await res.json();
		fuse = new Fuse(docs, {
			threshold: 0.35,
			keys: [
				{ name: "keywords", weight: 0.6 },
				{ name: "category", weight: 0.2 },
				{ name: "categories", weight: 0.2 },
			],
		});
	}
}

export const onRequestGet: PagesFunction = async (ctx) => {
	await loadIndex(ctx.request.url);
	const { searchParams } = new URL(ctx.request.url);
	const q = searchParams.get("q") ?? "";
	const limit = Number(searchParams.get("limit") ?? 24);
	const results = q ? fuse!.search(q, { limit }).map((r) => r.item) : [];
	return new Response(JSON.stringify({ results }), {
		headers: { "Content-Type": "application/json" },
	});
};
