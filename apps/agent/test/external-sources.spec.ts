import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
	parseLinearSearch,
	searchLinearIssues,
} from "../agent/lib/linear";
import { parseNotionSearch, searchNotionPages } from "../agent/lib/notion";
import { lookupXPosts, parseXTweets, parseXUser } from "../agent/lib/x-posts";

const KEYS = ["NOTION_API_KEY", "LINEAR_API_KEY", "X_BEARER_TOKEN"] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
	for (const key of KEYS) {
		saved[key] = process.env[key];
		delete process.env[key];
	}
});

afterEach(() => {
	for (const key of KEYS) {
		if (saved[key] === undefined) delete process.env[key];
		else process.env[key] = saved[key];
	}
});

describe("parseNotionSearch", () => {
	it("keeps page title, url and last edited time", () => {
		const pages = parseNotionSearch({
			results: [
				{
					id: "page-1",
					object: "page",
					url: "https://www.notion.so/page-1",
					last_edited_time: "2026-09-01T10:00:00.000Z",
					properties: {
						Name: {
							type: "title",
							title: [{ plain_text: "Acme target list" }],
						},
					},
				},
				{
					id: "db-1",
					object: "database",
					url: "https://www.notion.so/db-1",
				},
			],
		});

		expect(pages).toEqual([
			{
				id: "page-1",
				url: "https://www.notion.so/page-1",
				title: "Acme target list",
				lastEditedAt: "2026-09-01T10:00:00.000Z",
			},
		]);
	});

	it("returns nothing for a body it cannot read", () => {
		expect(parseNotionSearch({ results: "nope" })).toEqual([]);
	});
});

describe("parseLinearSearch", () => {
	it("reads searchIssues nodes", () => {
		const issues = parseLinearSearch({
			data: {
				searchIssues: {
					nodes: [
						{
							id: "iss-1",
							identifier: "GOJ-12",
							title: "Follow up Acme contract",
							url: "https://linear.app/ardjo/issue/GOJ-12",
							createdAt: "2026-09-01T10:00:00.000Z",
							state: { name: "Todo", type: "unstarted" },
						},
					],
				},
			},
		});

		expect(issues).toEqual([
			{
				id: "iss-1",
				identifier: "GOJ-12",
				title: "Follow up Acme contract",
				url: "https://linear.app/ardjo/issue/GOJ-12",
				createdAt: "2026-09-01T10:00:00.000Z",
				state: "Todo",
			},
		]);
	});
});

describe("parseXUser and parseXTweets", () => {
	it("builds permalinks from the handle and tweet id", () => {
		const user = parseXUser({
			data: { id: "42", name: "Ada", username: "ada" },
		});
		expect(user).toEqual({
			ok: true,
			id: "42",
			name: "Ada",
			username: "ada",
		});

		const tweets = parseXTweets(
			{
				data: [
					{
						id: "99",
						text: "We shipped the API today",
						created_at: "2026-09-01T10:00:00.000Z",
					},
				],
			},
			"ada",
		);

		expect(tweets).toEqual({
			ok: true,
			posts: [
				{
					id: "99",
					text: "We shipped the API today",
					createdAt: "2026-09-01T10:00:00.000Z",
					url: "https://x.com/ada/status/99",
				},
			],
		});
	});

	it("surfaces an X error instead of an empty user", () => {
		expect(
			parseXUser({ errors: [{ detail: "User not found" }] }),
		).toEqual({ ok: false, reason: "User not found" });
	});
});

describe("unconfigured sources", () => {
	it("does not call Notion when the key is missing", async () => {
		const result = await searchNotionPages("Acme");
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.configured).toBe(false);
		expect(result.reason).toContain("NOTION_API_KEY");
	});

	it("does not call Linear when the key is missing", async () => {
		const result = await searchLinearIssues("Acme");
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.configured).toBe(false);
	});

	it("does not call X when the bearer token is missing", async () => {
		const result = await lookupXPosts("https://x.com/ada");
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.configured).toBe(false);
		expect(result.reason).toContain("X_BEARER_TOKEN");
	});
});
