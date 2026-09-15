import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fieldKeyFromLabel } from "../../packages/db/src/fields-shape.ts";
import {
	ActivityType,
	DealStage,
	db,
	EnrichmentStatus,
	FieldEntity,
	FieldType,
	RecordSource,
} from "../../packages/db/src/index.ts";
import { SETTINGS_ID } from "../../packages/db/src/settings.ts";
import {
	WORKSPACE_ID,
	workspaceSlug,
} from "../../packages/db/src/workspace.ts";

type CsvRow = Record<string, string>;

type FieldSpec = {
	name: string;
	entity: FieldEntity;
	label: string;
	type: FieldType;
	position: number;
	options?: readonly string[];
	showOnTable?: boolean;
	showOnFilter?: boolean;
};

type SeedField = {
	id: string;
	type: FieldType;
	options: Map<string, string>;
};

const BUSINESS_NAME = "Entré Business Cala Rossa";
const BUSINESS_WEBSITE = "https://cala-rossa.invalid";
const OWNER_ID = "cala-rossa-local-operator";
const OWNER_EMAIL = "cala-rossa-operator@local.invalid";
const SOURCE_AUDIT =
	"/Users/ardjo/CODE/repos/cala-rossa/research/non-waterfront-enrichment/non-waterfront-villas-2026-09-06.md";
const AUDITED_AT = new Date("2026-09-06T00:00:00.000Z");
const QUALIFIED_SCOPE_DECISIONS = new Set([
	"eligible_confirmed_non_waterfront",
	"eligible_provisional_no_waterfront_claim",
	"inventory_class_select_exact_unit",
]);

function parseCsv(text: string): CsvRow[] {
	const records: string[][] = [];
	let record: string[] = [];
	let field = "";
	let quoted = false;
	for (let index = 0; index < text.length; index += 1) {
		const char = text[index];
		if (quoted) {
			if (char === '"' && text[index + 1] === '"') {
				field += '"';
				index += 1;
			} else if (char === '"') {
				quoted = false;
			} else {
				field += char;
			}
		} else if (char === '"') {
			quoted = true;
		} else if (char === ",") {
			record.push(field);
			field = "";
		} else if (char === "\n") {
			record.push(field);
			if (record.some((value) => value !== "")) records.push(record);
			record = [];
			field = "";
		} else if (char !== "\r") {
			field += char;
		}
	}
	if (quoted) throw new Error("Unclosed CSV quote.");
	if (field || record.length) {
		record.push(field);
		records.push(record);
	}
	const [header, ...rows] = records;
	if (!header) throw new Error("CSV has no header.");
	return rows.map((values, index) => {
		if (values.length !== header.length) {
			throw new Error(
				`CSV row ${index + 2} has ${values.length} columns. Expected ${header.length}.`,
			);
		}
		return Object.fromEntries(
			header.map((key, column) => [key, values[column] ?? ""]),
		);
	});
}

function readCsv(path: string, required: readonly string[]): CsvRow[] {
	const rows = parseCsv(readFileSync(path, "utf8"));
	const available = new Set(Object.keys(rows[0] ?? {}));
	for (const key of required) {
		if (!available.has(key))
			throw new Error(`${path} lacks required column ${key}.`);
	}
	return rows;
}

function slug(value: string): string {
	const normalized = value
		.normalize("NFKD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
	if (!normalized) throw new Error(`Cannot create a stable ID from ${value}.`);
	return normalized;
}

function numeric(value: string): number | null {
	if (!value.trim()) return null;
	const parsed = Number(value);
	if (!Number.isFinite(parsed))
		throw new Error(`Expected a number, got ${value}.`);
	return parsed;
}

function truth(value: string): boolean {
	if (value === "Yes") return true;
	if (value === "No" || value === "No public claim") return false;
	throw new Error(`Expected a boolean label, got ${value}.`);
}

function validateCounts(accounts: CsvRow[], opportunities: CsvRow[]): void {
	if (accounts.length !== 29)
		throw new Error(`Expected 29 account rows, got ${accounts.length}.`);
	if (opportunities.length !== 71)
		throw new Error(
			`Expected 71 opportunity rows, got ${opportunities.length}.`,
		);
	if (new Set(accounts.map((row) => row.target_account)).size !== 29)
		throw new Error("Buyer account names are not unique.");
	if (new Set(opportunities.map((row) => row.record_id)).size !== 71)
		throw new Error("Opportunity record IDs are not unique.");
	const accountNames = new Set(accounts.map((row) => row.target_account));
	for (const row of opportunities) {
		if (!accountNames.has(row.target_account))
			throw new Error(`No account row exists for ${row.target_account}.`);
	}
}

async function ensureField(spec: FieldSpec): Promise<SeedField> {
	const key = fieldKeyFromLabel(spec.label);
	const definition = await db.fieldDefinition.upsert({
		where: { entity_key: { entity: spec.entity, key } },
		create: {
			entity: spec.entity,
			key,
			label: spec.label,
			type: spec.type,
			agentFilled: false,
			showOnSheet: true,
			showOnTable: spec.showOnTable ?? false,
			showOnFilter: spec.showOnFilter ?? false,
			position: spec.position,
		},
		update: {
			label: spec.label,
			type: spec.type,
			agentFilled: false,
			showOnSheet: true,
			showOnTable: spec.showOnTable ?? false,
			showOnFilter: spec.showOnFilter ?? false,
			position: spec.position,
			archivedAt: null,
		},
	});
	const existing = await db.fieldOption.findMany({
		where: { fieldId: definition.id },
		orderBy: { position: "asc" },
	});
	const options = new Map(
		existing.filter((row) => !row.archivedAt).map((row) => [row.label, row.id]),
	);
	for (const [position, label] of (spec.options ?? []).entries()) {
		if (options.has(label)) continue;
		const created = await db.fieldOption.create({
			data: { fieldId: definition.id, label, position },
		});
		options.set(label, created.id);
	}
	return { id: definition.id, type: definition.type, options };
}

async function ensureFields(
	specs: readonly FieldSpec[],
): Promise<Map<string, SeedField>> {
	const fields = new Map<string, SeedField>();
	for (const spec of specs) fields.set(spec.name, await ensureField(spec));
	return fields;
}

function fieldData(field: SeedField, value: string | number | boolean) {
	if (field.type === FieldType.NUMBER) return { number: Number(value) };
	if (field.type === FieldType.CHECKBOX) return { bool: Boolean(value) };
	if (field.type === FieldType.SELECT) {
		const optionId = field.options.get(String(value));
		if (!optionId)
			throw new Error(`Field option ${String(value)} does not exist.`);
		return { optionId };
	}
	return { text: String(value) };
}

async function setCompanyField(
	field: SeedField,
	companyId: string,
	value: string | number | boolean | null,
): Promise<void> {
	if (value === null || value === "") return;
	const data = fieldData(field, value);
	await db.fieldValue.upsert({
		where: { fieldId_companyId: { fieldId: field.id, companyId } },
		create: { fieldId: field.id, companyId, ...data },
		update: data,
	});
}

async function setDealField(
	field: SeedField,
	dealId: string,
	value: string | number | boolean | null,
): Promise<void> {
	if (value === null || value === "") return;
	const data = fieldData(field, value);
	await db.fieldValue.upsert({
		where: { fieldId_dealId: { fieldId: field.id, dealId } },
		create: { fieldId: field.id, dealId, ...data },
		update: data,
	});
}

function routeDomain(route: string | null): string | null {
	if (!route) return null;
	try {
		const hostname = new URL(route).hostname.replace(/^www\./, "");
		if (["airbnb.fr", "airbnb.com", "airbnb.com.br"].includes(hostname))
			return null;
		return hostname;
	} catch {
		return null;
	}
}

function prospectingLane(account: CsvRow): string {
	if (!account.public_contact_route) return "Airbnb host only";
	if (
		/Villa Casa Rossa|Nananthée|Cala Felice|Lot 92/.test(account.target_account)
	)
		return "Owner direct";
	if (
		Number(account.eligible_exact_villa_records) +
			Number(account.inventory_class_records) >=
		2
	)
		return "Agency portfolio";
	return "Professional operator";
}

function accountRouteStatus(account: CsvRow, rows: CsvRow[]): string {
	if (account.public_contact_route)
		return "Public professional or owner-direct route";
	if (rows.every((row) => row.source_lane.startsWith("airbnb")))
		return "Airbnb-host route only in current evidence";
	return "Named account, no exact independent property route confirmed";
}

function accountSourceLane(rows: CsvRow[]): string {
	const lanes = new Set(rows.map((row) => row.source_lane));
	if (
		lanes.has("benchmark+airbnb") ||
		(lanes.has("benchmark") &&
			(lanes.has("airbnb") || lanes.has("airbnb_host_expansion")))
	)
		return "Benchmark + Airbnb";
	if (lanes.has("benchmark")) return "Benchmark";
	return "Airbnb";
}

const companyFieldSpecs: readonly FieldSpec[] = [
	{
		name: "rank",
		entity: FieldEntity.COMPANY,
		label: "Lead rank",
		type: FieldType.NUMBER,
		position: 100,
		showOnTable: true,
	},
	{
		name: "score",
		entity: FieldEntity.COMPANY,
		label: "Lead priority score",
		type: FieldType.NUMBER,
		position: 101,
		showOnTable: true,
	},
	{
		name: "tier",
		entity: FieldEntity.COMPANY,
		label: "Priority tier",
		type: FieldType.SELECT,
		position: 102,
		options: ["P1", "P2", "P3", "Nurture"],
		showOnTable: true,
		showOnFilter: true,
	},
	{
		name: "properties",
		entity: FieldEntity.COMPANY,
		label: "Properties in scope",
		type: FieldType.NUMBER,
		position: 103,
		showOnTable: true,
	},
	{
		name: "pilot",
		entity: FieldEntity.COMPANY,
		label: "Best pilot record",
		type: FieldType.TEXT,
		position: 104,
		showOnTable: true,
	},
	{
		name: "price",
		entity: FieldEntity.COMPANY,
		label: "Strongest price signal",
		type: FieldType.TEXT,
		position: 105,
	},
	{
		name: "media",
		entity: FieldEntity.COMPANY,
		label: "Media gap",
		type: FieldType.LONG_TEXT,
		position: 106,
	},
	{
		name: "platforms",
		entity: FieldEntity.COMPANY,
		label: "Confirmed platforms",
		type: FieldType.LONG_TEXT,
		position: 107,
	},
	{
		name: "route",
		entity: FieldEntity.COMPANY,
		label: "Public route",
		type: FieldType.URL,
		position: 108,
	},
	{
		name: "routeStatus",
		entity: FieldEntity.COMPANY,
		label: "Route status",
		type: FieldType.SELECT,
		position: 109,
		options: [
			"Public professional or owner-direct route",
			"Named account, no exact independent property route confirmed",
			"Airbnb-host route only in current evidence",
		],
		showOnFilter: true,
	},
	{
		name: "lane",
		entity: FieldEntity.COMPANY,
		label: "Prospecting lane",
		type: FieldType.SELECT,
		position: 110,
		options: [
			"Agency portfolio",
			"Owner direct",
			"Professional operator",
			"Airbnb host only",
		],
		showOnTable: true,
		showOnFilter: true,
	},
	{
		name: "outreach",
		entity: FieldEntity.COMPANY,
		label: "Outreach status",
		type: FieldType.SELECT,
		position: 111,
		options: [
			"Not contacted",
			"Contact route verified",
			"Authorization requested",
			"Proof approved",
			"Outreach approved",
			"Sent",
			"Replied",
		],
		showOnTable: true,
		showOnFilter: true,
	},
	{
		name: "decisionMaker",
		entity: FieldEntity.COMPANY,
		label: "Decision maker status",
		type: FieldType.SELECT,
		position: 112,
		options: ["Unknown", "Public role identified", "Verified"],
		showOnFilter: true,
	},
	{
		name: "sourceLane",
		entity: FieldEntity.COMPANY,
		label: "Lead source",
		type: FieldType.SELECT,
		position: 113,
		options: ["Benchmark", "Airbnb", "Benchmark + Airbnb"],
		showOnFilter: true,
	},
	{
		name: "nextAction",
		entity: FieldEntity.COMPANY,
		label: "Next action",
		type: FieldType.LONG_TEXT,
		position: 114,
	},
	{
		name: "audit",
		entity: FieldEntity.COMPANY,
		label: "Source audit",
		type: FieldType.LONG_TEXT,
		position: 115,
	},
];

const dealFieldSpecs: readonly FieldSpec[] = [
	{
		name: "rank",
		entity: FieldEntity.DEAL,
		label: "Villa rank",
		type: FieldType.NUMBER,
		position: 200,
		showOnTable: true,
	},
	{
		name: "recordId",
		entity: FieldEntity.DEAL,
		label: "Listing record ID",
		type: FieldType.TEXT,
		position: 201,
		showOnTable: true,
	},
	{
		name: "sourceLane",
		entity: FieldEntity.DEAL,
		label: "Source lane",
		type: FieldType.SELECT,
		position: 202,
		options: [
			"benchmark",
			"benchmark+airbnb",
			"airbnb",
			"airbnb_host_expansion",
		],
		showOnFilter: true,
	},
	{
		name: "airbnbMember",
		entity: FieldEntity.DEAL,
		label: "Airbnb set member",
		type: FieldType.CHECKBOX,
		position: 203,
		showOnFilter: true,
	},
	{
		name: "entityKind",
		entity: FieldEntity.DEAL,
		label: "Entity kind",
		type: FieldType.SELECT,
		position: 204,
		options: ["exact_villa", "inventory_class", "duplex"],
		showOnFilter: true,
	},
	{
		name: "score",
		entity: FieldEntity.DEAL,
		label: "Villa lead priority score",
		type: FieldType.NUMBER,
		position: 205,
		showOnTable: true,
	},
	{
		name: "tier",
		entity: FieldEntity.DEAL,
		label: "Villa priority tier",
		type: FieldType.SELECT,
		position: 206,
		options: ["P1", "P2", "P3", "Nurture"],
		showOnTable: true,
		showOnFilter: true,
	},
	{
		name: "platformCount",
		entity: FieldEntity.DEAL,
		label: "Platform count",
		type: FieldType.NUMBER,
		position: 207,
		showOnTable: true,
	},
	{
		name: "platforms",
		entity: FieldEntity.DEAL,
		label: "Villa confirmed platforms",
		type: FieldType.LONG_TEXT,
		position: 208,
	},
	{
		name: "platformEvidence",
		entity: FieldEntity.DEAL,
		label: "Platform evidence",
		type: FieldType.LONG_TEXT,
		position: 209,
	},
	{
		name: "sourceUrls",
		entity: FieldEntity.DEAL,
		label: "Source URLs",
		type: FieldType.LONG_TEXT,
		position: 210,
	},
	{
		name: "rentalPrice",
		entity: FieldEntity.DEAL,
		label: "Rental price",
		type: FieldType.TEXT,
		position: 211,
		showOnTable: true,
	},
	{
		name: "priceUnit",
		entity: FieldEntity.DEAL,
		label: "Price unit",
		type: FieldType.TEXT,
		position: 212,
	},
	{
		name: "priceBasis",
		entity: FieldEntity.DEAL,
		label: "Price basis",
		type: FieldType.LONG_TEXT,
		position: 213,
	},
	{
		name: "priceSource",
		entity: FieldEntity.DEAL,
		label: "Price source URL",
		type: FieldType.URL,
		position: 214,
	},
	{
		name: "priceConfidence",
		entity: FieldEntity.DEAL,
		label: "Price confidence",
		type: FieldType.SELECT,
		position: 215,
		options: ["High", "Medium", "Low"],
		showOnFilter: true,
	},
	{
		name: "weeklyRental",
		entity: FieldEntity.DEAL,
		label: "Weekly rental equivalent EUR",
		type: FieldType.NUMBER,
		position: 216,
	},
	{
		name: "images",
		entity: FieldEntity.DEAL,
		label: "Visible image count",
		type: FieldType.NUMBER,
		position: 217,
		showOnTable: true,
	},
	{
		name: "hqImages",
		entity: FieldEntity.DEAL,
		label: "HQ landscape count",
		type: FieldType.TEXT,
		position: 218,
	},
	{
		name: "fourkImages",
		entity: FieldEntity.DEAL,
		label: "4K landscape count",
		type: FieldType.TEXT,
		position: 219,
	},
	{
		name: "mediaDelivery",
		entity: FieldEntity.DEAL,
		label: "Visible media delivery",
		type: FieldType.LONG_TEXT,
		position: 220,
	},
	{
		name: "sceneCoverage",
		entity: FieldEntity.DEAL,
		label: "Scene coverage",
		type: FieldType.LONG_TEXT,
		position: 221,
	},
	{
		name: "video",
		entity: FieldEntity.DEAL,
		label: "Existing video",
		type: FieldType.LONG_TEXT,
		position: 222,
	},
	{
		name: "videoScope",
		entity: FieldEntity.DEAL,
		label: "Video scope",
		type: FieldType.SELECT,
		position: 223,
		options: ["None observed", "Exact property", "Destination generic"],
		showOnFilter: true,
	},
	{
		name: "existing3d",
		entity: FieldEntity.DEAL,
		label: "Existing 3D",
		type: FieldType.LONG_TEXT,
		position: 224,
	},
	{
		name: "existing3dScope",
		entity: FieldEntity.DEAL,
		label: "Existing 3D scope",
		type: FieldType.SELECT,
		position: 225,
		options: [
			"None observed",
			"Exact property",
			"Identity mismatch or alignment caveat",
		],
		showOnFilter: true,
	},
	{
		name: "filmCurrent",
		entity: FieldEntity.DEAL,
		label: "Film current score",
		type: FieldType.NUMBER,
		position: 226,
	},
	{
		name: "filmOriginals",
		entity: FieldEntity.DEAL,
		label: "Film after originals score",
		type: FieldType.NUMBER,
		position: 227,
	},
	{
		name: "factual3dCurrent",
		entity: FieldEntity.DEAL,
		label: "Factual 3D current score",
		type: FieldType.NUMBER,
		position: 228,
	},
	{
		name: "factual3dCapture",
		entity: FieldEntity.DEAL,
		label: "Factual 3D after capture score",
		type: FieldType.NUMBER,
		position: 229,
	},
	{
		name: "offer",
		entity: FieldEntity.DEAL,
		label: "Recommended offer",
		type: FieldType.LONG_TEXT,
		position: 230,
	},
	{
		name: "nextInput",
		entity: FieldEntity.DEAL,
		label: "Minimum next input",
		type: FieldType.LONG_TEXT,
		position: 231,
	},
	{
		name: "rights",
		entity: FieldEntity.DEAL,
		label: "Rights status",
		type: FieldType.LONG_TEXT,
		position: 232,
	},
	{
		name: "duplicateGroup",
		entity: FieldEntity.DEAL,
		label: "Duplicate group",
		type: FieldType.TEXT,
		position: 233,
	},
	{
		name: "dedupe",
		entity: FieldEntity.DEAL,
		label: "Dedupe evidence",
		type: FieldType.LONG_TEXT,
		position: 234,
	},
	{
		name: "gap",
		entity: FieldEntity.DEAL,
		label: "Unresolved gap",
		type: FieldType.LONG_TEXT,
		position: 235,
	},
	{
		name: "seaView",
		entity: FieldEntity.DEAL,
		label: "Sea view",
		type: FieldType.CHECKBOX,
		position: 236,
		showOnFilter: true,
	},
	{
		name: "waterfront",
		entity: FieldEntity.DEAL,
		label: "Waterfront",
		type: FieldType.CHECKBOX,
		position: 237,
		showOnFilter: true,
	},
	{
		name: "status",
		entity: FieldEntity.DEAL,
		label: "Prospecting status",
		type: FieldType.SELECT,
		position: 238,
		options: ["Prepare product proof", "Contact route to verify", "Nurture"],
		showOnTable: true,
		showOnFilter: true,
	},
	{
		name: "reason",
		entity: FieldEntity.DEAL,
		label: "Lead priority reason",
		type: FieldType.LONG_TEXT,
		position: 239,
	},
	{
		name: "canonicalUrl",
		entity: FieldEntity.DEAL,
		label: "Canonical property URL",
		type: FieldType.URL,
		position: 240,
		showOnTable: true,
	},
	{
		name: "relatedUrls",
		entity: FieldEntity.DEAL,
		label: "Related operator or class URLs",
		type: FieldType.LONG_TEXT,
		position: 241,
	},
	{
		name: "linkValidation",
		entity: FieldEntity.DEAL,
		label: "Link validation",
		type: FieldType.LONG_TEXT,
		position: 242,
	},
	{
		name: "sourceScope",
		entity: FieldEntity.DEAL,
		label: "Geographic source scope",
		type: FieldType.SELECT,
		position: 243,
		options: ["strict_cala_rossa", "benedettu_linked"],
		showOnFilter: true,
	},
	{
		name: "waterfrontClassification",
		entity: FieldEntity.DEAL,
		label: "Waterfront classification",
		type: FieldType.SELECT,
		position: 244,
		options: ["confirmed_non_waterfront", "waterfront_not_advertised"],
		showOnTable: true,
		showOnFilter: true,
	},
	{
		name: "waterfrontEvidence",
		entity: FieldEntity.DEAL,
		label: "Waterfront evidence",
		type: FieldType.LONG_TEXT,
		position: 245,
	},
	{
		name: "poolClaim",
		entity: FieldEntity.DEAL,
		label: "Pool claim",
		type: FieldType.TEXT,
		position: 246,
	},
	{
		name: "beachDistance",
		entity: FieldEntity.DEAL,
		label: "Beach distance or access",
		type: FieldType.LONG_TEXT,
		position: 247,
	},
	{
		name: "capacity",
		entity: FieldEntity.DEAL,
		label: "Person capacity",
		type: FieldType.TEXT,
		position: 248,
	},
	{
		name: "bedrooms",
		entity: FieldEntity.DEAL,
		label: "Bedrooms",
		type: FieldType.TEXT,
		position: 249,
	},
	{
		name: "beds",
		entity: FieldEntity.DEAL,
		label: "Beds",
		type: FieldType.TEXT,
		position: 250,
	},
	{
		name: "bathrooms",
		entity: FieldEntity.DEAL,
		label: "Bathrooms",
		type: FieldType.TEXT,
		position: 251,
	},
	{
		name: "propertyType",
		entity: FieldEntity.DEAL,
		label: "Property type",
		type: FieldType.TEXT,
		position: 252,
	},
	{
		name: "rating",
		entity: FieldEntity.DEAL,
		label: "Public rating",
		type: FieldType.TEXT,
		position: 253,
	},
	{
		name: "reviewCount",
		entity: FieldEntity.DEAL,
		label: "Public review count",
		type: FieldType.TEXT,
		position: 254,
	},
	{
		name: "mediaGrade",
		entity: FieldEntity.DEAL,
		label: "Media grade",
		type: FieldType.SELECT,
		position: 255,
		options: ["A", "B", "C", "D"],
		showOnTable: true,
		showOnFilter: true,
	},
	{
		name: "productionReadiness",
		entity: FieldEntity.DEAL,
		label: "Production readiness",
		type: FieldType.LONG_TEXT,
		position: 256,
	},
	{
		name: "scopeDecision",
		entity: FieldEntity.DEAL,
		label: "Scope decision",
		type: FieldType.SELECT,
		position: 257,
		options: [
			"eligible_confirmed_non_waterfront",
			"eligible_provisional_no_waterfront_claim",
			"inventory_class_select_exact_unit",
		],
		showOnTable: true,
		showOnFilter: true,
	},
	{
		name: "contentValidation",
		entity: FieldEntity.DEAL,
		label: "Content validation",
		type: FieldType.LONG_TEXT,
		position: 258,
	},
	{
		name: "dataConfidence",
		entity: FieldEntity.DEAL,
		label: "Data confidence",
		type: FieldType.SELECT,
		position: 259,
		options: ["High", "Medium", "Low"],
		showOnFilter: true,
	},
	{
		name: "priceMin",
		entity: FieldEntity.DEAL,
		label: "Rental price minimum EUR",
		type: FieldType.NUMBER,
		position: 260,
	},
	{
		name: "priceMax",
		entity: FieldEntity.DEAL,
		label: "Rental price maximum EUR",
		type: FieldType.NUMBER,
		position: 261,
	},
	{
		name: "premiumFilmCapability",
		entity: FieldEntity.DEAL,
		label: "Premium film capability",
		type: FieldType.LONG_TEXT,
		position: 262,
	},
	{
		name: "factual3dCapability",
		entity: FieldEntity.DEAL,
		label: "Factual 3D capability",
		type: FieldType.LONG_TEXT,
		position: 263,
	},
	{
		name: "requiredProductionInput",
		entity: FieldEntity.DEAL,
		label: "Required production input",
		type: FieldType.LONG_TEXT,
		position: 264,
	},
];

function dealProspectingStatus(row: CsvRow): string {
	if (row.scope_decision === "inventory_class_select_exact_unit")
		return "Contact route to verify";
	if (row.lead_priority_tier === "P1" || row.lead_priority_tier === "P2")
		return "Prepare product proof";
	if (row.lead_priority_tier === "P3") return "Contact route to verify";
	return "Nurture";
}

async function main(): Promise<void> {
	const sourceDir = process.argv[2];
	if (!sourceDir)
		throw new Error("Pass the non-waterfront enrichment source directory.");
	const accountPath = join(sourceDir, "account-ranking-2026-09-06.csv");
	const opportunityPath = join(
		sourceDir,
		"non-waterfront-villas-2026-09-06.csv",
	);
	const accounts = readCsv(accountPath, [
		"rank",
		"target_account",
		"account_priority_score",
		"tier",
		"eligible_exact_villa_records",
		"inventory_class_records",
		"best_property",
		"best_property_url",
		"best_property_price",
		"best_property_media_grade",
		"existing_exact_video_or_3d",
		"public_contact_route",
		"recommended_offer",
		"first_blocker",
	]);
	const opportunities = readCsv(opportunityPath, [
		"rank",
		"record_id",
		"airbnb_listing_id",
		"entity_kind",
		"target_account",
		"property_name",
		"source_lane",
		"lead_priority_score",
		"lead_priority_tier",
		"exact_platform_count",
		"exact_platforms",
		"all_exact_property_urls",
		"canonical_url",
		"link_validation",
		"source_scope",
		"waterfront_classification",
		"waterfront_evidence",
		"pool_claim",
		"beach_distance_or_access",
		"sea_view",
		"related_operator_or_class_urls",
		"person_capacity",
		"bedrooms",
		"beds",
		"bathrooms",
		"property_type",
		"rating",
		"review_count",
		"rental_price",
		"rental_price_min_eur",
		"rental_price_max_eur",
		"price_unit",
		"price_basis",
		"price_source_url",
		"price_confidence",
		"rental_value_weekly_equivalent_eur",
		"visible_image_count",
		"hq_landscape_count",
		"fourk_landscape_count",
		"visible_media_delivery",
		"scene_coverage",
		"existing_video",
		"video_scope",
		"existing_3d",
		"tour_3d_scope",
		"media_grade",
		"production_readiness",
		"premium_film_capability",
		"factual_3d_capability",
		"required_production_input",
		"scope_decision",
		"content_validation",
		"rights_status",
		"duplicate_group",
		"dedupe_confidence",
		"unresolved_gap",
		"data_confidence",
	]).filter((row) => QUALIFIED_SCOPE_DECISIONS.has(row.scope_decision));
	validateCounts(accounts, opportunities);

	await db.user.upsert({
		where: { id: OWNER_ID },
		create: {
			id: OWNER_ID,
			name: "Cala Rossa local operator",
			email: OWNER_EMAIL,
			emailVerified: true,
		},
		update: {
			name: "Cala Rossa local operator",
			email: OWNER_EMAIL,
			emailVerified: true,
		},
	});
	await db.organization.upsert({
		where: { id: WORKSPACE_ID },
		create: {
			id: WORKSPACE_ID,
			name: BUSINESS_NAME,
			slug: workspaceSlug(BUSINESS_NAME),
			website: BUSINESS_WEBSITE,
			metadata: JSON.stringify({ onboardedAt: AUDITED_AT.toISOString() }),
			createdAt: AUDITED_AT,
		},
		update: {
			name: BUSINESS_NAME,
			slug: workspaceSlug(BUSINESS_NAME),
			website: BUSINESS_WEBSITE,
			metadata: JSON.stringify({ onboardedAt: AUDITED_AT.toISOString() }),
		},
	});
	await db.member.upsert({
		where: {
			organizationId_userId: { organizationId: WORKSPACE_ID, userId: OWNER_ID },
		},
		create: {
			id: "cala-rossa-local-member",
			organizationId: WORKSPACE_ID,
			userId: OWNER_ID,
			role: "owner",
			createdAt: AUDITED_AT,
		},
		update: { role: "owner" },
	});
	await db.workspaceProfile.upsert({
		where: { id: WORKSPACE_ID },
		create: {
			id: WORKSPACE_ID,
			website: BUSINESS_WEBSITE,
			narrative:
				"Premium villa marketing for Cala Rossa. Each lead combines rental value, public media evidence and a human-gated product-proof workflow.",
			sections: {
				sells:
					"A premium villa film, a factual captured 3D experience and a direct rental journey.",
				sellsTo:
					"Luxury rental agencies, concierge operators and verified villa owners in Cala Rossa.",
				edge: "A private proof uses verified media. Every publication and outreach action needs human approval.",
			},
			sourceUrl: SOURCE_AUDIT,
			refreshedAt: AUDITED_AT,
		},
		update: {
			website: BUSINESS_WEBSITE,
			narrative:
				"Premium villa marketing for Cala Rossa. Each lead combines rental value, public media evidence and a human-gated product-proof workflow.",
			sections: {
				sells:
					"A premium villa film, a factual captured 3D experience and a direct rental journey.",
				sellsTo:
					"Luxury rental agencies, concierge operators and verified villa owners in Cala Rossa.",
				edge: "A private proof uses verified media. Every publication and outreach action needs human approval.",
			},
			sourceUrl: SOURCE_AUDIT,
			refreshedAt: AUDITED_AT,
		},
	});
	await db.appSetting.upsert({
		where: { id: SETTINGS_ID },
		create: { id: SETTINGS_ID, reportingCurrency: "EUR" },
		update: { reportingCurrency: "EUR" },
	});

	const companyFields = await ensureFields(companyFieldSpecs);
	const dealFields = await ensureFields(dealFieldSpecs);
	const opportunitiesByAccount = new Map<string, CsvRow[]>();
	const dealIds = new Set<string>();
	for (const opportunity of opportunities) {
		const rows = opportunitiesByAccount.get(opportunity.target_account) ?? [];
		rows.push(opportunity);
		opportunitiesByAccount.set(opportunity.target_account, rows);
	}
	const companyIds = new Map<string, string>();

	for (const account of accounts) {
		const companyId = `carla-account-${slug(account.target_account)}`;
		const accountOpportunities =
			opportunitiesByAccount.get(account.target_account) ?? [];
		const website = account.public_contact_route || null;
		const platforms = [
			...new Set(
				accountOpportunities.flatMap((row) =>
					row.exact_platforms.split(" | ").filter(Boolean),
				),
			),
		].join(" | ");
		await db.company.upsert({
			where: { id: companyId },
			create: {
				id: companyId,
				name: account.target_account,
				domain: routeDomain(website),
				website,
				description: `Qualified Cala Rossa media prospect. Account rank ${account.rank}. No outreach sent. This record does not prove buying intent.`,
				industry: "Luxury vacation rental",
				city: "Lecci / Porto-Vecchio",
				stateCode: "2A",
				country: "France",
				countryCode: "FR",
				ownerId: OWNER_ID,
				enrichmentStatus: EnrichmentStatus.SKIPPED,
				source: RecordSource.IMPORT,
			},
			update: {
				name: account.target_account,
				domain: routeDomain(website),
				website,
				description: `Qualified Cala Rossa media prospect. Account rank ${account.rank}. No outreach sent. This record does not prove buying intent.`,
				industry: "Luxury vacation rental",
				city: "Lecci / Porto-Vecchio",
				stateCode: "2A",
				country: "France",
				countryCode: "FR",
				ownerId: OWNER_ID,
				enrichmentStatus: EnrichmentStatus.SKIPPED,
				archivedAt: null,
			},
		});
		companyIds.set(account.target_account, companyId);
		const nextAction = `${account.recommended_offer} ${account.first_blocker}`;
		const values: Array<[string, string | number | boolean | null]> = [
			["rank", numeric(account.rank)],
			["score", numeric(account.account_priority_score)],
			["tier", account.tier],
			[
				"properties",
				Number(account.eligible_exact_villa_records) +
					Number(account.inventory_class_records),
			],
			["pilot", account.best_property],
			["price", account.best_property_price],
			[
				"media",
				`Grade ${account.best_property_media_grade}. Existing exact video or 3D: ${account.existing_exact_video_or_3d}.`,
			],
			["platforms", platforms],
			["route", account.public_contact_route],
			["routeStatus", accountRouteStatus(account, accountOpportunities)],
			["lane", prospectingLane(account)],
			["outreach", "Not contacted"],
			["decisionMaker", "Unknown"],
			["sourceLane", accountSourceLane(accountOpportunities)],
			["nextAction", nextAction],
			["audit", SOURCE_AUDIT],
		];
		for (const [name, value] of values) {
			const field = companyFields.get(name);
			if (!field) throw new Error(`Company field ${name} is missing.`);
			await setCompanyField(field, companyId, value);
		}
	}

	for (const opportunity of opportunities) {
		const companyId = companyIds.get(opportunity.target_account);
		if (!companyId)
			throw new Error(
				`Company ${opportunity.target_account} was not imported.`,
			);
		const dealId = `carla-deal-${slug(opportunity.record_id)}`;
		dealIds.add(dealId);
		await db.deal.upsert({
			where: { id: dealId },
			create: {
				id: dealId,
				name: opportunity.property_name,
				description: `Qualified media opportunity. No outreach sent. Rental price is not the service deal value. ${opportunity.waterfront_evidence}`,
				companyId,
				ownerId: OWNER_ID,
				stage: DealStage.QUALIFIED_TO_BUY,
				stageChangedAt: AUDITED_AT,
				currency: "EUR",
			},
			update: {
				name: opportunity.property_name,
				description: `Qualified media opportunity. No outreach sent. Rental price is not the service deal value. ${opportunity.waterfront_evidence}`,
				companyId,
				ownerId: OWNER_ID,
				currency: "EUR",
				archivedAt: null,
			},
		});
		const values: Array<[string, string | number | boolean | null]> = [
			["rank", numeric(opportunity.rank)],
			["recordId", opportunity.record_id],
			["sourceLane", opportunity.source_lane],
			["airbnbMember", Boolean(opportunity.airbnb_listing_id)],
			["entityKind", opportunity.entity_kind],
			["score", numeric(opportunity.lead_priority_score)],
			["tier", opportunity.lead_priority_tier],
			["platformCount", numeric(opportunity.exact_platform_count)],
			["platforms", opportunity.exact_platforms],
			["platformEvidence", opportunity.link_validation],
			["sourceUrls", opportunity.all_exact_property_urls],
			["rentalPrice", opportunity.rental_price],
			["priceUnit", opportunity.price_unit],
			["priceBasis", opportunity.price_basis],
			["priceSource", opportunity.price_source_url],
			["priceConfidence", opportunity.price_confidence],
			["weeklyRental", numeric(opportunity.rental_value_weekly_equivalent_eur)],
			["images", numeric(opportunity.visible_image_count)],
			["hqImages", opportunity.hq_landscape_count],
			["fourkImages", opportunity.fourk_landscape_count],
			["mediaDelivery", opportunity.visible_media_delivery],
			["sceneCoverage", opportunity.scene_coverage],
			["video", opportunity.existing_video],
			["videoScope", opportunity.video_scope],
			["existing3d", opportunity.existing_3d],
			["existing3dScope", opportunity.tour_3d_scope],
			["offer", opportunity.production_readiness],
			["nextInput", opportunity.unresolved_gap],
			["rights", opportunity.rights_status],
			["duplicateGroup", opportunity.duplicate_group],
			["dedupe", opportunity.dedupe_confidence],
			["gap", opportunity.unresolved_gap],
			["seaView", truth(opportunity.sea_view)],
			[
				"waterfront",
				opportunity.waterfront_classification ===
					"confirmed_waterfront_excluded",
			],
			["status", dealProspectingStatus(opportunity)],
			[
				"reason",
				`${opportunity.waterfront_evidence} ${opportunity.production_readiness}`,
			],
			["canonicalUrl", opportunity.canonical_url],
			["relatedUrls", opportunity.related_operator_or_class_urls],
			["linkValidation", opportunity.link_validation],
			["sourceScope", opportunity.source_scope],
			["waterfrontClassification", opportunity.waterfront_classification],
			["waterfrontEvidence", opportunity.waterfront_evidence],
			["poolClaim", opportunity.pool_claim],
			["beachDistance", opportunity.beach_distance_or_access],
			["capacity", opportunity.person_capacity],
			["bedrooms", opportunity.bedrooms],
			["beds", opportunity.beds],
			["bathrooms", opportunity.bathrooms],
			["propertyType", opportunity.property_type],
			["rating", opportunity.rating],
			["reviewCount", opportunity.review_count],
			["mediaGrade", opportunity.media_grade],
			["productionReadiness", opportunity.production_readiness],
			["premiumFilmCapability", opportunity.premium_film_capability],
			["factual3dCapability", opportunity.factual_3d_capability],
			["requiredProductionInput", opportunity.required_production_input],
			["scopeDecision", opportunity.scope_decision],
			["contentValidation", opportunity.content_validation],
			["dataConfidence", opportunity.data_confidence],
			["priceMin", numeric(opportunity.rental_price_min_eur)],
			["priceMax", numeric(opportunity.rental_price_max_eur)],
		];
		for (const [name, value] of values) {
			const field = dealFields.get(name);
			if (!field) throw new Error(`Deal field ${name} is missing.`);
			await setDealField(field, dealId, value);
		}
	}

	const taskIds = new Set<string>();
	for (const account of accounts) {
		const companyId = companyIds.get(account.target_account);
		if (!companyId)
			throw new Error(`Company ${account.target_account} was not imported.`);
		const accountOpportunities =
			opportunitiesByAccount.get(account.target_account) ?? [];
		const bestOpportunity = [...accountOpportunities].sort(
			(a, b) =>
				Number(b.lead_priority_score) - Number(a.lead_priority_score) ||
				Number(a.rank) - Number(b.rank),
		)[0];
		if (!bestOpportunity)
			throw new Error(`No opportunity exists for ${account.target_account}.`);
		const bestDealId = `carla-deal-${slug(bestOpportunity.record_id)}`;
		const taskId = `carla-task-${slug(account.target_account)}`;
		taskIds.add(taskId);
		const rank = Number(account.rank);
		const dueAt = new Date(
			AUDITED_AT.getTime() + rank * 24 * 60 * 60 * 1000 + 9 * 60 * 60 * 1000,
		);
		await db.activity.upsert({
			where: { id: taskId },
			create: {
				id: taskId,
				type: ActivityType.TASK,
				subject: `Préparer le produit d'appel privé: ${account.best_property}`,
				body: "1. Verify the exact decision-maker route. 2. Recheck rental price and fees. 3. Request written media authorization and originals. 4. Build a private watermarked 20-second proof. 5. Approve the recipient and message before any send.",
				dueAt,
				companyId,
				dealId: bestDealId,
				createdById: OWNER_ID,
				meta: {
					process: "cala-rossa-product-proof-v2",
					accountRank: rank,
					requiresHumanApproval: true,
					prohibitedAutomation: [
						"send",
						"paid-enrichment",
						"personal-contact-access",
					],
				},
				createdAt: AUDITED_AT,
			},
			update: {
				subject: `Préparer le produit d'appel privé: ${account.best_property}`,
				body: "1. Verify the exact decision-maker route. 2. Recheck rental price and fees. 3. Request written media authorization and originals. 4. Build a private watermarked 20-second proof. 5. Approve the recipient and message before any send.",
				dueAt,
				companyId,
				dealId: bestDealId,
				meta: {
					process: "cala-rossa-product-proof-v2",
					accountRank: rank,
					requiresHumanApproval: true,
					prohibitedAutomation: [
						"send",
						"paid-enrichment",
						"personal-contact-access",
					],
				},
			},
		});
	}

	await db.deal.updateMany({
		where: {
			id: { startsWith: "carla-deal-", notIn: [...dealIds] },
			archivedAt: null,
		},
		data: { archivedAt: AUDITED_AT },
	});
	await db.company.updateMany({
		where: {
			id: { startsWith: "carla-account-", notIn: [...companyIds.values()] },
			archivedAt: null,
		},
		data: { archivedAt: AUDITED_AT },
	});
	await db.activity.updateMany({
		where: {
			id: { startsWith: "carla-task-", notIn: [...taskIds] },
			completedAt: null,
		},
		data: { completedAt: AUDITED_AT },
	});

	console.log(
		JSON.stringify(
			{
				workspace: BUSINESS_NAME,
				companies: accounts.length,
				deals: opportunities.length,
				contacts: 0,
				preparationTasks: accounts.length,
				agentTasks: 0,
			},
			null,
			2,
		),
	);
}

try {
	await main();
} finally {
	await db.$disconnect();
}
