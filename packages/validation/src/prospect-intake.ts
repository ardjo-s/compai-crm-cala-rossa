import { OPEN_DEAL_STAGES } from "@crm/db/deal-stage";
import { DealStage } from "@crm/db/enums";
import { z } from "zod";
import { parse } from "./index";

const OPEN = new Set<string>(OPEN_DEAL_STAGES);
const CUSTOMER_ACCOUNT_TYPES = new Set(["Customer", "Churned"]);
const CUSTOMER_LIFECYCLES = new Set(["Customer"]);

const observedEmail = z
	.string()
	.trim()
	.email()
	.describe(
		"An address that was observed. Never a guessed or patterned email.",
	);

const observedUrl = z.string().trim().url().max(2000);

export const prospectFact = z.object({
	field: z.string().trim().min(1).max(80),
	value: z.string().trim().min(1).max(500),
	sourceUrl: observedUrl,
	observation: z
		.string()
		.trim()
		.min(1)
		.max(500)
		.describe("What the source actually said, in the source's words."),
});

export const prospectContact = z.object({
	firstName: z.string().trim().min(1).max(80),
	lastName: z.string().trim().max(80).optional(),
	email: observedEmail.optional(),
	title: z.string().trim().max(160).optional(),
	linkedinUrl: observedUrl.optional(),
	facts: z.array(prospectFact).max(20).default([]),
});

export const prospectCompany = z.object({
	name: z.string().trim().min(1).max(160),
	domain: z
		.string()
		.trim()
		.min(1)
		.max(160)
		.regex(/^[a-z0-9.-]+\.[a-z]{2,}$/i, "A real registrable domain."),
	website: observedUrl.optional(),
	facts: z.array(prospectFact).max(20).default([]),
});

export const prospectIntakeItem = z.object({
	company: prospectCompany,
	contacts: z.array(prospectContact).max(20).default([]),
	accountType: z
		.enum(["Prospect", "Customer", "Partner", "Churned"])
		.optional(),
	lifecycleStage: z
		.enum(["Lead", "MQL", "SQL", "Opportunity", "Customer"])
		.optional(),
	dealStages: z.array(z.string().trim().min(1)).max(20).default([]),
});

export const prospectIntakeBatch = z.object({
	source: z.literal("outbound-prospecting"),
	items: z.array(prospectIntakeItem).min(1).max(200),
});

export type ProspectFact = z.infer<typeof prospectFact>;
export type ProspectContact = z.infer<typeof prospectContact>;
export type ProspectCompany = z.infer<typeof prospectCompany>;
export type ProspectIntakeItem = z.infer<typeof prospectIntakeItem>;
export type ProspectIntakeBatch = z.infer<typeof prospectIntakeBatch>;

export function parseProspectIntake(value: unknown): ProspectIntakeBatch {
	return parse(prospectIntakeBatch, value, "Prospect intake");
}

export type OutboundExclusion = {
	eligible: boolean;
	reasons: string[];
};

export function outboundExclusion(item: {
	accountType?: string | null;
	lifecycleStage?: string | null;
	dealStages?: readonly string[] | null;
}): OutboundExclusion {
	const reasons: string[] = [];
	const accountType = item.accountType?.trim() ?? "";
	const lifecycleStage = item.lifecycleStage?.trim() ?? "";
	const dealStages = item.dealStages ?? [];

	if (CUSTOMER_ACCOUNT_TYPES.has(accountType)) {
		reasons.push(`Account type is ${accountType}.`);
	}

	if (CUSTOMER_LIFECYCLES.has(lifecycleStage)) {
		reasons.push("Lifecycle stage is Customer.");
	}

	if (dealStages.includes(DealStage.CLOSED_WON)) {
		reasons.push("A deal is already closed-won.");
	}

	const open = dealStages.filter((stage) => OPEN.has(stage));
	if (open.length > 0) {
		reasons.push("An open deal already exists.");
	}

	return { eligible: reasons.length === 0, reasons };
}

export function contactsWithoutEmail(
	contacts: readonly ProspectContact[],
): readonly ProspectContact[] {
	return contacts.filter((contact) => !contact.email);
}
