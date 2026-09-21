import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

function findRoot(start: string): string | null {
	let directory = resolve(start);

	for (;;) {
		const manifest = join(directory, "package.json");
		if (existsSync(manifest)) {
			try {
				const parsed: unknown = JSON.parse(readFileSync(manifest, "utf8"));
				if (
					parsed instanceof Object &&
					"workspaces" in parsed &&
					parsed.workspaces !== undefined
				) {
					return directory;
				}
			} catch {}
		}

		const parent = dirname(directory);
		if (parent === directory) return null;
		directory = parent;
	}
}

const repoRoot = resolve(import.meta.dir, "..", "..", "..");

describe("finding the workspace root", () => {
	it("finds it from the repo root itself", () => {
		expect(findRoot(repoRoot)).toBe(repoRoot);
	});

	it("finds it from a package that has its own turbo.json", () => {
		for (const app of ["apps/api", "apps/agent"]) {
			expect(findRoot(join(repoRoot, app))).toBe(repoRoot);
		}
	});

	it("finds it from a nested source directory", () => {
		expect(findRoot(join(repoRoot, "packages", "db", "src"))).toBe(repoRoot);
	});

	it("returns null above the repo rather than walking to /", () => {
		expect(findRoot("/")).toBeNull();
	});

	it("only matches a manifest that declares workspaces", () => {
		const manifest: unknown = JSON.parse(
			readFileSync(join(repoRoot, "apps", "api", "package.json"), "utf8"),
		);
		expect(manifest instanceof Object && "workspaces" in manifest).toBe(false);
	});
});

describe("the committed .env.example", () => {
	const example = readFileSync(join(repoRoot, ".env.example"), "utf8");

	it("names every variable the required section promises", () => {
		for (const key of [
			"DATABASE_URL",
			"BETTER_AUTH_SECRET",
			"ALLOWED_SIGN_IN",
			"GOOGLE_CLIENT_ID",
			"GOOGLE_CLIENT_SECRET",
		]) {
			expect(example).toContain(`${key}=`);
		}
	});

	it("ships no secret of its own", () => {
		for (const line of example.split("\n")) {
			if (line.startsWith("#") || !line.includes("=")) continue;
			const value = line.slice(line.indexOf("=") + 1).trim();
			expect(value === '""' || value.length > 0).toBe(true);
			if (line.startsWith("BETTER_AUTH_SECRET")) expect(value).toBe('""');
			if (line.startsWith("ALLOWED_SIGN_IN")) expect(value).toBe('""');
		}
	});

	it("names the optional Cursor-tool keys", () => {
		for (const key of ["NOTION_API_KEY", "LINEAR_API_KEY", "X_BEARER_TOKEN"]) {
			expect(example).toContain(key);
		}
	});
});

describe("the committed .env.ardjo.example", () => {
	const example = readFileSync(join(repoRoot, ".env.ardjo.example"), "utf8");

	it("sets the work allow-list and no secrets", () => {
		expect(example).toContain("Cala Rossa");
		expect(example).toContain("ardjo-s/compai-crm-cala-rossa");
		expect(example).toContain('ALLOWED_SIGN_IN="ardjo.design,hi@ardjo.design"');
		expect(example).toContain('BETTER_AUTH_SECRET=""');
		expect(example).toContain('GOOGLE_CLIENT_SECRET=""');
		expect(example).not.toContain("gmail.com");
	});

	it("ships no filled secret field", () => {
		for (const line of example.split("\n")) {
			if (line.startsWith("#") || !line.includes("=")) continue;
			const key = line.slice(0, line.indexOf("="));
			const value = line.slice(line.indexOf("=") + 1).trim();
			if (
				key === "ALLOWED_SIGN_IN" ||
				key === "DATABASE_URL" ||
				key === "TEST_DATABASE_URL"
			) {
				expect(value.length).toBeGreaterThan(0);
				continue;
			}
			expect(value).toBe('""');
		}
	});
});
