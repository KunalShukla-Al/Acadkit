# Evaluations

How well the parts of AcadKit that run a model do, each measured against answers I know.

## Everything connected: links by meaning

100 links by meaning, drawn at random from my Sem 3 folder's links at bars of 0.23 to 0.26 (`npm run connected:judge`)
and judged on 19 Oct 2026: right when the linked item covers the concept the other is about, not just the same unit, so that
following the link helps with what you were reading. The verdicts are in `eval/connected-links.tsv`. They were judged by
Claude, the assistant that built this, reading both items' text, not by me; a spot check of my own is still to do.

| | Links | Right | Precision | 95% interval |
| --- | --- | --- | --- | --- |
| All | 100 | 65 | 65% | 55–74% |
| Question and slide | 40 | 25 | 63% | 47–76% |
| Question and page of notes | 30 | 22 | 73% | 56–86% |
| Page of notes and slide | 30 | 18 | 60% | 42–75% |

### By how alike they are (centered)

| | Links | Right | Precision | 95% interval |
| --- | --- | --- | --- | --- |
| under 0.30 | 13 | 3 | 23% | 8–50% |
| 0.30 to 0.40 | 20 | 7 | 35% | 18–57% |
| 0.40 and over | 67 | 55 | 82% | 71–89% |

- From this check, every link by meaning needs 0.40 (`BARS` in `scripts/lib/links.mjs`). The 82% at that bar is measured on the
  same links that chose it, so a fresh sample will likely come out a little lower.
- Most wrong links share a unit but not the concept (a B-tree deletion for an AVL deletion), and some are slides with
  nothing to say: a deck's title, a syllabus's book list, handwriting the OCR couldn't read.

## Everything connected: the links the app shows

100 more links by meaning, drawn at random from the links the app shows now (every pair at 0.40, at most two
of each kind under an item), none of them among the 100 above, and judged the same way on 21 Oct 2026. The verdicts are in
`eval/connected-links-fresh.tsv`, judged by Claude as well.

| | Links | Right | Precision | 95% interval |
| --- | --- | --- | --- | --- |
| All | 100 | 73 | 73% | 64–81% |
| Question and slide | 40 | 27 | 68% | 52–80% |
| Question and page of notes | 30 | 24 | 80% | 63–90% |
| Page of notes and slide | 30 | 22 | 73% | 56–86% |

- This is the precision to expect in the app: 73%, against 82% for the links over 0.40 in the sample
  that chose the bar.
- The wrong ones are mostly a neighbouring idea in the same unit (the schedulers for the dispatcher, a weighted graph
  for a complete one) or another method of the same kind (the full Fourier transform for a sine transform, optimal page
  replacement for LRU). A few are pages with nothing of their own: a list of headings, a page of links.
