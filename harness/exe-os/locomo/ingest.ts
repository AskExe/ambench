/**
 * LoCoMo benchmark — ingestion adapter.
 *
 * Reads locomo10.json conversations and ingests each dialog turn
 * as a memory record into our store. Maps LoCoMo sessions to
 * our session_id, speakers to agent_id, and preserves timestamps.
 *
 * Usage: npx tsx harness/exe-os/locomo/ingest.ts [--db-path ./locomo-bench.db]
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { initStore, writeMemory, flushBatch, disposeStore } from "../../../../../exe-os/src/lib/store.js";

interface LoCoMoTurn {
  speaker: string;
  dia_id: string;
  text: string;
}

interface LoCoMoConversation {
  sample_id: string;
  conversation: Record<string, unknown>;
  qa: Array<{
    question: string;
    answer?: string;
    adversarial_answer?: string;
    category: number;
    evidence?: string[];
  }>;
}

import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = process.env.LOCOMO_PATH ?? path.resolve(__dirname, "../../../data/locomo/locomo10.json");

export async function ingestLoCoMo(dbPath: string): Promise<{
  conversations: number;
  turns: number;
  qas: number;
}> {
  const data: LoCoMoConversation[] = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));

  await initStore({
    dbPath,
    masterKey: crypto.createHash("sha256").update("locomo-benchmark-key").digest(),
    batchSize: 100,
    flushIntervalMs: 60_000,
    lightweight: true, // skip shard manager — benchmark uses a single test DB
  });

  let totalTurns = 0;
  let totalQAs = 0;

  for (const conv of data) {
    const convId = conv.sample_id;
    const convo = conv.conversation;

    // Extract speaker names
    const speakerA = (convo.speaker_a as string) ?? "speaker_a";
    const speakerB = (convo.speaker_b as string) ?? "speaker_b";

    // Iterate through sessions
    const sessionKeys = Object.keys(convo)
      .filter((k) => k.match(/^session_\d+$/) && !k.includes("date") && !k.includes("summary") && !k.includes("observation"))
      .sort((a, b) => {
        const numA = parseInt(a.replace("session_", ""));
        const numB = parseInt(b.replace("session_", ""));
        return numA - numB;
      });

    for (const sessionKey of sessionKeys) {
      const turns = convo[sessionKey] as LoCoMoTurn[] | undefined;
      if (!Array.isArray(turns)) continue;

      const sessionNum = sessionKey.replace("session_", "");
      const dateKey = `${sessionKey}_date_time`;
      const sessionDate = (convo[dateKey] as string) ?? new Date().toISOString();
      const sessionId = `locomo-${convId}-s${sessionNum}`;

      for (const turn of turns) {
        const agentId = turn.speaker === speakerA ? "speaker_a" : "speaker_b";
        const timestamp = sessionDate; // all turns in a session share the session timestamp

        await writeMemory({
          id: crypto.randomUUID(),
          agent_id: agentId,
          agent_role: "participant",
          session_id: sessionId,
          timestamp,
          tool_name: "dialog",
          project_name: `locomo-${convId}`,
          has_error: false,
          raw_text: `[${turn.speaker}] ${turn.text}`,
          vector: null, // will be backfilled by daemon
        });
        totalTurns++;
      }
    }

    totalQAs += conv.qa.length;
  }

  await flushBatch();

  return {
    conversations: data.length,
    turns: totalTurns,
    qas: totalQAs,
  };
}

// CLI entry point
if (process.argv[1]?.endsWith("ingest.ts") || process.argv[1]?.endsWith("ingest.js")) {
  const dbPath = process.argv.includes("--db-path")
    ? process.argv[process.argv.indexOf("--db-path") + 1]!
    : path.resolve(__dirname, "locomo-bench.db");

  ingestLoCoMo(dbPath)
    .then((stats) => {
      console.log(`Ingested ${stats.conversations} conversations, ${stats.turns} turns, ${stats.qas} QAs`);
      console.log(`Database: ${dbPath}`);
      return disposeStore();
    })
    .catch((err) => {
      console.error("Ingestion failed:", err);
      process.exit(1);
    });
}
