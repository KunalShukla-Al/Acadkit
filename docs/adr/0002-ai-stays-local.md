# 0002. AI stays local

- Status: accepted, 16 Nov 2026
- Builds on: [0001, the Mac is the brain](0001-the-mac-is-the-brain.md)

## The problem

Four parts of AcadKit need a model: Autopilot reads photos and PDFs of notices, the past-paper
reader reads every paper, Everything connected embeds every page and slide, and the class recorder
transcribes lectures. What they read is personal: photos of a board or a notice board, my notes,
my teachers' voices. And I have no budget for a model API.

## What I chose

Every model runs on my Mac, and no part of AcadKit holds a key to a model API:

| Job | Model | Where |
| --- | --- | --- |
| Autopilot, past papers | qwen3-vl:8b-instruct | Ollama on the Mac (`scripts/lib/ollama.mjs`) |
| Embeddings | gte-small | the Mac (`scripts/embedder`); a search's query alone is embedded by the study-search function |
| Lectures | whisper.cpp large-v3-turbo | the Mac (`scripts/lib/whisper.mjs`) |

Siri's questions and the explainers don't use a model: Siri's grammar is rules
(`packages/core/src/ask.ts`), and an explainer plays the working that core already computes.

What leaves the Mac is what a model made from my files, never the files' private parts: a
deadline row, a file moved into its course, a transcript's text, a vector. The audio of a lecture
and the photos stay on the Mac, apart from files I send to the study folder myself.

## Why not a model API

- **Cost**: per call, on every photo, paper, page and minute of lecture. The paper eval alone is
  118 papers.
- **Privacy**: it would send a third party my notes, the board, and a lecture with my teachers and
  classmates in it, which I have no right to share.
- **Lock-in**: the prompts, the schemas and the evaluations would follow one provider's model.

## What it costs

- **Quality is what an 8B model on a laptop can do**, and I measure it instead of assuming it
  (`EVAL.md`): the paper reader finds 74.6% of questions and gets the topic right on 59.3% of
  those it finds; links by meaning are right about two times in three across the sample. A bigger
  hosted model would likely do better.
- **It's slow**: about three minutes a paper, a few minutes a lecture, so work waits for ticks and
  the night shift.
- **It takes the Mac's memory**: with 16 GB, the vision model, whisper and the embedding build
  can't all run at once without swapping (19 Oct: 1.6 tokens a second instead of 17), so they
  take turns.
- **It needs the Mac on and set up**: Ollama with its model pulled, whisper.cpp built, the
  embedder installed.
- **CI can't run it**: the tests replay recorded model replies (`npm run autopilot:record`), and
  the evaluations run on this Mac.
