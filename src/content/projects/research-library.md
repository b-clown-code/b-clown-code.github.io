---
title: Research library — a mapped reading list
summary: The papers behind my ML and hardware work, kept as a knowledge graph and published as a searchable catalog and topic map.
status: Live
order: 6
area: ml
metric: "305 papers, 1,812 graph links"
tags: [Knowledge graph, Python, TypeScript, Canvas]
repo: null
claims: [rl-papers, rl-graph]
---

## What it is

A reading list of 305 papers, kept as a knowledge graph rather than a folder of PDFs. Each paper is linked to one research problem and one technique family, and papers that build on, extend or critique each other are linked directly. The [research library page](/research/) publishes the paper metadata and the graph: 125 problems, 141 technique families and 1,812 links.

## What is public and what is not

- **Public:** title, authors, year, category, the arXiv or DOI link, and the problem and technique each paper is filed under. 13 papers have no public identifier and are listed without a link.
- **Private:** my per-paper notes, the passages they cite, and the internal parts of the graph that describe my own project plans. An export script (`scripts/export_research_library.py`) builds the public file from an allowlist of fields and refuses to write anything that looks like a local path or a passage id.

## Caveats

- The groupings are my classification, made with model assistance and checked by hand. Two groups are catch-alls, and a few papers sit in a group that fits them loosely.
- Paper metadata was extracted from the PDFs with model assistance. 26 papers have no author list recorded.
- The "Ask" tab is a keyword search, not a language model. Its question cards were written in advance and are marked as drafts until I have reviewed them.
- Agents built the export script, the page and the first drafts of the topic descriptions and question cards, under my direction.
