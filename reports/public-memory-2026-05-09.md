# Public Memory Benchmark Run Results — 2026-05-09

Run policy: strictly sequential; no benchmark started until the previous process exited. Used `VITEST=1` so benchmark temp DBs do not route through live exe-os daemon DB. Used `EXE_SKIP_MEMORY_HYGIENE=1` for benchmark writes to avoid async post-write hygiene errors after temp DB disposal.

## Completed runs

| Benchmark | Command / mode | Status | Cases | Memories / sessions | Result |
|---|---|---:|---:|---:|---|
| LoCoMo | `npx tsx tests/benchmarks/run-all.ts --only locomo --fts` | passed | 1,986 | 5,882 turns | Hit rate 17.0%, Avg F1 10.8% |
| LongMemEval | `VITEST=1 EXE_SKIP_MEMORY_HYGIENE=1 npx tsx tests/benchmarks/longmemeval.ts --fts` | passed | 500 | 23,867 sessions | R@1 87.2%, R@5 96.6%, R@10 97.8%, avg latency 265ms |
| MemBench | `npx tsx tests/benchmarks/public-retrieval.ts --only membench --limit 500` | passed sampled run | 500 of 26,637 | 17,997 turns in sample | Hit rate 26.2%, Avg F1 10.8%, avg latency 69ms |
| REALTALK | `npx tsx tests/benchmarks/public-retrieval.ts --only realtalk` | passed | 728 | 650,447 turns | Hit rate 59.6%, Avg F1 9.0%, avg latency 3ms |
| MemoryArena | `npx tsx tests/benchmarks/public-retrieval.ts --only memoryarena` | passed | 4,850 | 9,700 records | Hit rate 77.5%, Avg F1 52.2%, avg latency 123ms |
| BEAM | `npx tsx tests/benchmarks/public-retrieval.ts --only beam --tier 100K` | passed | 400 | 114,640 turns | Hit rate 44.5%, Avg F1 12.6%, avg latency 14ms |
| MemoryAgentBench | `npx tsx tests/benchmarks/run-all.ts --only memoryagentbench` | no public cases | 0 | 0 | Public repo snapshot has no runnable benchmark JSON splits. |

## Fixes made while running

1. Added `EXE_SKIP_MEMORY_HYGIENE=1` support in `src/lib/memory-write-governor.ts` so short-lived benchmark temp DBs do not produce post-dispose `CLIENT_CLOSED` hygiene errors.
2. Added `tests/benchmarks/public-retrieval.ts` for public datasets that do not yet have dedicated exe-os adapters: MemBench, REALTALK, MemoryArena, BEAM, MemoryAgentBench status detection.
3. Updated `tests/benchmarks/run-all.ts` so registered benchmarks run sequentially and non-LoCoMo/LongMemEval benchmarks call `public-retrieval.ts` instead of reporting adapter_pending.
4. Fixed BEAM loader to handle `source_chat_ids` whether it is an array or scalar.

## Important caveats

- LoCoMo score above is FTS-only retrieval against evidence turns; it is not comparable to published LLM-answering scores without matching the benchmark's official evaluator.
- LongMemEval completed full 500-instance run successfully.
- MemBench full local data is very large: 26,637 cases and ~1,322,716 turns. I intentionally ran a 500-case sample to avoid laptop stress. The runner now supports `--limit`; full MemBench should run on a larger machine or overnight.
- BEAM was run on the 100K tier only. Do not run BEAM 10M on the laptop without an explicit tier/limit plan.
- MemoryAgentBench repo exists locally, but the public snapshot does not include the claimed JSON benchmark splits, so it cannot produce a score yet.

## Verification

- `npx tsx tests/benchmarks/run-all.ts --list` passes.
- `npx tsx tests/benchmarks/run-all.ts --only locomo --fts` passes end-to-end including fresh ingest.
- `npm run typecheck` currently fails on two pre-existing unrelated TypeScript errors in `src/adapters/claude/hooks/prompt-submit.ts` and `src/mcp/tools/apply-starter-pack.ts`; not caused by benchmark changes.
