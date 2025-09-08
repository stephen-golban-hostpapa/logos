// /functions/logo/[id].ts
// GET /logo/:id - Get a specific logo by ID using Cloudflare Pages dynamic routing

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
	"Access-Control-Allow-Methods": "GET, OPTIONS",
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
	
	// Extract ID from Cloudflare Pages params
	const id = ctx.params?.id || "";
	
	// Debug logging
	console.log('Params:', ctx.params);
	console.log('Extracted ID:', id);
	console.log('Docs loaded:', docs ? docs.length : 'null');
	
	if (!id) {
		return new Response(
			JSON.stringify({ 
				error: "Logo ID is required",
				debug: {
					params: ctx.params,
					extractedId: id
				}
			}), 
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
			JSON.stringify({ 
				error: "Logo not found",
				debug: {
					searchedId: id,
					totalLogos: docs?.length || 0,
					sampleIds: docs?.slice(0, 5).map(d => d.id) || []
				}
			}), 
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
