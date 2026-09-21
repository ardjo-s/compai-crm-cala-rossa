import { z } from "zod";
import { EXTERNAL_SOURCES } from "./external-sources-config";

export type HttpFailure = {
	ok: false;
	reason: string;
	status?: number;
};

export async function requestJson(
	url: string,
	init: RequestInit,
): Promise<{ ok: true; value: unknown } | HttpFailure> {
	try {
		const headers = new Headers(init.headers);
		if (!headers.has("user-agent")) {
			headers.set("user-agent", EXTERNAL_SOURCES.userAgent);
		}

		const response = await fetch(url, {
			...init,
			headers,
			signal: AbortSignal.timeout(EXTERNAL_SOURCES.timeoutMs),
		});

		let value: unknown = null;
		const body = await response.text();
		if (body.trim()) {
			try {
				value = JSON.parse(body);
			} catch {
				return {
					ok: false,
					reason: "The source returned a body that is not JSON.",
					status: response.status,
				};
			}
		}

		if (!response.ok) {
			return {
				ok: false,
				reason: `The source returned HTTP ${response.status}.`,
				status: response.status,
			};
		}

		return { ok: true, value };
	} catch (cause) {
		return {
			ok: false,
			reason: cause instanceof Error ? cause.message : String(cause),
		};
	}
}

export function parseBody<Schema extends z.ZodType>(
	schema: Schema,
	value: unknown,
	subject: string,
): { ok: true; data: z.infer<Schema> } | HttpFailure {
	const result = schema.safeParse(value);
	if (!result.success) {
		return {
			ok: false,
			reason: `${subject} did not match the documented shape.`,
		};
	}

	return { ok: true, data: result.data };
}
