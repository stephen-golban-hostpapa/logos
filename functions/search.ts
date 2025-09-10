// /functions/search.ts
// POST body: { industry?: string, keywords?: string[], description?: string, company?: string, limit?: number, keywordMode?: 'AND' | 'OR' }

type Doc = {
	id: string;
	category?: string;
	categories?: string[];
	keywords?: string[];
	labels?: string[];
	svg?: string; // e.g. "966294985.svg"
};

type SearchResult = Doc & {
	score: number;
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
		const r = await fetch(url, { cf: { cacheTtl: 3600 } } as any);
		docs = (await r.json()) as Doc[];
	}
	return docs || [];
}

export const onRequestOptions = async () =>
	new Response(null, { status: 204, headers: CORS }); // CORS preflight OK

export const onRequestPost = async (ctx: any) => {
	await loadIndex(ctx.request.url);
	const origin = new URL(ctx.request.url).origin;

	const body = await ctx.request.json().catch(() => ({}));
	const industry = typeof body.industry === "string" ? norm(body.industry) : "";
	const kwSet = toSet(body.keywords);
	const descSet =
		typeof body.description === "string"
			? toSet(body.description.split(/\s+/))
			: new Set<string>();
	const keywordMode = body.keywordMode === "AND" ? "AND" : "OR"; // Default to OR
	const limit = Math.max(1, Math.min(200, Number(body.limit ?? 24)));

	const scoredResults: SearchResult[] = [];

	// If no industry or keywords provided, return empty results
	if (!industry && kwSet.size === 0) {
		return new Response(JSON.stringify({ results: [] }), {
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "no-store",
				...CORS,
			},
		});
	}

	for (const d of docs || []) {
		let shouldInclude = false;
		let score = 0;

		// Industry matching (more flexible now)
		let industryMatch = false;
		if (industry) {
			const allCategories = [d.category, ...(d.categories ?? [])].filter(
				(cat): cat is string => Boolean(cat),
			);
			for (const cat of allCategories) {
				const normalizedCat = norm(cat);
				if (
					normalizedCat === industry ||
					normalizedCat.includes(industry) ||
					industry.includes(normalizedCat)
				) {
					industryMatch = true;
					score += normalizedCat === industry ? 100 : 50; // Exact vs partial match
					break;
				}
			}
		} else {
			industryMatch = true; // No industry filter means pass
		}

		// Keywords matching (flexible AND/OR with partial matching)
		let keywordMatch = false;
		if (kwSet.size > 0) {
			const docKeywords = (d.keywords ?? []).join(" ").toLowerCase();
			const docCategories = [d.category, ...(d.categories ?? [])]
				.filter((cat): cat is string => Boolean(cat))
				.join(" ")
				.toLowerCase();
			const allDocText = `${docKeywords} ${docCategories}`;

			let matchedKeywords = 0;
			for (const keyword of kwSet) {
				// Check for exact match first (higher score)
				if (allDocText.includes(keyword)) {
					matchedKeywords++;
					score += 30;
				} else {
					// Check for partial matches (lower score)
					const words = allDocText.split(/\s+/);
					for (const word of words) {
						if (word.includes(keyword) || keyword.includes(word)) {
							matchedKeywords++;
							score += 15; // Lower score for partial matches
							break;
						}
					}
				}
			}

			if (keywordMode === "AND") {
				keywordMatch = matchedKeywords === kwSet.size;
			} else {
				keywordMatch = matchedKeywords > 0;
			}

			// Bonus for multiple matches
			if (matchedKeywords > 1) {
				score += matchedKeywords * 5; // Reduced bonus to balance scoring
			}
		} else {
			keywordMatch = true; // No keywords filter means pass
		}

		// Description matching (searches across all fields)
		let descriptionMatch = false;
		if (descSet.size > 0) {
			const allText = [
				d.category,
				...(d.categories ?? []),
				...(d.keywords ?? []),
				...(d.labels ?? []),
			]
				.filter((item): item is string => Boolean(item))
				.join(" ")
				.toLowerCase();

			let matchedTerms = 0;
			for (const term of descSet) {
				if (allText.includes(term)) {
					matchedTerms++;
					score += 20;
				}
			}

			descriptionMatch = matchedTerms > 0;

			// Bonus for multiple description matches
			if (matchedTerms > 1) {
				score += matchedTerms * 5;
			}
		} else {
			descriptionMatch = true; // No description filter means pass
		}

		// More lenient matching: if industry is specified, it must match
		// But keywords and description are more flexible
		if (industry) {
			shouldInclude = industryMatch && (keywordMatch || descriptionMatch);
		} else {
			// If no industry filter, just need keywords or description to match
			shouldInclude = keywordMatch || descriptionMatch;
		}

		if (shouldInclude) {
			scoredResults.push({ ...d, score });
		}
	}

	// Sort by score (highest first), then by id for consistency
	scoredResults.sort((a, b) => {
		if (b.score !== a.score) return b.score - a.score;
		return a.id.localeCompare(b.id);
	});

	// Take top results and return only id and url
	const topResults = scoredResults.slice(0, limit);
	const results = topResults.map(({ score, ...doc }) => ({
		id: doc.id,
		url: doc.svg ? new URL(`/logos/${doc.svg}`, origin).toString() : null,
	}));

	return new Response(JSON.stringify({ results }), {
		headers: {
			"Content-Type": "application/json",
			"Cache-Control": "no-store",
			...CORS,
		},
	});
};
