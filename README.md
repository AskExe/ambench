# AMBench — Agent Memory Benchmarks

AMBench is AskExe's benchmark/reference repo for agent-memory evaluation. This repo should track benchmark metadata, adapters, methodology, and source references — **not** vendored third-party datasets.

## Dataset policy

- Do **not** commit cloned benchmark repos, downloaded datasets, generated benchmark DBs, or large result artifacts.
- Keep local datasets outside the repo, e.g. `~/benchmarks/...`.
- Use environment variables to point runners at local copies.
- If a dataset is not publicly released, mark it as watchlist/pending instead of claiming it as runnable.

## Safe running policy

Run benchmarks one at a time on developer machines. Large datasets, especially BEAM, can stress memory/disk if run as a combined suite.

Recommended pattern:

```bash
# examples — actual runner can live in exe-os or AMBench adapters
BENCHMARK=locomo npx tsx tests/benchmarks/run-all.ts --only locomo --fts
BENCHMARK=beam   npx tsx tests/benchmarks/run-all.ts --only beam --fts
```

## First-party benchmark

| Benchmark | Owner | Status | Source | Notes |
|---|---|---|---|---|
| AMBench | AskExe | First-party benchmark; source of truth lives in this repo | <https://github.com/AskExe/ambench> | AMBench is our own agent-memory benchmark. It should contain our methodology, adapters, fixtures, scoring, and published exe-os runs. Third-party datasets referenced below should stay external and not be vendored here. |

## Public benchmark sources

| Benchmark | Runnable status | Suggested local path | Env var | Public source |
|---|---|---|---|---|
| LoCoMo | Runnable / small sample currently vendored in exe-os for smoke tests | `tests/benchmarks/locomo-repo/data/locomo10.json` or external full copy | `LOCOMO_PATH` | Mem0 LoCoMo paper: <https://arxiv.org/abs/2504.19413>; Letta baseline: <https://www.letta.com/blog/benchmarking-ai-agent-memory> |
| LongMemEval | Runnable if dataset is downloaded locally | `~/LongMemEval/data/longmemeval_s_cleaned.json` | `LONGMEMEVAL_PATH` | ICLR 2025 paper: <https://proceedings.iclr.cc/paper_files/paper/2025/hash/d813d324dbf0598bbdc9c8e79740ed01-Abstract-Conference.html>; repo: <https://github.com/xiaowu0162/LongMemEval> |
| MemBench | Public repo/data available | `~/benchmarks/Membench` | `MEMBENCH_PATH` | Paper: <https://arxiv.org/abs/2506.21605>; repo: <https://github.com/import-myself/Membench> |
| MemoryAgentBench | Repo available; benchmark data appears pending/not included in current public snapshot | `~/benchmarks/MemoryAgentBench` | `MEMORYAGENTBENCH_PATH` | Repo: <https://github.com/HUST-AI-HYZ/MemoryAgentBench> |
| MemoryArena | Public Hugging Face dataset available | `~/benchmarks/MemoryArena` | `MEMORYARENA_PATH` | Project: <https://memoryarena.github.io/>; dataset: <https://huggingface.co/datasets/ZexueHe/memoryarena>; paper: <https://arxiv.org/abs/2602.16313> |
| REALTALK | Public repo/data available | `~/benchmarks/REALTALK` | `REALTALK_PATH` | Paper: <https://arxiv.org/abs/2502.13270>; repo: <https://github.com/danny911kr/REALTALK> |
| BEAM | Public repo/data available; run tier-by-tier | `~/benchmarks/BEAM` | `BEAM_PATH` | Paper: <https://arxiv.org/abs/2510.27246>; repo: <https://github.com/mohammadtavakoli78/BEAM>; Agent Memory Benchmark context: <https://hindsight.vectorize.io/blog/2026/03/23/agent-memory-benchmark> |

## Watchlist, not runnable

| Benchmark | Reason |
|---|---|
| StoryBench | Paper exists, but no public dataset/code artifact was found. Do not include in runnable claims until authors publish data. Paper: <https://arxiv.org/abs/2506.13356> |

## Local development snapshot — 2026-05-09

Downloaded locally under `~/benchmarks/` for AskExe development:

- `~/benchmarks/Membench` — ~782 MB
- `~/benchmarks/MemoryAgentBench` — ~12 MB; repo only, benchmark data pending
- `~/benchmarks/REALTALK` — ~1.2 GB
- `~/benchmarks/MemoryArena` — ~12 MB
- `~/benchmarks/agent-memory-benchmark` — ~1.2 GB; leaderboard/catalog reference
- `~/benchmarks/memory-benchmarks` — ~17 MB; published result/baseline reference
- `~/benchmarks/BEAM` — ~4.1 GB

These local copies are intentionally **not** committed.
