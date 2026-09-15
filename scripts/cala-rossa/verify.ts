import { fieldKeyFromLabel } from "../../packages/db/src/fields-shape.ts";
import { db, FieldEntity } from "../../packages/db/src/index.ts";
import { SETTINGS_ID } from "../../packages/db/src/settings.ts";
import { WORKSPACE_ID } from "../../packages/db/src/workspace.ts";

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(`FAIL ${message}`);
}

async function main(): Promise<void> {
	const workspace = await db.organization.findUnique({
		where: { id: WORKSPACE_ID },
	});
	assert(
		workspace?.name === "Entré Business Cala Rossa",
		"workspace name does not match",
	);
	assert(
		workspace.slug === "entre-business-cala-rossa",
		"workspace slug does not match",
	);
	const profile = await db.workspaceProfile.findUnique({
		where: { id: WORKSPACE_ID },
	});
	assert(
		profile?.narrative.includes("human-gated"),
		"workspace agent boundary is missing",
	);

	const companies = await db.company.findMany({
		where: { id: { startsWith: "carla-account-" }, archivedAt: null },
		select: {
			id: true,
			name: true,
			email: true,
			phone: true,
			logoUrl: true,
			logoDarkUrl: true,
			iconUrl: true,
			iconDarkUrl: true,
			fieldValues: {
				select: {
					text: true,
					number: true,
					option: { select: { label: true } },
					field: { select: { key: true } },
				},
			},
		},
	});
	const deals = await db.deal.findMany({
		where: { id: { startsWith: "carla-deal-" }, archivedAt: null },
		select: {
			id: true,
			companyId: true,
			amount: true,
			fieldValues: {
				select: {
					text: true,
					number: true,
					bool: true,
					option: { select: { label: true } },
					field: { select: { key: true } },
				},
			},
		},
	});
	assert(
		companies.length === 29,
		`company count is ${companies.length}, expected 29`,
	);
	assert(deals.length === 71, `deal count is ${deals.length}, expected 71`);
	assert(
		new Set(companies.map((row) => row.name)).size === 29,
		"company names are not unique",
	);
	assert(
		new Set(deals.map((row) => row.id)).size === 71,
		"deal IDs are not unique",
	);
	assert(
		deals.every((row) =>
			companies.some((company) => company.id === row.companyId),
		),
		"an opportunity lacks an imported buyer account",
	);
	console.log("PASS imported entities: 29 active companies, 71 active deals");

	const contacts = await db.contact.count();
	assert(contacts === 0, `contact count is ${contacts}, expected 0`);
	assert(
		companies.every((row) => row.email === null && row.phone === null),
		"a company contains an imported email or phone",
	);
	console.log("PASS identity boundary: 0 contacts");

	const companyFields = await db.fieldDefinition.findMany({
		where: {
			entity: FieldEntity.COMPANY,
			position: { gte: 100, lte: 115 },
			archivedAt: null,
		},
	});
	const dealFields = await db.fieldDefinition.findMany({
		where: {
			entity: FieldEntity.DEAL,
			position: { gte: 200, lte: 264 },
			archivedAt: null,
		},
	});
	assert(
		companyFields.length === 16,
		`company custom field count is ${companyFields.length}, expected 16`,
	);
	assert(
		dealFields.length === 65,
		`deal custom field count is ${dealFields.length}, expected 65`,
	);

	const requiredDealKeys = [
		"Listing record ID",
		"Source lane",
		"Villa lead priority score",
		"Villa priority tier",
		"Platform count",
		"Villa confirmed platforms",
		"Platform evidence",
		"Source URLs",
		"Rental price",
		"Price unit",
		"Price basis",
		"Price source URL",
		"Price confidence",
		"Visible image count",
		"Visible media delivery",
		"Scene coverage",
		"Existing video",
		"Video scope",
		"Existing 3D",
		"Existing 3D scope",
		"Recommended offer",
		"Minimum next input",
		"Rights status",
		"Duplicate group",
		"Dedupe evidence",
		"Unresolved gap",
		"Prospecting status",
		"Lead priority reason",
		"Canonical property URL",
		"Link validation",
		"Geographic source scope",
		"Waterfront classification",
		"Waterfront evidence",
		"Pool claim",
		"Beach distance or access",
		"Person capacity",
		"Bedrooms",
		"Beds",
		"Bathrooms",
		"Property type",
		"Media grade",
		"Production readiness",
		"Premium film capability",
		"Factual 3D capability",
		"Required production input",
		"Scope decision",
		"Content validation",
		"Data confidence",
	].map(fieldKeyFromLabel);
	for (const deal of deals) {
		const keys = new Set(deal.fieldValues.map((value) => value.field.key));
		for (const key of requiredDealKeys)
			assert(keys.has(key), `${deal.id} lacks required field ${key}`);
		assert(
			deal.amount === null,
			`${deal.id} incorrectly treats rental value as service deal amount`,
		);
		const canonicalUrl = deal.fieldValues.find(
			(value) =>
				value.field.key === fieldKeyFromLabel("Canonical property URL"),
		)?.text;
		const sourceUrls = deal.fieldValues.find(
			(value) => value.field.key === fieldKeyFromLabel("Source URLs"),
		)?.text;
		const linkValidation = deal.fieldValues.find(
			(value) => value.field.key === fieldKeyFromLabel("Link validation"),
		)?.text;
		const waterfront = deal.fieldValues.find(
			(value) => value.field.key === fieldKeyFromLabel("Waterfront"),
		)?.bool;
		assert(
			typeof canonicalUrl === "string" && canonicalUrl.startsWith("http"),
			`${deal.id} lacks a canonical URL`,
		);
		assert(
			sourceUrls?.includes(canonicalUrl),
			`${deal.id} canonical URL is absent from source URLs`,
		);
		assert(
			!linkValidation?.includes("not_yet_audited"),
			`${deal.id} contains an unaudited property URL`,
		);
		assert(waterfront === false, `${deal.id} is waterfront but remains active`);
	}

	const valueByKey = (deal: (typeof deals)[number], label: string) =>
		deal.fieldValues.find(
			(value) => value.field.key === fieldKeyFromLabel(label),
		);
	const companyValueByKey = (
		company: (typeof companies)[number],
		label: string,
	) =>
		company.fieldValues.find(
			(value) => value.field.key === fieldKeyFromLabel(label),
		);
	const rankedCompanies = [...companies].sort(
		(a, b) =>
			Number(companyValueByKey(a, "Lead rank")?.number) -
			Number(companyValueByKey(b, "Lead rank")?.number),
	);
	assert(
		rankedCompanies[0]?.name === "Marina Rossa",
		"rank 1 account is not Marina Rossa",
	);
	assert(
		Number(
			companyValueByKey(rankedCompanies[0], "Lead priority score")?.number,
		) === 98,
		"Marina Rossa score is not 98",
	);
	assert(
		rankedCompanies[1]?.name === "Villa Casa Rossa / Résidences Lecci",
		"rank 2 account is not Villa Casa Rossa",
	);
	assert(
		rankedCompanies[2]?.name === "BARNES Corse",
		"rank 3 account is not BARNES Corse",
	);
	const rl460 = deals.find((deal) => deal.id === "carla-deal-barnes-rl460");
	assert(rl460, "BARNES RL460 is missing");
	assert(
		valueByKey(rl460, "Rental price")?.text === "Prix sur demande",
		"BARNES RL460 uses a stale public price",
	);
	const multiPlatform = deals.filter(
		(deal) => Number(valueByKey(deal, "Platform count")?.number) >= 2,
	).length;
	const airbnbSet = deals.filter(
		(deal) => valueByKey(deal, "Airbnb set member")?.bool === true,
	).length;
	const priceOutcomes = deals.filter((deal) =>
		Boolean(valueByKey(deal, "Rental price")?.text),
	).length;
	const exactVideos = deals.filter(
		(deal) =>
			valueByKey(deal, "Video scope")?.option?.label === "Exact property",
	).length;
	const exact3d = deals.filter(
		(deal) =>
			valueByKey(deal, "Existing 3D scope")?.option?.label === "Exact property",
	).length;
	const scopeCount = (label: string) =>
		deals.filter(
			(deal) => valueByKey(deal, "Scope decision")?.option?.label === label,
		).length;
	assert(
		multiPlatform === 36,
		`multi-platform count is ${multiPlatform}, expected 36`,
	);
	assert(airbnbSet === 39, `Airbnb set count is ${airbnbSet}, expected 39`);
	assert(
		priceOutcomes === 71,
		`price outcome count is ${priceOutcomes}, expected 71`,
	);
	assert(exactVideos === 6, `exact video count is ${exactVideos}, expected 6`);
	assert(exact3d === 2, `exact 3D count is ${exact3d}, expected 2`);
	assert(
		scopeCount("eligible_confirmed_non_waterfront") === 37,
		"confirmed non-waterfront count is not 37",
	);
	assert(
		scopeCount("eligible_provisional_no_waterfront_claim") === 27,
		"provisional non-waterfront count is not 27",
	);
	assert(
		scopeCount("inventory_class_select_exact_unit") === 7,
		"inventory class count is not 7",
	);
	console.log("PASS opportunity evidence: 71 complete records");

	const preparationTasks = await db.activity.findMany({
		where: { id: { startsWith: "carla-task-" }, completedAt: null },
		select: {
			type: true,
			body: true,
			completedAt: true,
			companyId: true,
			dealId: true,
			meta: true,
		},
	});
	const agentTasks = await db.agentTask.count();
	assert(
		preparationTasks.length === 29,
		`preparation task count is ${preparationTasks.length}, expected 29`,
	);
	assert(
		preparationTasks.every(
			(row) =>
				row.type === "TASK" &&
				row.body?.includes("before any send") &&
				row.companyId &&
				row.dealId,
		),
		"a prospecting task lacks a human gate",
	);
	assert(agentTasks === 0, `agent task count is ${agentTasks}, expected 0`);
	assert(
		(await db.activity.count({
			where: { type: { in: ["EMAIL", "CALL"] } },
		})) === 0,
		"outbound activity exists",
	);
	console.log(
		"PASS prospecting queue: 29 active human-gated tasks, 0 agent tasks",
	);

	assert(
		(await db.company.count({
			where: { id: { startsWith: "carla-account-" }, archivedAt: null },
		})) === 29,
		"company count drifted after idempotent upsert",
	);
	assert(
		(await db.deal.count({
			where: { id: { startsWith: "carla-deal-" }, archivedAt: null },
		})) === 71,
		"deal count drifted after idempotent upsert",
	);
	assert(
		(await db.activity.count({
			where: { id: { startsWith: "carla-task-" }, completedAt: null },
		})) === 29,
		"task count drifted after idempotent upsert",
	);
	console.log("PASS idempotence: stable imported identifiers and counts");
	console.log("PASS active-set replacement: superseded records are inactive");

	assert(
		companies.every(
			(row) =>
				row.logoUrl === null &&
				row.logoDarkUrl === null &&
				row.iconUrl === null &&
				row.iconDarkUrl === null,
		),
		"downloaded company media exists",
	);
	const settings = await db.appSetting.findUnique({
		where: { id: SETTINGS_ID },
	});
	assert(settings?.contextDevApiKey === null, "a paid research key is stored");
	assert(
		(await db.agentDefinition.count()) === 0,
		"an autonomous agent definition was activated",
	);
	console.log(
		"PASS safety boundary: no contact data, media, paid key, outbound activity or autonomous agent",
	);
}

try {
	await main();
} finally {
	await db.$disconnect();
}
