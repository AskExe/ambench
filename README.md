# AMBench — Agent Memory Benchmark

AMBench is the public benchmark and leaderboard surface for agent-memory systems.
The exe-os product repo should not carry public benchmark adapters/results beyond tiny product smoke tests.

## What lives here

- `harness/exe-os/` — exe-os benchmark adapters copied out of the product repo.
- `schemas/result.schema.json` — canonical result metadata schema.
- `scripts/miss_logger.py` — normalizes benchmark misses into hard-negative JSONL.
- `scripts/official_answer_judge.py` — official-mode answer/judge candidate generator.
- `scripts/export_for_exe_embeddings.py` — exports hard negatives to Exe-Embedding-v1 train/val format.
- `results/` and `reports/` — public or publishable benchmark outputs.

## Result policy

Every result must state whether it is:

1. `diagnostic_retrieval` — internal retrieval quality, not directly comparable to official generated-answer leaderboards.
2. `official_answer` — generated answer scored with benchmark-native or judge evaluator.
3. `official_task` — task success/process score for agentic benchmarks like MemoryArena.

No SOTA claim should mix diagnostic retrieval numbers with official answer/task leaderboards.

## Hard-negative loop

Benchmark misses become Exe Embeddings v1 training data:

```bash
python3 scripts/miss_logger.py raw_misses.jsonl --out data/processed/hard_negatives.jsonl
python3 scripts/export_for_exe_embeddings.py data/processed/hard_negatives.jsonl --out-dir ../Exe-Embedding-v1/data/ambench
```

Each row should include query, positive evidence, hard negatives ranked above the positive, benchmark, category, and memory-length bucket.
