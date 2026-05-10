#!/usr/bin/env tsx
/**
 * LongMemEval Benchmark — exe-os retrieval quality measurement.
 *
 * Measures R@1, R@5, R@10 against the LongMemEval dataset (ICLR 2025).
 * Uses a temp DB with random encryption key — no side effects on real data.
 *
 * Dataset: ~/LongMemEval/data/longmemeval_s_cleaned.json (500 instances)
 *
 * Usage: npx tsx harness/exe-os/longmemeval.ts [--fts]
 */

import { randomUUID, randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initStore, writeMemory, flushBatch, disposeStore } from "../../../../exe-os/src/lib/store.js";
import { hybridSearch, lightweightSearch } from "../../../../exe-os/src/lib/hybrid-search.js";
import type { MemoryRecord } from "../../../../exe-os/src/types/memory.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LongMemEvalInstance {
  question_id: string;
  question_type: string;
  question: string;
  answer: string;
  question_date: string;
  haystack_session_ids: string[];
  haystack_dates: string[];
  haystack_sessions: Array<Array<{ role: string; content: string; has_answer?: boolean }>>;
  answer_session_ids: string[];
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DATASET_PATH = join(
  process.env.HOME ?? "~",
  "LongMemEval/data/longmemeval_s_cleaned.json",
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function recallAtK(
  retrievedSessionIds: string[],
  goldSessionIds: string[],
  k: number,
): number {
  const topK = new Set(retrievedSessionIds.slice(0, k));
  return goldSessionIds.some((id) => topK.has(id)) ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const useFtsOnly = process.argv.includes("--fts");

  // 1. Load dataset
  process.stderr.write("Loading dataset...\n");
  const dataset: LongMemEvalInstance[] = JSON.parse(
    readFileSync(DATASET_PATH, "utf-8"),
  );
  process.stderr.write(`Loaded ${dataset.length} instances.\n`);

  // 2. Create temp DB
  const tmpDir = mkdtempSync(join(tmpdir(), "longmemeval-"));
  const dbPath = join(tmpDir, "benchmark.db");
  process.stderr.write(`Temp DB: ${dbPath}\n`);

  await initStore({
    dbPath,
    masterKey: randomBytes(32),
    batchSize: 200,
    flushIntervalMs: 120_000, // disable timer flush — we flush manually
    lightweight: true, // skip shard manager — benchmark uses single test DB
  });

  // 3. Check if embeddings are available
  let embedFn: ((text: string) => Promise<number[]>) | null = null;
  let embeddingMode = "FTS-only (no daemon)";

  if (!useFtsOnly) {
    try {
      const { embed } = await import("../../src/lib/embedder.js");
      await embed("test");
      embedFn = embed;
      embeddingMode = "Jina v5 GGUF";
      process.stderr.write("Embedding daemon available — hybrid mode\n");
    } catch {
      process.stderr.write("Embedding daemon unavailable — FTS-only mode\n");
    }
  }

  // 4. Ingest phase
  process.stderr.write("\n--- Ingest Phase ---\n");
  let totalSessions = 0;
  const ingestStart = Date.now();

  for (let qi = 0; qi < dataset.length; qi++) {
    const instance = dataset[qi]!;
    if ((qi + 1) % 50 === 0 || qi === 0) {
      process.stderr.write(`Ingesting question ${qi + 1}/${dataset.length}...\n`);
    }

    for (let si = 0; si < instance.haystack_sessions.length; si++) {
      const session = instance.haystack_sessions[si]!;
      const rawText = session
        .map((turn) => `[${turn.role}] ${turn.content}`)
        .join("\n");

      let vector: number[] | null = null;
      if (embedFn) {
        try {
          vector = await embedFn(rawText.slice(0, 8192));
        } catch {
          // Embed failed for this record — continue with null vector
        }
      }

      await writeMemory({
        id: randomUUID(),
        agent_id: instance.question_id,
        agent_role: "benchmark",
        session_id: instance.haystack_session_ids[si] ?? `session-${si}`,
        timestamp: instance.haystack_dates[si] ?? new Date().toISOString(),
        tool_name: "benchmark",
        project_name: "longmemeval",
        has_error: false,
        raw_text: rawText,
        vector,
      });
      totalSessions++;
    }

    // Flush every 25 questions to prevent unbounded buffer growth
    if ((qi + 1) % 25 === 0) {
      await flushBatch();
    }
  }

  // Final flush
  await flushBatch();
  const ingestMs = Date.now() - ingestStart;
  process.stderr.write(
    `Ingested ${totalSessions} sessions in ${(ingestMs / 1000).toFixed(1)}s\n`,
  );

  // 5. Eval phase
  process.stderr.write("\n--- Eval Phase ---\n");
  const searchFn = embedFn ? hybridSearch : lightweightSearch;

  let r1Sum = 0;
  let r5Sum = 0;
  let r10Sum = 0;
  let totalLatencyMs = 0;
  const byType = new Map<
    string,
    { count: number; r1: number; r5: number; r10: number }
  >();

  for (let qi = 0; qi < dataset.length; qi++) {
    const instance = dataset[qi]!;
    if ((qi + 1) % 50 === 0 || qi === 0) {
      process.stderr.write(`Evaluating question ${qi + 1}/${dataset.length}...\n`);
    }

    const queryStart = Date.now();
    const results: MemoryRecord[] = await searchFn(
      instance.question,
      instance.question_id,
      { limit: 10 },
    );
    totalLatencyMs += Date.now() - queryStart;

    const retrievedSessionIds = results.map((r) => r.session_id);

    const hit1 = recallAtK(retrievedSessionIds, instance.answer_session_ids, 1);
    const hit5 = recallAtK(retrievedSessionIds, instance.answer_session_ids, 5);
    const hit10 = recallAtK(retrievedSessionIds, instance.answer_session_ids, 10);

    r1Sum += hit1;
    r5Sum += hit5;
    r10Sum += hit10;

    // Track per question_type
    const qType = instance.question_type;
    const bucket = byType.get(qType) ?? { count: 0, r1: 0, r5: 0, r10: 0 };
    bucket.count++;
    bucket.r1 += hit1;
    bucket.r5 += hit5;
    bucket.r10 += hit10;
    byType.set(qType, bucket);
  }

  await disposeStore();

  // 6. Report
  const version = JSON.parse(
    readFileSync(join(import.meta.dirname, "../../package.json"), "utf-8"),
  ).version ?? "unknown";

  const r1 = (r1Sum / dataset.length) * 100;
  const r5 = (r5Sum / dataset.length) * 100;
  const r10 = (r10Sum / dataset.length) * 100;
  const avgLatency = Math.round(totalLatencyMs / dataset.length);

  console.log("");
  console.log("═══════════════════════════════════════════════════");
  console.log(`  LongMemEval Benchmark — exe-os v${version}`);
  console.log(`  Embeddings: ${embeddingMode}`);
  console.log("═══════════════════════════════════════════════════");
  console.log("");
  console.log(`  R@1:   ${r1.toFixed(1).padStart(5)}%`);
  console.log(`  R@5:   ${r5.toFixed(1).padStart(5)}%`);
  console.log(`  R@10:  ${r10.toFixed(1).padStart(5)}%`);
  console.log("");
  console.log(`  Total queries:     ${dataset.length}`);
  console.log(`  Avg latency:       ${avgLatency}ms`);
  console.log(`  Dataset:           longmemeval_s_cleaned`);
  console.log(`  Sessions ingested: ${totalSessions}`);
  console.log("");
  console.log("  By question type:");
  console.log("  ┌──────────────────────────────┬───────┬───────┬───────┬───────┐");
  console.log("  │ Type                         │ Count │  R@1  │  R@5  │  R@10 │");
  console.log("  ├──────────────────────────────┼───────┼───────┼───────┼───────┤");
  for (const [qType, bucket] of [...byType.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const tr1 = ((bucket.r1 / bucket.count) * 100).toFixed(1);
    const tr5 = ((bucket.r5 / bucket.count) * 100).toFixed(1);
    const tr10 = ((bucket.r10 / bucket.count) * 100).toFixed(1);
    console.log(
      `  │ ${qType.padEnd(28)} │ ${String(bucket.count).padStart(5)} │ ${tr1.padStart(5)}% │ ${tr5.padStart(5)}% │ ${tr10.padStart(5)}% │`,
    );
  }
  console.log("  └──────────────────────────────┴───────┴───────┴───────┴───────┘");
  console.log("");
  console.log("═══════════════════════════════════════════════════");

  // 7. Cleanup
  try {
    rmSync(tmpDir, { recursive: true, force: true });
    process.stderr.write(`Cleaned up temp dir: ${tmpDir}\n`);
  } catch {
    process.stderr.write(`Note: temp dir remains at ${tmpDir}\n`);
  }
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
