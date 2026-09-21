import { z } from "zod";
import { enabled, unavailable } from "./capabilities";
import { parseBody, requestJson } from "./external-http";
import { EXTERNAL_SOURCES } from "./external-sources-config";

const notionTitleText = z
	.object({
		plain_text: z.string().catch(""),
	})
	.catch({ plain_text: "" });

const notionPage = z.object({
	id: z.string(),
	url: z.string().url().optional().catch(undefined),
	object: z.string().optional().catch(undefined),
	last_edited_time: z.string().optional().catch(undefined),
	properties: z.record(z.string(), z.unknown()).optional().catch(undefined),
});

const notionSearchResponse = z.object({
	results: z.array(z.unknown()).catch([]),
});

export type ObservedNotionPage = {
	id: string;
	url: string | null;
	title: string | null;
	lastEditedAt: string | null;
};

const notionTitleProperty = z.object({
	type: z.string().optional(),
	title: z.array(notionTitleText).optional(),
});

function titleFromProperties(
	properties: z.infer<typeof notionPage>["properties"],
): string | null {
	if (!properties) return null;

	for (const value of Object.values(properties)) {
		const property = notionTitleProperty.safeParse(value);
		if (!property.success) continue;
		if (property.data.type !== "title" && !property.data.title) continue;
		const title = (property.data.title ?? [])
			.map((part) => part.plain_text)
			.join("")
			.trim();
		if (title) return title;
	}

	return null;
}

export function parseNotionSearch(value: unknown): ObservedNotionPage[] {
	const body = parseBody(notionSearchResponse, value, "Notion search");
	if (!body.ok) return [];

	const pages: ObservedNotionPage[] = [];
	for (const result of body.data.results) {
		const page = notionPage.safeParse(result);
		if (!page.success) continue;
		if (page.data.object && page.data.object !== "page") continue;

		pages.push({
			id: page.data.id,
			url: page.data.url ?? null,
			title: titleFromProperties(page.data.properties),
			lastEditedAt: page.data.last_edited_time ?? null,
		});
	}

	return pages;
}

export async function searchNotionPages(
	query: string,
): Promise<
	| ReturnType<typeof unavailable>
	| { ok: true; pages: ObservedNotionPage[] }
	| { ok: false; configured: true; reason: string }
> {
	if (!(await enabled("NOTION_API_KEY"))) return unavailable("NOTION_API_KEY");

	const token = process.env.NOTION_API_KEY?.trim();
	if (!token) return unavailable("NOTION_API_KEY");

	const result = await requestJson(EXTERNAL_SOURCES.notion.endpoint, {
		method: "POST",
		headers: {
			authorization: `Bearer ${token}`,
			"content-type": "application/json",
			"notion-version": EXTERNAL_SOURCES.notion.version,
		},
		body: JSON.stringify({
			query,
			page_size: EXTERNAL_SOURCES.notion.pageLimit,
			filter: { property: "object", value: "page" },
		}),
	});

	if (!result.ok) {
		return { ok: false, configured: true, reason: result.reason };
	}

	return { ok: true, pages: parseNotionSearch(result.value) };
}
