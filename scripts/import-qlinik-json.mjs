#!/usr/bin/env node

import { readFileSync, existsSync } from "node:fs";
import { basename, resolve } from "node:path";

const VALID_DISCIPLINES = new Set(["tip", "dis", "hemsirelik", "ftr", "veteriner"]);

function usage() {
  console.log(`Usage:
  npm run import:qlinik -- --discipline ftr --file ./ftr.json --dry-run
  npm run import:qlinik -- --discipline veteriner --file ./veteriner.json

Options:
  --discipline <tip|dis|hemsirelik|ftr|veteriner>  Required
  --file <path>                                    Required
  --active                                         Insert as active instead of draft
  --dry-run                                        Validate only, do not write
  --batch-size <n>                                 Default: 100`);
}

function parseArgs(argv) {
  const args = {
    active: false,
    dryRun: false,
    batchSize: 100,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--active") args.active = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--discipline") args.discipline = argv[++i];
    else if (arg === "--file") args.file = argv[++i];
    else if (arg === "--batch-size") args.batchSize = Number(argv[++i]);
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

function parseRows(text) {
  let value = text.trim();
  if (value.startsWith("```")) {
    value = value
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
  }
  const parsed = JSON.parse(value);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && typeof parsed === "object") {
    for (const key of ["questions", "items", "data", "rows", "results", "records"]) {
      if (Array.isArray(parsed[key])) return parsed[key];
    }
    return [parsed];
  }
  throw new Error("JSON must be an array, object, or wrapper with questions/items/data/rows.");
}

function textValue(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function stringArray(value) {
  return Array.isArray(value)
    ? value.map((item) => textValue(item)).filter((item) => item.length > 0)
    : [];
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function numberValue(value) {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }
  return null;
}

function normalizeRow(input, discipline, sourceFileName, active) {
  const metadataIn = objectValue(input.metadata);
  const metadata = {
    ...metadataIn,
    subtopic: textValue(input.subtopic) || textValue(metadataIn.subtopic),
    question_type: textValue(metadataIn.question_type),
    cognitive_level: textValue(metadataIn.cognitive_level) || "application",
    confidence: textValue(metadataIn.confidence) || "high",
    source: textValue(metadataIn.source) || "json_import",
    discipline,
  };

  const tags = new Set(stringArray(input.tags).filter((tag) => !tag.startsWith("discipline:")));
  tags.add("app:qlinik");
  tags.add(`discipline:${discipline}`);

  return {
    subject: textValue(input.subject),
    topic: textValue(input.topic),
    difficulty: ["easy", "medium", "hard"].includes(textValue(input.difficulty).toLowerCase())
      ? textValue(input.difficulty).toLowerCase()
      : "medium",
    text: textValue(input.text),
    options: stringArray(input.options),
    correct_index: numberValue(input.correct_index),
    explanation: textValue(input.explanation),
    option_rationales: stringArray(input.option_rationales),
    tags: Array.from(tags),
    metadata,
    is_active: active,
    is_user_generated: false,
    source_file_id: textValue(input.source_file_id) || "json_import",
    source_file_name: textValue(input.source_file_name) || sourceFileName,
    access_disciplines: [discipline],
  };
}

function validateRow(row) {
  const issues = [];
  if (!row.subject) issues.push("subject empty");
  if (!row.topic) issues.push("topic empty");
  if (!row.text) issues.push("text empty");
  if (row.options.length !== 5) issues.push(`options must have 5 items (${row.options.length})`);
  if (row.correct_index === null) issues.push("correct_index missing");
  else if (row.correct_index < 0 || row.correct_index > 4) {
    issues.push(`correct_index out of range (${row.correct_index})`);
  }
  if (!row.explanation) issues.push("explanation empty");
  if (row.option_rationales.length !== 5) {
    issues.push(`option_rationales must have 5 items (${row.option_rationales.length})`);
  }
  return issues;
}

async function postBatch(url, serviceKey, rows) {
  const response = await fetch(`${url}/rest/v1/questions`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      "Content-Profile": "public",
      Prefer: "return=representation",
    },
    body: JSON.stringify(rows),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }
  return response.json();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    return;
  }
  if (!args.discipline || !VALID_DISCIPLINES.has(args.discipline)) {
    throw new Error(
      "--discipline is required and must be one of: " + [...VALID_DISCIPLINES].join(", "),
    );
  }
  if (!args.file) throw new Error("--file is required.");
  if (!Number.isInteger(args.batchSize) || args.batchSize < 1 || args.batchSize > 1000) {
    throw new Error("--batch-size must be an integer between 1 and 1000.");
  }

  loadEnv();
  const url = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing.");

  const filePath = resolve(process.cwd(), args.file);
  const sourceFileName = basename(filePath);
  const rows = parseRows(readFileSync(filePath, "utf8"));
  const normalized = rows.map((row) =>
    normalizeRow(objectValue(row), args.discipline, sourceFileName, args.active),
  );
  const errors = normalized
    .map((row, index) => ({ index, issues: validateRow(row) }))
    .filter((item) => item.issues.length > 0);

  console.log(`Parsed: ${rows.length}`);
  console.log(`Valid: ${normalized.length - errors.length}`);
  console.log(`Invalid: ${errors.length}`);
  console.log(`Discipline: ${args.discipline}`);
  console.log(`is_active: ${args.active ? "true" : "false"}`);

  if (errors.length > 0) {
    for (const error of errors.slice(0, 20)) {
      console.log(`#${error.index + 1}: ${error.issues.join(", ")}`);
    }
    throw new Error("Validation failed. Fix invalid rows before import.");
  }

  if (args.dryRun) {
    console.log("Dry run complete. No rows inserted.");
    return;
  }

  let inserted = 0;
  for (let i = 0; i < normalized.length; i += args.batchSize) {
    const batch = normalized.slice(i, i + args.batchSize);
    await postBatch(url, serviceKey, batch);
    inserted += batch.length;
    console.log(`Inserted ${inserted}/${normalized.length}`);
  }
  console.log(`Done. Inserted ${inserted} rows into public.questions.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
