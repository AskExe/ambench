#!/usr/bin/env python3
"""Normalize benchmark misses into Exe Embeddings v1 hard-negative JSONL."""
import argparse, json, pathlib, sys


def normalize(row):
    query = row.get("query") or row.get("question") or ""
    positive = row.get("positive_evidence") or row.get("gold") or row.get("answer") or ""
    negatives = row.get("hard_negatives") or row.get("retrieved_above_positive") or []
    if isinstance(negatives, str):
        negatives = [negatives]
    return {
        "query": query,
        "positive_evidence": positive,
        "hard_negatives": negatives,
        "benchmark": row.get("benchmark", "unknown"),
        "category": row.get("category", row.get("question_type", "unknown")),
        "memory_length_bucket": row.get("memory_length_bucket", "unknown"),
        "gold_evidence_id": row.get("gold_evidence_id") or row.get("evidence_id"),
        "positive_rank": row.get("positive_rank"),
        "source": row.get("source", "ambench"),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input", help="JSONL of raw misses")
    ap.add_argument("--out", default="data/processed/hard_negatives.jsonl")
    args = ap.parse_args()
    out = pathlib.Path(args.out); out.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with open(args.input) as f, out.open("w") as w:
        for line in f:
            if not line.strip(): continue
            row = normalize(json.loads(line))
            if not row["query"] or not row["positive_evidence"]: continue
            w.write(json.dumps(row, ensure_ascii=False) + "\n")
            n += 1
    print(f"wrote {n} hard-negative rows to {out}")

if __name__ == "__main__": main()
