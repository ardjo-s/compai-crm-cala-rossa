import { defineTool } from "eve/tools";
import { z } from "zod";
import { spend } from "../lib/focus";
import { lookupXPosts } from "../lib/x-posts";

export default defineTool({
	description:
		"Look up recent public posts on an X profile you already hold. Returns dated post text and permalinks as observed. Not a source of identity — set_contact_socials verifies the profile first.",
	inputSchema: z.object({
		handleOrUrl: z
			.string()
			.trim()
			.min(1)
			.max(200)
			.describe(
				"An x.com profile URL already on the record, or the handle from that URL.",
			),
	}),
	async execute({ handleOrUrl }) {
		const charge = spend(1);
		if (!charge.ok) return { ok: false as const, reason: charge.reason };

		const result = await lookupXPosts(handleOrUrl);
		if (!("profile" in result)) return result;

		return {
			ok: true as const,
			profile: result.profile,
			note: "Quote a post only with its permalink and created time. Record public claims as web.cited-claim. Do not infer a job title from a post.",
		};
	},
});
