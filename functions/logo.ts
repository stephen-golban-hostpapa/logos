// /functions/logo.ts
// GET /logo/:id - Get a specific logo by ID
// POST body: { id: string } - Alternative way to get logo by ID

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
	"Access-Control-Allow-Methods": "GET, POST, OPTIONS",
	"Access-Control-Allow-Headers": "Content-Type",
};

async function loadIndex(baseUrl: string) {
	if (!docs) {
		const url = new URL("/logos/index.json", baseUrl).toString();
		// keep index hot at the edge (applies to GET/HEAD)
		const r = await fetch(url, { cf: { cacheTtl: 3600 } } as any);
		docs = (await r.json()) as Doc[];
	}
	return docs || [];
}

function findLogoById(id: string, origin: string): Doc | null {
	const logo = docs?.find(doc => doc.id === id);
	if (!logo) return null;

	return {
		...logo,
		svg: logo.svg ? new URL(`/logos/${logo.svg}`, origin).toString() : null,
	};
}

export const onRequestOptions = async () =>
	new Response(null, { status: 204, headers: CORS }); // CORS preflight OK

// GET /logo/:id
export const onRequestGet = async (ctx: any) => {
	await loadIndex(ctx.request.url);
	const origin = new URL(ctx.request.url).origin;
	
	// Extract ID from URL path
	const url = new URL(ctx.request.url);
	const pathParts = url.pathname.split('/');
	const id = pathParts[pathParts.length - 1]; // Get the last part of the path
	
	if (!id) {
		return new Response(
			JSON.stringify({ error: "Logo ID is required" }), 
			{
				status: 400,
				headers: {
					"Content-Type": "application/json",
					...CORS,
				},
			}
		);
	}

	const logo = findLogoById(id, origin);
	
	if (!logo) {
		return new Response(
			JSON.stringify({ error: "Logo not found" }), 
			{
				status: 404,
				headers: {
					"Content-Type": "application/json",
					...CORS,
				},
			}
		);
	}

	return new Response(JSON.stringify({ logo }), {
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "public, max-age=3600", // Cache for 1 hour
			...CORS,
		},
	});
};

// POST /logo (alternative way to get by ID)
export const onRequestPost = async (ctx: any) => {
	await loadIndex(ctx.request.url);
	const origin = new URL(ctx.request.url).origin;

	const body = await ctx.request.json().catch(() => ({}));
	const id = typeof body.id === "string" ? body.id.trim() : "";
	
	if (!id) {
		return new Response(
			JSON.stringify({ error: "Logo ID is required" }), 
			{
				status: 400,
				headers: {
					"Content-Type": "application/json",
					...CORS,
				},
			}
		);
	}

	const logo = findLogoById(id, origin);
	
	if (!logo) {
		return new Response(
			JSON.stringify({ error: "Logo not found" }), 
			{
				status: 404,
				headers: {
					"Content-Type": "application/json",
					...CORS,
				},
			}
		);
	}

	return new Response(JSON.stringify({ logo }), {
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "public, max-age=3600", // Cache for 1 hour
			...CORS,
		},
	});
};
