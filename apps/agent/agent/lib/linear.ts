import { z } from "zod";
import { enabled, unavailable } from "./capabilities";
import { parseBody, requestJson } from "./external-http";
import { EXTERNAL_SOURCES } from "./external-sources-config";

const linearIssue = z.object({
	id: z.string(),
	identifier: z.string(),
	title: z.string(),
	url: z.string().url(),
	createdAt: z.string().optional().catch(undefined),
	state: z
		.object({
			name: z.string().optional().catch(undefined),
			type: z.string().optional().catch(undefined),
		})
		.nullable()
		.optional()
		.catch(undefined),
});

const linearSearchResponse = z.object({
	data: z
		.object({
			searchIssues: z
				.object({
					nodes: z.array(z.unknown()).catch([]),
				})
				.optional()
				.catch(undefined),
			issueSearch: z
				.object({
					nodes: z.array(z.unknown()).catch([]),
				})
				.optional()
				.catch(undefined),
		})
		.optional()
		.catch(undefined),
	errors: z
		.array(z.object({ message: z.string() }))
		.optional()
		.catch(undefined),
});

export type ObservedLinearIssue = {
	id: string;
	identifier: string;
	title: string;
	url: string;
	createdAt: string | null;
	state: string | null;
};

const SEARCH_ISSUES_QUERY = `query SearchIssues($term: String!, $first: Int!) {
  searchIssues(term: $term, first: $first) {
    nodes {
      id
      identifier
      title
      url
      createdAt
      state { name type }
    }
  }
}`;

export function parseLinearSearch(value: unknown): ObservedLinearIssue[] {
	const body = parseBody(linearSearchResponse, value, "Linear search");
	if (!body.ok) return [];

	const nodes =
		body.data.data?.searchIssues?.nodes ??
		body.data.data?.issueSearch?.nodes ??
		[];

	const issues: ObservedLinearIssue[] = [];
	for (const node of nodes) {
		const issue = linearIssue.safeParse(node);
		if (!issue.success) continue;
		issues.push({
			id: issue.data.id,
			identifier: issue.data.identifier,
			title: issue.data.title,
			url: issue.data.url,
			createdAt: issue.data.createdAt ?? null,
			state: issue.data.state?.name ?? issue.data.state?.type ?? null,
		});
	}

	return issues;
}

export function linearSearchError(value: unknown): string | null {
	const body = linearSearchResponse.safeParse(value);
	const message = body.success ? body.data.errors?.[0]?.message : undefined;
	return message ?? null;
}

export async function searchLinearIssues(
	query: string,
): Promise<
	| ReturnType<typeof unavailable>
	| { ok: true; issues: ObservedLinearIssue[] }
	| { ok: false; configured: true; reason: string }
> {
	if (!(await enabled("LINEAR_API_KEY"))) return unavailable("LINEAR_API_KEY");

	const token = process.env.LINEAR_API_KEY?.trim();
	if (!token) return unavailable("LINEAR_API_KEY");

	const result = await requestJson(EXTERNAL_SOURCES.linear.endpoint, {
		method: "POST",
		headers: {
			authorization: token,
			"content-type": "application/json",
		},
		body: JSON.stringify({
			query: SEARCH_ISSUES_QUERY,
			variables: {
				term: query,
				first: EXTERNAL_SOURCES.linear.issueLimit,
			},
		}),
	});

	if (!result.ok) {
		return { ok: false, configured: true, reason: result.reason };
	}

	const graphqlError = linearSearchError(result.value);
	if (graphqlError) {
		return { ok: false, configured: true, reason: graphqlError };
	}

	return { ok: true, issues: parseLinearSearch(result.value) };
}
