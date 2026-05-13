import { mkdir, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

import { stringify } from "../model/json.ts";
import type { JSONSchema, Taxonomy } from "../model/types.ts";

const HOST = "https://maincloud.spacetimedb.com";
const DB = "lexxtract";
const OUT = "pulled_modules";
const KEYS = ["taxonomy", "extraction"] as const;

const ITEM_SCHEMA: JSONSchema = {
  $schema: "https://json-schema.org/draft/2019-09/schema",
  $id: "https://enterprisetransformationcircle.com/lexXtract/generated/item.schema.json",
  title: "item",
  description: "Generated extraction item schema.",
  type: "object",
  properties: {
    id: { type: "string", pattern: "^[A-Z0-9]{8}$" },
    parent_id: { type: ["string", "null"] },
    name: { type: "string" },
    depiction: { type: "string" },
    content: { type: "string" },
    taxonomy: {
      type: "object",
      properties: {
        category: { type: "string" },
        subcategory: { type: "string" },
      },
      required: ["category", "subcategory"],
      additionalProperties: false,
    },
    source: { type: "array", items: { type: "object" } },
    created_at: { type: "string", format: "date-time" },
    modified_at: { type: "string", format: "date-time" },
    created_by: {
      type: "object",
      properties: { name: { type: "string" }, job_id: { type: "string" }, schema_id: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    },
    modified_by: {
      type: "object",
      properties: { name: { type: "string" }, job_id: { type: "string" }, schema_id: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    },
    sort_order: { type: ["integer", "null"] },
    links: { type: "array", items: { type: "object" } },
  },
  required: ["id", "name", "depiction", "content", "taxonomy", "created_at", "created_by"],
  additionalProperties: true,
};

type StorageRow = [string, string] | { owner_key: string; value: string };
type ExportFile = { path: string; content: string };
type PullOptions = { outputRoot?: string; host?: string; database?: string };
type BuildOptions = PullOptions & { pulledAt?: string };
type PulledExtraction = Record<string, Record<string, Record<string, { depiction?: string; content?: string }>>>;

const safe = (value: string) => value.replaceAll(/[^a-zA-Z0-9._-]+/g, "_");
const mkId = (value: string) => safe(value).toLowerCase();
const ownerPrefix = (owner: string, name: string) => `${owner.replaceAll(":", "_:")}:${name}:`;

const itemId = (categoryName: string, subcategoryName: string, itemTitle: string) => {
  let hash = 2166136261;
  for (const char of `${categoryName}\0${subcategoryName}\0${itemTitle}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36).toUpperCase().padStart(8, "0").slice(-8);
};

const asEntry = (row: StorageRow, prefix: string) => {
  const [dbKey, raw] = Array.isArray(row) ? row : [row.owner_key, row.value];
  const suffix = String(dbKey).slice(prefix.length);
  return {
    suffix,
    raw: String(raw),
    value: (() => {
      try {
        return JSON.parse(String(raw));
      } catch {
        return String(raw);
      }
    })(),
  };
};

const toTaxonomyFile = (name: string, taxonomy: Taxonomy) => ({
  taxonomy: {
    title: name,
    version: "",
    description: "",
    categories: Object.entries(taxonomy.categories ?? {}).map(([categoryName, category]) => ({
      id: mkId(categoryName),
      name: categoryName,
      description: category?.description || "",
      subcategories: Object.entries(category?.subCategories ?? {}).map(([subcategoryName, subcategory]) => ({
        id: mkId(`${categoryName}_${subcategoryName}`),
        name: subcategoryName,
        description: subcategory?.description || "",
        schema: ITEM_SCHEMA,
      })),
    })),
  },
});

export const queryFor = (owner: string, name: string) => {
  const prefix = ownerPrefix(owner, name);
  return `select * from storage where owner_key >= '${prefix}' and owner_key < '${prefix.slice(0, -1)};'`;
};

export const buildExportPlan = (
  owner: string,
  name: string,
  rows: StorageRow[],
  { outputRoot = OUT, pulledAt = new Date().toISOString() }: BuildOptions = {},
) => {
  const moduleDir = `${outputRoot}/${safe(owner)}/${safe(name)}/en`;
  const files: ExportFile[] = [];
  const prefix = ownerPrefix(owner, name);
  const picked = Object.fromEntries(KEYS.map((key) => [key, null])) as Record<(typeof KEYS)[number], ReturnType<typeof asEntry> | null>;
  const add = (path: string, content: object | string) =>
    files.push({ path: `${moduleDir}/${path}`, content: typeof content === "string" ? content : `${stringify(content as never)}\n` });

  for (const row of rows) {
    const entry = asEntry(row, prefix);
    const key = KEYS.find((candidate) => entry.suffix.startsWith(candidate));
    if (key && (!picked[key] || entry.raw.length >= picked[key]!.raw.length)) picked[key] = entry;
  }

  if (picked.taxonomy?.value && typeof picked.taxonomy.value === "object" && !Array.isArray(picked.taxonomy.value)) {
    add("taxonomy.json", toTaxonomyFile(name, picked.taxonomy.value as Taxonomy));
  }

  if (picked.extraction?.value && typeof picked.extraction.value === "object" && !Array.isArray(picked.extraction.value)) {
    for (const [categoryName, category] of Object.entries(picked.extraction.value as PulledExtraction)) {
      if (!category || typeof category !== "object") continue;
      for (const [subcategoryName, subcategory] of Object.entries(category)) {
        if (!subcategory || typeof subcategory !== "object") continue;
        const used = new Set<string>();
        for (const [itemTitle, item] of Object.entries(subcategory)) {
          let file = `${safe(itemTitle) || "item"}.json`;
          for (let n = 2; used.has(file); n++) file = `${safe(itemTitle) || "item"}_${n}.json`;
          used.add(file);
          add(`data/${mkId(categoryName)}/${mkId(`${categoryName}_${subcategoryName}`)}/${file}`, {
            id: itemId(categoryName, subcategoryName, itemTitle),
            parent_id: null,
            name: itemTitle,
            depiction: item?.depiction || "",
            content: item?.content || "",
            taxonomy: {
              category: mkId(categoryName),
              subcategory: mkId(`${categoryName}_${subcategoryName}`),
            },
            source: [],
            created_at: pulledAt,
            modified_at: pulledAt,
            created_by: { name: "lexXtract pull_module", schema_id: "Item" },
            modified_by: { name: "lexXtract pull_module", schema_id: "Item" },
            sort_order: null,
            links: [],
          });
        }
      }
    }
  }

  return { moduleDir, files };
};

export const pullModule = async (owner: string, name: string, { outputRoot = OUT, host = HOST, database = DB }: PullOptions = {}) => {
  const response = await fetch(`${host}/v1/database/${database}/sql`, { method: "POST", body: queryFor(owner, name) });
  if (!response.ok) throw new Error(`SQL request failed with ${response.status} ${response.statusText}`);
  const rows = (await response.json())?.[0]?.rows;
  if (!Array.isArray(rows)) throw new Error("Unexpected SQL response");

  const plan = buildExportPlan(owner, name, rows, { outputRoot });
  const dirs = new Set([plan.moduleDir, ...plan.files.map((file) => file.path.split("/").slice(0, -1).join("/"))]);
  for (const dir of dirs) await mkdir(dir, { recursive: true });
  for (const file of plan.files) await writeFile(file.path, file.content);
  return plan;
};

if (import.meta.url === pathToFileURL(process.argv[1]!).href) {
  const [owner, name, outputRoot = OUT, host = HOST, database = DB] = process.argv.slice(2);
  if (!owner || !name) {
    console.error("Usage: node scripts/pull_module.js <owner> <module_name> [output_dir] [host] [database]");
    process.exitCode = 1;
  } else {
    const plan = await pullModule(owner, name, { outputRoot, host, database });
    console.log(`Pulled ${owner}/${name} into ${plan.moduleDir}`);
  }
}
