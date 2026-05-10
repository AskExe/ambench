#!/usr/bin/env python3
"""Convert AMBench hard negatives into Exe-Embedding-v1 train/val JSONL."""
import argparse, json, pathlib, random


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("hard_negatives", default="data/processed/hard_negatives.jsonl")
    ap.add_argument("--out-dir", default="../Exe-Embedding-v1/data/ambench")
    ap.add_argument("--val-ratio", type=float, default=0.1)
    args = ap.parse_args()
    rows=[]
    with open(args.hard_negatives) as f:
        for line in f:
            if not line.strip(): continue
            r=json.loads(line)
            rows.append({
                "query": r["query"],
                "memory_text": r["positive_evidence"],
                "hard_negatives": r.get("hard_negatives", []),
                "benchmark": r.get("benchmark"),
                "category": r.get("category"),
            })
    random.Random(42).shuffle(rows)
    cut=max(1, int(len(rows)*(1-args.val_ratio))) if rows else 0
    out=pathlib.Path(args.out_dir); out.mkdir(parents=True, exist_ok=True)
    for name, subset in [("train.jsonl", rows[:cut]), ("val.jsonl", rows[cut:])]:
        with (out/name).open("w") as w:
            for r in subset: w.write(json.dumps(r, ensure_ascii=False)+"\n")
    print(f"wrote {len(rows[:cut])} train / {len(rows[cut:])} val rows to {out}")

if __name__ == "__main__": main()
