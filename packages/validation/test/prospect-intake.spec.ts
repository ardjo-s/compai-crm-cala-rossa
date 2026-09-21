import { describe, expect, it } from "bun:test";
import { DealStage } from "@crm/db/enums";
import { InvalidInput } from "../src/index";
import {
	contactsWithoutEmail,
	outboundExclusion,
	parseProspectIntake,
} from "../src/prospect-intake";

const company = {
	name: "Acme",
	domain: "acme.test",
	website: "https://acme.test",
};

describe("parseProspectIntake", () => {
	it("accepts a company with no contacts when no email was observed", () => {
		const batch = parseProspectIntake({
			source: "outbound-prospecting",
			items: [{ company, contacts: [] }],
		});

		expect(batch.items).toHaveLength(1);
		expect(batch.items[0]?.contacts).toEqual([]);
	});

	it("accepts a contact only when the email is a real address", () => {
		const batch = parseProspectIntake({
			source: "outbound-prospecting",
			items: [
				{
					company,
					contacts: [
						{
							firstName: "Ada",
							email: "ada@acme.test",
							title: "CEO",
							facts: [
								{
									field: "title",
									value: "CEO",
									sourceUrl: "https://acme.test/team",
									observation: "the team page lists Ada as CEO",
								},
							],
						},
					],
				},
			],
		});

		expect(batch.items[0]?.contacts[0]?.email).toBe("ada@acme.test");
	});

	it("refuses a guessed local-part that is not an email", () => {
		expect(() =>
			parseProspectIntake({
				source: "outbound-prospecting",
				items: [
					{
						company,
						contacts: [{ firstName: "Ada", email: "ada@" }],
					},
				],
			}),
		).toThrow(InvalidInput);
	});

	it("refuses a batch that invents a source other than outbound-prospecting", () => {
		expect(() =>
			parseProspectIntake({
				source: "guessed",
				items: [{ company }],
			}),
		).toThrow(InvalidInput);
	});
});

describe("outboundExclusion", () => {
	it("lets a prospect with no deals through", () => {
		expect(
			outboundExclusion({
				accountType: "Prospect",
				lifecycleStage: "Lead",
				dealStages: [],
			}),
		).toEqual({ eligible: true, reasons: [] });
	});

	it("blocks a customer account", () => {
		const result = outboundExclusion({ accountType: "Customer" });
		expect(result.eligible).toBe(false);
		expect(result.reasons).toContain("Account type is Customer.");
	});

	it("blocks an open pipeline deal", () => {
		const result = outboundExclusion({
			dealStages: [DealStage.CONTRACT_SENT],
		});
		expect(result.eligible).toBe(false);
		expect(result.reasons).toContain("An open deal already exists.");
	});

	it("blocks a closed-won customer even with a prospect label", () => {
		const result = outboundExclusion({
			accountType: "Prospect",
			dealStages: [DealStage.CLOSED_WON],
		});
		expect(result.eligible).toBe(false);
		expect(result.reasons).toContain("A deal is already closed-won.");
	});

	it("does not block a closed-lost deal on its own", () => {
		expect(
			outboundExclusion({
				accountType: "Prospect",
				dealStages: [DealStage.CLOSED_LOST],
			}).eligible,
		).toBe(true);
	});
});

describe("contactsWithoutEmail", () => {
	it("names the contacts a bot must not invent an address for", () => {
		const named = contactsWithoutEmail([
			{ firstName: "Ada", email: "ada@acme.test", facts: [] },
			{ firstName: "Noemail", facts: [] },
		]);

		expect(named.map((contact) => contact.firstName)).toEqual(["Noemail"]);
	});
});
