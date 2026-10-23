# Evaluations

How well the parts of AcadKit that run a model do, each measured against answers I know.

## Class recorder: lining lectures up with slides

`scripts/lib/lecture-align.mjs` on 3 stand-in lectures, 37 minutes in all, run on 21 Oct 2026 with
`npm run recorder:eval`. Each is a walk through 8 slides of a real deck from my study folder, each
explained for about two minutes by qwen3-vl:8b-instruct as a teacher would, with two asides of about
a minute off the slides, spoken by macOS's `say`. So the slide behind every second is known. The
recorder then ran as it does on a real lecture: whisper.cpp large-v3-turbo, its deck chosen from
every deck in the course, moments of about a minute lined up at a floor of 0.2.

| Lecture | Deck it chose | Moments on a slide | Right slide | Within a page | Given no slide | Aside moments kept off |
| --- | --- | --- | --- | --- | --- | --- |
| os-cpu-scheduling | the right one | 13 | 46% | 54% | 15% | 0 of 1 |
| dsa-stacks-queues | the right one | 11 | 27% | 36% | 0% | 0 of 2 |
| fds-pandas | the right one | 11 | 55% | 64% | 0% | 2 of 2 |
| All | 3 of 3 right or a copy | 35 | 43% | 51% | 6% | 2 of 5 |

- A moment's slide is the one on screen for most of its minute; one across a change of slide is often given the other.
- Right slide means the page it opens shows the slide on screen: the slide itself, or its copy (at least 0.98 alike) when the deck chosen repeats the right one, as a faculty's full deck repeats a unit's.
- These are stand-ins. A real class has one voice with an accent, noise, board work, Hindi and long examples off the slides; three real lectures, checked by hand, are still to measure once I may record one.

## Autopilot's past-paper reader

`scripts/lib/paper-reader.mjs` (reader version 2, qwen3-vl:8b-instruct through Ollama on my Mac) on the 110 papers in
`_src/pyq_dataset`, 2,409 questions. I had an AI assistant label them from the page images and macOS Vision's OCR text, separately from this reader, and not every label has been checked by hand. Run on 21 Oct 2026 with `npm run autopilot:eval`.

| Field | Right | Of | Accuracy |
| --- | --- | --- | --- |
| Number: the question is found | 1,835 | 2,409 | 76.2% |
| Part | 1,939 | 2,409 | 80.5% |
| Marks, of those found | 1,611 | 1,835 | 87.8% |
| Unit, of those found | 1,491 | 1,835 | 81.3% |
| Topic, of those found | 1,234 | 1,835 | 67.2% |

- It also read 742 questions I didn't label (28.8% of what it read): sub-parts, and numbers misread.
- It read every paper.
- A paper in a file of several is read only on its own pages, from its note. 8 share a file without saying which pages are theirs, so they're left out: dsa-fj1-2025-mcq-a, dsa-fj1-2025-mcq-b, dsa-fj1-2025-mcq-c, dsa-fj1-2025-mcq-d, tb-ft3-2024-a1a, tb-ft3-2024-a1b, tb-ft3-2024-a2a, tb-ft3-2024-a2b.
- A paper took 176 s at the median, 4.4 h in all.
- Found means the reading has the labelled slot (B21a, C26). Part is right when it has a question of that number in the same part. Marks, unit and topic are compared on the questions found; the unit comes from the topic.

### By course

| | Papers | Found | Part | Marks | Unit | Topic |
| --- | --- | --- | --- | --- | --- | --- |
| AOOP | 6 | 63.0% | 66.7% | 100.0% | 91.2% | 73.5% |
| DSA | 35 | 71.2% | 74.7% | 87.1% | 77.2% | 64.0% |
| FDS | 8 | 85.6% | 87.6% | 93.0% | 87.2% | 79.7% |
| OS | 28 | 81.0% | 84.6% | 91.4% | 77.3% | 66.9% |
| TBVP | 33 | 76.1% | 82.8% | 82.6% | 87.2% | 66.9% |

### By kind of paper

| | Papers | Found | Part | Marks | Unit | Topic |
| --- | --- | --- | --- | --- | --- | --- |
| Cycle test | 58 | 52.5% | 60.1% | 86.1% | 83.9% | 63.6% |
| End-sem | 52 | 84.6% | 87.7% | 88.2% | 80.7% | 68.0% |

## The reader: what changed since the first run

The first run, on 19 Oct, found 74.6% of the questions. This one finds 76.2%, and reads about half as many
questions I didn't label (742, down from 1,450). Three faults sat behind the first number: one in the reader and two
in how it was measured. All three are fixed.

- **The reader counted on past the page.** Each page is told the last question number before it, so a part that runs
  over a page keeps its numbering. On a page that starts a new set at 1, the model instead kept counting, A30 to
  A100, until it ran out of time. Five papers failed that way, and several cycle tests of six to twelve questions
  were read as 83. A page's answer now stops at 40 questions, and a number past 32, which no SRM paper uses, is
  dropped.
- **Papers that share a file were read whole.** 34 of the 118 papers live in a file with others: a bundle of old
  end-sems, a scan of several cycle tests. Each was read as the whole file, and only its first 8 pages, so a paper on
  pages 17 and 18 was scored against other papers' questions. Each is now read on its own pages, from the dataset's
  notes. The 8 whose notes don't say which pages are theirs are left out, which is why this run has 110 papers.
- **The time limit was shorter than an answer could be.** A page's answer may run to 4,096 tokens, about five
  minutes at the 13 tokens a second this Mac's model writes, but the call gave up after three. The limit now follows
  the cap.

I tried two more changes and dropped them: telling each page what the last question was worth, and telling it not to
count on past the page. Either one made the model climb the marks of the questions that followed (1, 2, 4, 5 for a
part of 1-mark questions), so a paper the reader had read perfectly lost a quarter of its marks.

Cycle tests are still the weak spot: 52.5% found, against 84.6% for end-sems. Some don't look like the end-sem
pattern the prompt describes, and the model falls back on that pattern. os-cla2-2023-a is six 10-mark questions
numbered B1 to B6; the reader returned an end-sem's layout instead (A1 to A20, B21, C26), so none of the six count as
found.

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
