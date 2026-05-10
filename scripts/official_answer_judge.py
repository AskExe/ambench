#!/usr/bin/env python3
"""Official-mode answer/judge harness shell for LoCoMo, BEAM, and MemoryArena.

This script intentionally separates retrieval diagnostics from official claims.
It expects a JSONL with fields: benchmark, question/task, gold_answer, evidence.
It writes generated-answer rows ready for an LLM judge or benchmark-native scorer.
"""
import argparse, json, pathlib, time


def make_prompt(row):
    evidence = row.get("evidence") or row.get("retrieved_context") or []
    if isinstance(evidence, list): evidence = "\n\n".join(map(str, evidence))
    q = row.get("question") or row.get("task") or ""
    return f"Answer using only the evidence. If evidence is insufficient, say you don't know.\n\nEvidence:\n{evidence}\n\nQuestion:\n{q}\n\nAnswer:"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input")
    ap.add_argument("--out", default="results/official-answer-candidates.jsonl")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    out = pathlib.Path(args.out); out.parent.mkdir(parents=True, exist_ok=True)
    with open(args.input) as f, out.open("w") as w:
        for line in f:
            if not line.strip(): continue
            row = json.loads(line)
            prompt = make_prompt(row)
            answer = "DRY_RUN_NO_MODEL" if args.dry_run else row.get("candidate_answer", "")
            w.write(json.dumps({
                "benchmark": row.get("benchmark"),
                "id": row.get("id") or row.get("question_id"),
                "prompt": prompt,
                "candidate_answer": answer,
                "gold_answer": row.get("gold_answer") or row.get("answer"),
                "mode": "official_answer_candidate",
                "generated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            }, ensure_ascii=False) + "\n")
    print(f"wrote {out}")

if __name__ == "__main__": main()
