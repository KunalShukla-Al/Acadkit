# How Everything connected decides a link

Under a page of notes, a slide, a past-paper question or a moment of a lecture, one line lists
where else the same thing turns up. Each part of the line opens that item. This page says how my
Mac picks them, and how far to trust them.

## What can link to what

| Kind | One of them is |
| --- | --- |
| Page | a page of a course's notes, PDFs and documents that aren't slides |
| Slide | a slide of one of the course's decks |
| Question | a question from a past paper I labelled |
| Moment | about a minute of a recorded lecture |
| Board photo | the writing on a photo of the board |

An item links only within its own course.

## Two reasons for a link

**By time.** A moment of a lecture links to the slide that was on screen then, as the recorder
lined them up. A board photo links to the lecture moment nearest when it was taken, and to that
moment's slide. Time links come first in the line: they say what happened in that class.

**By meaning.** The Mac turns every item's text into a vector with the same model study search
uses, so text about the same idea lands close together. Each item then links to the nearest two
items of each other kind in its course, but only when they're close enough: 0.40 or more on a
scale where the course's average item sits at zero. Measuring against the course's average, not
against zero, stops every OS slide looking like every other OS slide.

## How far to trust it

Of 100 links by meaning drawn at random from the ones the app shows, 73 were right, meaning the
linked item covers the idea the other is about, not just the same unit ([EVAL.md](../EVAL.md)).
The wrong ones are mostly a neighbouring idea in the same unit, like the schedulers for a question
about the dispatcher, or another method of the same kind, like the full Fourier transform for a
sine transform. The links were judged by Claude reading both items, not by me.

Time links aren't judged: they're as good as the recorder's lining up, which on three stand-in
lectures put about half the moments on the right slide or the one beside it.

## When it's built

The sync rebuilds the links when the study files, the lecture transcripts or the code that builds
them change, and sends them to the app with the rest of the folder. The app loads only the course
on screen. Vectors are cached by content, so a rebuild after a small change takes seconds; the
first build of my Sem 3 folder took 19 minutes.
