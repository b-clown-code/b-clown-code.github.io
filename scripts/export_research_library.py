#!/usr/bin/env python3
"""Export a public, allowlisted subset of the research knowledge base.

Reads  ~/neural_network_research/research_kb/data/{knowledge_graph.json,cards/*.json}
Writes content/research-library.json

Kept: paper metadata (title, authors, year, category, DOI/arXiv link), humanised
problem and technique names, mechanism names and definitions, codebase name,
repo URL and licence, and edges between exported nodes.
Dropped: every free-text card field, provenance chunk ids, raw_* variant lists,
Assumption/Component/Host/VisionPillar/StackComponent nodes, local paths.
The script fails if any output string looks like a local path or chunk id.
"""
import json, re, sys
from collections import Counter
from pathlib import Path

SRC = Path.home() / "neural_network_research/research_kb/data"
OUT = Path(__file__).resolve().parent.parent / "content/research-library.json"

EDGE_KEEP = {
    "ADDRESSES_PROBLEM", "USES_TECHNIQUE", "SAME_PROBLEM_SIMILAR_TECHNIQUE",
    "SAME_PROBLEM_DIFFERENT_TECHNIQUE", "PRECURSOR_TO", "DERIVATIVE_OF",
    "DEMONSTRATES_MECHANISM", "COMPLEMENTARY_LAYER", "IMPLEMENTS_PAPER",
    "CRITIQUES_OR_LIMITS",
}
ACRONYMS = {"llm": "LLM", "llms": "LLMs", "fpga": "FPGA", "moe": "MoE", "kv": "KV",
            "rl": "RL", "gpu": "GPU", "asic": "ASIC", "ssm": "SSM", "rag": "RAG",
            "lora": "LoRA", "snn": "SNN", "hdc": "HDC", "ai": "AI", "ml": "ML",
            "amd": "AMD", "gemm": "GEMM", "htr": "HTR", "icl": "ICL", "lms": "LMs",
            "lr": "LR", "lstm": "LSTM", "mlp": "MLP", "ocr": "OCR", "rnn": "RNN",
            "rtl": "RTL", "sft": "SFT", "rocm": "ROCm", "cuda": "CUDA", "hls": "HLS",
            "sram": "SRAM", "dram": "DRAM", "ste": "STE", "qat": "QAT", "ptq": "PTQ"}
SMALL = {"and", "or", "of", "for", "in", "on", "via", "with", "to", "the", "a", "vs"}


def humanise(snake: str) -> str:
    words = snake.split("_")
    out = []
    for i, w in enumerate(words):
        if w in ACRONYMS:
            out.append(ACRONYMS[w])
        elif i and w in SMALL:
            out.append(w)
        else:
            out.append(w[:1].upper() + w[1:])
    return " ".join(out)


def main() -> None:
    g = json.loads((SRC / "knowledge_graph.json").read_text())
    cards = {}
    for p in (SRC / "cards").glob("*.json"):
        c = json.loads(p.read_text())
        cards[c["paper_id"]] = c

    nodes = {n["id"]: n for n in g["nodes"]}
    prob_by_name = {n["name"]: i for i, n in nodes.items() if n["type"] == "Problem"}
    tech_by_name = {n["name"]: i for i, n in nodes.items() if n["type"] == "TechniqueFamily"}

    papers, problems, techniques, mechanisms, codebases = [], [], [], [], []
    for i, n in nodes.items():
        t = n["type"]
        if t == "Paper":
            c = cards.get(i, {})
            doi, arxiv = c.get("doi"), c.get("arxiv_id")
            url = f"https://arxiv.org/abs/{arxiv}" if arxiv else (f"https://doi.org/{doi}" if doi else None)
            papers.append({
                "id": i, "title": n["title"],
                # "Research Team" is a placeholder in the knowledge base, not an author.
                "authors": [a for a in c.get("authors", []) if a.strip().lower() != "research team"],
                "year": n.get("year"), "category": n.get("category"),
                "doi": doi, "arxiv": arxiv, "url": url,
                "problem": prob_by_name.get(n.get("core_problem")),
                "technique": tech_by_name.get(n.get("technique_family")),
            })
        elif t == "Problem":
            problems.append({"id": i, "name": humanise(n["name"])})
        elif t == "TechniqueFamily":
            techniques.append({"id": i, "name": n["name"]})
        elif t == "Mechanism":
            mechanisms.append({"id": i, "name": n["name"], "definition": n.get("definition", "")})
        elif t == "Codebase" and str(n.get("repo_url", "")).startswith("https://") \
                and "/search?" not in n["repo_url"]:
            codebases.append({"id": i, "name": n["name"], "repo_url": n.get("repo_url"),
                              "license": n.get("license")})

    keep = {x["id"] for x in papers + problems + techniques + mechanisms + codebases}
    seen, edges = set(), []
    for e in g["edges"]:
        r, s, d = e["relation"], e["source"], e["target"]
        if r in EDGE_KEEP and s in keep and d in keep and (s, d, r) not in seen:
            seen.add((s, d, r))
            edges.append([s, d, r])

    for lst in (papers, problems, techniques, mechanisms, codebases):
        lst.sort(key=lambda x: x["id"])
    # Replace string ids with one global integer index (papers first, then
    # problems, techniques, mechanisms, codebases), so edges stay small.
    order = papers + problems + techniques + mechanisms + codebases
    idx = {x["id"]: k for k, x in enumerate(order)}
    for x in order:
        x["id"] = idx[x["id"]]
    for p in papers:
        p["problem"] = idx.get(p["problem"])
        p["technique"] = idx.get(p["technique"])
        del p["doi"], p["arxiv"]
    rels = sorted({e[2] for e in edges})
    edges = sorted([idx[a], idx[b], rels.index(r)] for a, b, r in edges)

    data = {
        "source": "Owner's research knowledge base (curated public export)",
        "counts": {"papers": len(papers), "problems": len(problems),
                   "techniques": len(techniques), "mechanisms": len(mechanisms),
                   "codebases": len(codebases), "edges": len(edges),
                   "papers_without_identifier": sum(1 for p in papers if not p["url"]),
                   "papers_without_authors": sum(1 for p in papers if not p["authors"])},
        "papers": papers, "problems": problems, "techniques": techniques,
        "mechanisms": mechanisms, "codebases": codebases, "relations": rels, "edges": edges,
    }

    # Guards: no local paths, no chunk ids, no unexpected keys.
    allowed = {"source", "counts", "papers", "problems", "techniques", "mechanisms",
               "codebases", "edges", "id", "title", "authors", "year", "category", "doi",
               "arxiv", "url", "problem", "technique", "name", "definition", "repo_url",
               "license", "problems", "techniques", "mechanisms", "codebases", "edges",
               "papers_without_identifier", "papers_without_authors", "relations"}
    bad = re.compile(r"/home|/mnt|docling_|_p\d+_c\d{3,}|\.pdf\b")

    def walk(x, path="$"):
        if isinstance(x, dict):
            for k, v in x.items():
                if k not in allowed:
                    sys.exit(f"guard: unexpected key {path}.{k}")
                walk(v, f"{path}.{k}")
        elif isinstance(x, list):
            for j, v in enumerate(x):
                walk(v, f"{path}[{j}]")
        elif isinstance(x, str) and bad.search(x):
            sys.exit(f"guard: forbidden string at {path}: {x[:80]}")
    walk(data)

    OUT.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB)", data["counts"])
    print("edges by relation:", Counter(rels[e[2]] for e in edges))


if __name__ == "__main__":
    main()
