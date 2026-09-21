import { defineTool } from "eve/tools";
import { z } from "zod";
import { spend } from "../lib/focus";
import { searchNotionPages } from "../lib/notion";

export default defineTool({
	description:
		"Search Notion pages this install can read. Returns titles, URLs and last-edited times as observed. Not a source of identity or job title. Do not paste mailbox text into the query.",
	inputSchema: z.object({
		query: z
			.string()
			.trim()
			.min(1)
			.max(200)
			.describe(
				"A derived search, e.g. a company name already on the record. Never a pasted email.",
			),
	}),
	async execute({ query }) {
		const charge = spend(1);
		if (!charge.ok) return { ok: false as const, reason: charge.reason };

		const result = await searchNotionPages(query);
		if (!("pages" in result)) return result;

		return {
			ok: true as const,
			pages: result.pages,
			note: "Quote only what a page states. Record it as web.cited-claim with that page URL. Leave the field empty when no page names this person.",
		};
	},
});
