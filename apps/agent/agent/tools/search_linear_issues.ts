import { defineTool } from "eve/tools";
import { z } from "zod";
import { spend } from "../lib/focus";
import { searchLinearIssues } from "../lib/linear";

export default defineTool({
	description:
		"Search existing Linear issues. Returns identifier, title, URL, state and created time as observed. Use this to see whether a follow-up already exists. Do not create issues from this tool, and do not paste mailbox text into the query.",
	inputSchema: z.object({
		query: z
			.string()
			.trim()
			.min(1)
			.max(200)
			.describe(
				"A derived search, e.g. a company name already on the record. Never a pasted email or meeting transcript.",
			),
	}),
	async execute({ query }) {
		const charge = spend(1);
		if (!charge.ok) return { ok: false as const, reason: charge.reason };

		const result = await searchLinearIssues(query);
		if (!("issues" in result)) return result;

		return {
			ok: true as const,
			issues: result.issues,
			note: "Read-only. Creating a Linear issue is a Cursor-side action, not this agent's. Do not send customer mail into Linear.",
		};
	},
});
