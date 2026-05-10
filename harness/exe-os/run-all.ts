#!/usr/bin/env tsx
/**
 * Sequential memory benchmark launcher.
 *
 * Safe modes:
 *   npx tsx harness/exe-os/run-all.ts --list
 *   npx tsx harness/exe-os/run-all.ts --only locomo --fts
 *   npx tsx harness/exe-os/run-all.ts --only longmemeval --fts
 *   npx tsx harness/exe-os/run-all.ts --only locomo,longmemeval --fts
 *
 * By default this still runs sequentially, never in parallel. Prefer --only on
 * developer laptops to avoid memory pressure.
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");

type BenchmarkId =
  | "locomo"
  | "longmemeval"
  | "membench"
  | "memoryagentbench"
  | "memoryarena"
  | "realtalk"
  | "storybench"
  | "beam";

interface BenchmarkSpec {
  id: BenchmarkId;
  name: string;
  envVar: string;
  defaultPath: string;
  command?: string[];
  setupHint?: string;
}

const specs: BenchmarkSpec[] = [
  {
    id: "locomo",
    name: "LoCoMo",
    envVar: "LOCOMO_PATH",
    defaultPath: join(repoRoot, "data/locomo/locomo10.json"),
    command: ["npx", "tsx", "harness/exe-os/locomo/evaluate.ts"],
  },
  {
    id: "longmemeval",
    name: "LongMemEval",
    envVar: "LONGMEMEVAL_PATH",
    defaultPath: join(repoRoot, "data/longmemeval/longmemeval_s_cleaned.json"),
    command: ["npx", "tsx", "harness/exe-os/longmemeval.ts"],
  },
  {
    id: "membench",
    name: "MemBench",
    envVar: "MEMBENCH_PATH",
    defaultPath: join(homedir(), "Membench"),
    setupHint: "Clone https://github.com/import-myself/Membench and set MEMBENCH_PATH.",
  },
  {
    id: "memoryagentbench",
    name: "MemoryAgentBench",
    envVar: "MEMORYAGENTBENCH_PATH",
    defaultPath: join(homedir(), "MemoryAgentBench"),
    setupHint: "Clone https://github.com/HUST-AI-HYZ/MemoryAgentBench and set MEMORYAGENTBENCH_PATH.",
  },
  {
    id: "memoryarena",
    name: "MemoryArena",
    envVar: "MEMORYARENA_PATH",
    defaultPath: join(homedir(), "MemoryArena"),
    setupHint: "Download MemoryArena from https://memoryarena.github.io/ and set MEMORYARENA_PATH.",
  },
  {
    id: "realtalk",
    name: "REALTALK",
    envVar: "REALTALK_PATH",
    defaultPath: join(homedir(), "REALTALK"),
    setupHint: "Clone/download REALTALK and set REALTALK_PATH.",
  },
  {
    id: "storybench",
    name: "StoryBench",
    envVar: "STORYBENCH_PATH",
    defaultPath: join(homedir(), "StoryBench"),
    setupHint: "Download StoryBench and set STORYBENCH_PATH.",
  },
  {
    id: "beam",
    name: "BEAM",
    envVar: "BEAM_PATH",
    defaultPath: join(homedir(), "BEAM"),
    setupHint: "Download BEAM / Agent Memory Benchmark and set BEAM_PATH.",
  },
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

function selectedSpecs(): BenchmarkSpec[] {
  const only = arg("--only") ?? arg("--benchmark");
  if (!only) return specs;
  const wanted = new Set(only.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  return specs.filter((s) => wanted.has(s.id) || wanted.has(s.name.toLowerCase()));
}

if (process.argv.includes("--list")) {
  console.log("Available benchmarks:");
  for (const s of specs) console.log(`- ${s.id} (${s.name}) env=${s.envVar}`);
  process.exit(0);
}

const chosen = selectedSpecs();
if (chosen.length === 0) {
  console.error("No benchmark matched. Run: npx tsx harness/exe-os/run-all.ts --list");
  process.exit(1);
}

const extraArgs = ["--fts", "--json"].filter((flag) => process.argv.includes(flag));
const limit = arg("--limit");
if (limit) extraArgs.push("--limit", limit);

const results: Array<Record<string, unknown>> = [];

for (const spec of chosen) {
  const dataset = process.env[spec.envVar] ?? spec.defaultPath;
  console.log(`\n═══════════════════════════════════════════════════`);
  console.log(`Running ${spec.name} (${spec.id}) — sequential, not parallel`);
  console.log(`Dataset: ${dataset}`);
  console.log(`═══════════════════════════════════════════════════`);

  if (!existsSync(dataset)) {
    console.log(`SKIP: dataset missing. ${spec.setupHint ?? `Set ${spec.envVar}.`}`);
    results.push({ id: spec.id, name: spec.name, status: "missing_dataset", dataset });
    continue;
  }

  if (!spec.command) {
    console.log(`SKIP: adapter registered; runner implementation pending for local dataset shape. ${spec.setupHint ?? ""}`);
    results.push({ id: spec.id, name: spec.name, status: "adapter_pending", dataset });
    continue;
  }

  const [cmd, ...args] = [...spec.command, ...extraArgs];
  const started = Date.now();
  const child = spawnSync(cmd!, args, {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, VITEST: process.env.VITEST ?? "1" },
  });
  results.push({
    id: spec.id,
    name: spec.name,
    status: child.status === 0 ? "passed" : "failed",
    dataset,
    seconds: Number(((Date.now() - started) / 1000).toFixed(1)),
  });
  if (child.status !== 0 && !process.argv.includes("--continue")) break;
}

const outDir = join(repoRoot, "results/runs");
mkdirSync(outDir, { recursive: true });
const out = join(outDir, `sequential-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2));
console.log(`\nSaved summary: ${out}`);
