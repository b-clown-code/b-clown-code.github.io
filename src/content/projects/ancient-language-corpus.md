---
title: A provenance-tracked corpus of ancient-language text
summary: A data pipeline that collects, catalogs and versions texts in Greek, Latin, Coptic, Akkadian, Sanskrit and other ancient languages into hash-pinned training releases.
status: In progress
order: 6
area: ml
metric: "91.2M tokens in frozen V10 corpus"
tags: [Python, SQLite FTS5, PyTorch, tokenizers, data provenance]
visual: specimen
repo: https://github.com/b-clown-code/ancient-text-research
claims: [corpus-v10, corpus-360m-run, corpus-retrieval, case-bf16, corpus-v9-languages]
---

## The problem

Ancient-language text is scattered across dozens of scholarly sources, each with its own format and licence. Training a model on it needs a corpus where every row can be traced to its source, licence problems can be removed later, and train and validation data cannot leak into each other.

## What was built

- **Catalog and inventory tools.** Every release carries deterministic manifests and checksums.
- **Versioned releases.** Each release carries acceptance receipts. When a source had to be excluded, a clean release could be rebuilt instead of patched.
- **Family-level split.** Train and validation are split by *text family*, so near-duplicate copies of one text can't land on both sides.
- **Hybrid retrieval.** A retrieval prototype that fuses lexical search (SQLite FTS5) with dense vectors.
- **Training stack.** A tokenizer and a pretraining pipeline for small decoder-only language models.

## Results

| Item | Value |
|---|---|
| Frozen corpus (V10) | 481,670 rows, 46.2M words and 91.2M tokens |
| Retrieval pilot | Hybrid Recall@10 0.457, vs 0.307 lexical and 0.333 dense (35,000 passages; 120 answerable queries; [RESULTS.md](https://github.com/b-clown-code/ancient-text-research/blob/3d021afd2a60ae3e4a5a1dc610315c8e63a5e12d/RESULTS.md)) |
| Largest training run | 355.6M-parameter model trained to 360M tokens |

The following chart describes the earlier V9 corpus, retained for historical context.

<figure data-chart="corpus-languages"></figure>

## In progress: ancientGPT

A browser chat demo of a small model trained from scratch on the frozen V10 corpus is in progress. The demo will be added after the model has been evaluated and a licence for its weights has been chosen.

## Limits

- **No model claims.** The trained models have not had a full evaluation, so the corpus is the result here, not the models.
- **Retrieval labels.** The pilot's relevance labels were built from the systems' own agreement, not independently judged.
- **Defective earlier results.** Earlier training results came from a trainer with a precision defect, so they are treated as compromised. The [verification page](/verification/#bf16) describes how it was found.

## Who did what

I chose the sources and made the licensing, exclusion and release decisions, and I reviewed the results. AI agents wrote all of the code: ingestion, cataloging and training.

## Code

A public, reviewed snapshot is at [b-clown-code/ancient-text-research](https://github.com/b-clown-code/ancient-text-research). Source texts, which come under mixed licences, are not redistributed.
