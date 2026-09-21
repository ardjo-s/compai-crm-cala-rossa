import { z } from "zod";
import { enabled, unavailable } from "./capabilities";
import { EXTERNAL_SOURCES } from "./external-sources-config";
import { parseBody, requestJson } from "./external-http";
import { parseSocialUrl } from "./socials";

const xUserResponse = z.object({
	data: z
		.object({
			id: z.string(),
			name: z.string().optional().catch(undefined),
			username: z.string(),
		})
		.optional()
		.catch(undefined),
	errors: z
		.array(
			z.object({
				detail: z.string().optional(),
				title: z.string().optional(),
			}),
		)
		.optional()
		.catch(undefined),
});

const xTweetsResponse = z.object({
	data: z
		.array(
			z.object({
				id: z.string(),
				text: z.string(),
				created_at: z.string().optional().catch(undefined),
			}),
		)
		.optional()
		.catch(undefined),
	errors: z
		.array(
			z.object({
				detail: z.string().optional(),
				title: z.string().optional(),
			}),
		)
		.optional()
		.catch(undefined),
});

export type ObservedXPost = {
	id: string;
	text: string;
	createdAt: string | null;
	url: string;
};

export type ObservedXProfile = {
	handle: string;
	name: string | null;
	url: string;
	posts: ObservedXPost[];
};

function xError(value: {
	errors?: { detail?: string; title?: string }[];
}): string | null {
	const first = value.errors?.[0];
	if (!first) return null;
	return first.detail ?? first.title ?? "X refused the request.";
}

export function parseXUser(
	value: unknown,
):
	| { ok: true; id: string; name: string | null; username: string }
	| { ok: false; reason: string } {
	const body = parseBody(xUserResponse, value, "X user");
	if (!body.ok) return { ok: false, reason: body.reason };
	const error = xError(body.data);
	if (error) return { ok: false, reason: error };
	if (!body.data.data) {
		return { ok: false, reason: "X returned no user for that handle." };
	}
	return {
		ok: true,
		id: body.data.data.id,
		name: body.data.data.name ?? null,
		username: body.data.data.username,
	};
}

export function parseXTweets(
	value: unknown,
	handle: string,
): { ok: true; posts: ObservedXPost[] } | { ok: false; reason: string } {
	const body = parseBody(xTweetsResponse, value, "X posts");
	if (!body.ok) return { ok: false, reason: body.reason };
	const error = xError(body.data);
	if (error && !body.data.data) return { ok: false, reason: error };

	return {
		ok: true,
		posts: (body.data.data ?? []).map((tweet) => ({
			id: tweet.id,
			text: tweet.text,
			createdAt: tweet.created_at ?? null,
			url: `https://x.com/${handle}/status/${tweet.id}`,
		})),
	};
}

function handleFromInput(input: string): string | null {
	const trimmed = input.trim();
	if (!trimmed) return null;
	const asUrl = trimmed.startsWith("http")
		? trimmed
		: `https://x.com/${trimmed.replace(/^@/, "")}`;
	const parsed = parseSocialUrl(asUrl);
	if (parsed?.network !== "x") return null;
	return parsed.handle;
}

export async function lookupXPosts(input: string): Promise<
	| ReturnType<typeof unavailable>
	| { ok: true; profile: ObservedXProfile }
	| { ok: false; configured: true; reason: string }
> {
	if (!(await enabled("X_BEARER_TOKEN"))) return unavailable("X_BEARER_TOKEN");

	const token = process.env.X_BEARER_TOKEN?.trim();
	if (!token) return unavailable("X_BEARER_TOKEN");

	const handle = handleFromInput(input);
	if (!handle) {
		return {
			ok: false,
			configured: true,
			reason: "That is not an X profile URL or handle.",
		};
	}

	const headers = { authorization: `Bearer ${token}` };
	const user = await requestJson(
		`${EXTERNAL_SOURCES.x.userEndpoint}/${encodeURIComponent(handle)}?user.fields=name,username`,
		{ headers },
	);

	if (!user.ok) {
		if (user.status === 404) {
			return {
				ok: false,
				configured: true,
				reason: "No such X account.",
			};
		}
		return { ok: false, configured: true, reason: user.reason };
	}

	const parsedUser = parseXUser(user.value);
	if (!parsedUser.ok) {
		return { ok: false, configured: true, reason: parsedUser.reason };
	}

	const tweets = await requestJson(
		`${EXTERNAL_SOURCES.x.tweetsEndpoint}/${encodeURIComponent(parsedUser.id)}/tweets?max_results=${EXTERNAL_SOURCES.x.tweetLimit}&tweet.fields=created_at,text`,
		{ headers },
	);

	if (!tweets.ok) {
		return { ok: false, configured: true, reason: tweets.reason };
	}

	const parsedTweets = parseXTweets(tweets.value, parsedUser.username);
	if (!parsedTweets.ok) {
		return { ok: false, configured: true, reason: parsedTweets.reason };
	}

	return {
		ok: true,
		profile: {
			handle: parsedUser.username,
			name: parsedUser.name,
			url: `https://x.com/${parsedUser.username}`,
			posts: parsedTweets.posts,
		},
	};
}
