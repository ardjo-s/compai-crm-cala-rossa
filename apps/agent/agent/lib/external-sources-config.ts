const SECOND_MS = 1_000;

export const EXTERNAL_SOURCES = {
	timeoutMs: 15 * SECOND_MS,
	userAgent: "comp-ai-crm-research-agent",
	notion: {
		version: "2022-06-28",
		pageLimit: 10,
		endpoint: "https://api.notion.com/v1/search",
	},
	linear: {
		issueLimit: 10,
		endpoint: "https://api.linear.app/graphql",
	},
	x: {
		tweetLimit: 10,
		userEndpoint: "https://api.x.com/2/users/by/username",
		tweetsEndpoint: "https://api.x.com/2/users",
	},
} as const;
