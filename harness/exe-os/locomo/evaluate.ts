/**
 * LoCoMo benchmark — evaluation harness.
 *
 * Runs LoCoMo QA queries through our hybrid search and scores results
 * against ground truth answers using exact match + token F1.
 *
 * Categories:
 *   1: Single-hop factoid
 *   2: Temporal reasoning
 *   3: Multi-hop reasoning
 *   4: Open-ended / world knowledge
 *   5: Adversarial (should answer "I don't know" or equivalent)
 *
 * Usage: npx tsx harness/exe-os/locomo/evaluate.ts [--db-path ./locomo-bench.db]
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { initStore, disposeStore } from "../../../../../exe-os/src/lib/store.js";
import { hybridSearch, lightweightSearch } from "../../../../../exe-os/src/lib/hybrid-search.js";

interface LoCoMoQA {
  question: string;
  answer?: string;
  adversarial_answer?: string;
  category: number;
  evidence?: string[];
}

interface LoCoMoConversation {
  sample_id: string;
  qa: LoCoMoQA[];
}

interface EvalResult {
  question: string;
  category: number;
  groundTruth: string;
  retrievedSnippets: string[];
  hit: boolean;  // ground truth found in retrieved context
  f1: number;    // token-level F1 between ground truth and best-matching snippet
}

interface BenchmarkReport {
  totalQuestions: number;
  hitRate: number;          // % of questions where answer found in retrieved context
  avgF1: number;            // average token F1 across all questions
  byCategory: Record<number, {
    count: number;
    hitRate: number;
    avgF1: number;
  }>;
  searchMode: string;
  topK: number;
  timestamp: string;
}

import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = process.env.LOCOMO_PATH ?? path.resolve(__dirname, "../../../data/locomo/locomo10.json");

// ---------------------------------------------------------------------------
// Token F1 (standard QA metric)
// ---------------------------------------------------------------------------

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

function tokenF1(prediction: string, groundTruth: string): number {
  const predTokens = tokenize(prediction);
  const truthTokens = tokenize(groundTruth);

  if (truthTokens.length === 0 || predTokens.length === 0) return 0;

  const truthSet = new Set(truthTokens);
  const predSet = new Set(predTokens);

  let overlap = 0;
  for (const t of predSet) {
    if (truthSet.has(t)) overlap++;
  }

  if (overlap === 0) return 0;

  const precision = overlap / predTokens.length;
  const recall = overlap / truthTokens.length;
  return (2 * precision * recall) / (precision + recall);
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export async function evaluate(opts: {
  dbPath: string;
  searchMode: "hybrid" | "fts";
  topK: number;
}): Promise<BenchmarkReport> {
  const { dbPath, searchMode, topK } = opts;
  const data: LoCoMoConversation[] = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));

  await initStore({
    dbPath,
    masterKey: crypto.createHash("sha256").update("locomo-benchmark-key").digest(),
    batchSize: 100,
    flushIntervalMs: 60_000,
    lightweight: true, // skip shard manager — benchmark uses a single test DB
  });

  const results: EvalResult[] = [];
  const searchFn = searchMode === "hybrid" ? hybridSearch : lightweightSearch;

  for (const conv of data) {
    const projectName = `locomo-${conv.sample_id}`;

    for (const qa of conv.qa) {
      const rawAnswer = qa.answer ?? qa.adversarial_answer ?? "";
      const groundTruth = String(rawAnswer);
      if (!groundTruth) continue;

      // Search both speakers' memories
      const searchPromises = ["speaker_a", "speaker_b"].map((agentId) =>
        searchFn(qa.question, agentId, {
          projectName,
          limit: topK,
        }),
      );

      const allResults = (await Promise.all(searchPromises)).flat();

      // Deduplicate by id
      const seen = new Set<string>();
      const unique = allResults.filter((r) => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });

      // Sort by position (already ranked by search)
      const snippets = unique.slice(0, topK).map((r) => r.raw_text);

      // Check if ground truth appears in any retrieved snippet
      const combinedContext = snippets.join(" ").toLowerCase();
      const truthLower = groundTruth.toLowerCase();
      const hit = combinedContext.includes(truthLower);

      // Token F1: best F1 across all snippets
      const f1 = Math.max(
        ...snippets.map((s) => tokenF1(s, groundTruth)),
        0,
      );

      results.push({
        question: qa.question,
        category: qa.category,
        groundTruth,
        retrievedSnippets: snippets.slice(0, 3), // keep top 3 for report
        hit,
        f1,
      });
    }
  }

  await disposeStore();

  // Aggregate metrics
  const totalHits = results.filter((r) => r.hit).length;
  const avgF1 = results.reduce((sum, r) => sum + r.f1, 0) / results.length;

  const byCategory: BenchmarkReport["byCategory"] = {};
  for (const cat of [1, 2, 3, 4, 5]) {
    const catResults = results.filter((r) => r.category === cat);
    if (catResults.length === 0) continue;
    byCategory[cat] = {
      count: catResults.length,
      hitRate: catResults.filter((r) => r.hit).length / catResults.length,
      avgF1: catResults.reduce((sum, r) => sum + r.f1, 0) / catResults.length,
    };
  }

  return {
    totalQuestions: results.length,
    hitRate: totalHits / results.length,
    avgF1,
    byCategory,
    searchMode,
    topK,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function printReport(report: BenchmarkReport): void {
  console.log("\n=== LoCoMo Benchmark Results ===\n");
  console.log(`Search mode: ${report.searchMode}`);
  console.log(`Top-K: ${report.topK}`);
  console.log(`Total questions: ${report.totalQuestions}`);
  console.log(`Overall hit rate: ${(report.hitRate * 100).toFixed(1)}%`);
  console.log(`Overall avg F1: ${(report.avgF1 * 100).toFixed(1)}%`);
  console.log("");
  console.log("By category:");
  console.log("  Cat | Count | Hit Rate | Avg F1");
  console.log("  ----|-------|----------|-------");
  for (const [cat, stats] of Object.entries(report.byCategory)) {
    console.log(
      `    ${cat} |   ${String(stats.count).padStart(3)} | ${(stats.hitRate * 100).toFixed(1).padStart(6)}%  | ${(stats.avgF1 * 100).toFixed(1).padStart(5)}%`,
    );
  }
  console.log("");
  console.log("Published baselines (from LoCoMo paper):");
  console.log("  Mem0:      68.5% (retrieval accuracy)");
  console.log("  Letta MemFS: 74.0%");
  console.log("");
}

if (process.argv[1]?.endsWith("evaluate.ts") || process.argv[1]?.endsWith("evaluate.js")) {
  const dbPath = process.argv.includes("--db-path")
    ? process.argv[process.argv.indexOf("--db-path") + 1]!
    : path.resolve(__dirname, "locomo-bench.db");

  const searchMode = process.argv.includes("--fts") ? "fts" as const : "hybrid" as const;
  const topK = process.argv.includes("--top-k")
    ? parseInt(process.argv[process.argv.indexOf("--top-k") + 1]!)
    : 5;

  if (!fs.existsSync(dbPath)) {
    console.error(`Database not found: ${dbPath}`);
    console.error("Run ingest first: npx tsx harness/exe-os/locomo/ingest.ts");
    process.exit(1);
  }

  evaluate({ dbPath, searchMode, topK })
    .then((report) => {
      printReport(report);
      const outPath = path.resolve(__dirname, "results.json");
      fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
      console.log(`Full results saved to: ${outPath}`);
    })
    .catch((err) => {
      console.error("Evaluation failed:", err);
      process.exit(1);
    });
}
