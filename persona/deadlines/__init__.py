"""The deadline engine (docs/persona.md), ported from hearsay.

    messages (persona.sqlite) → prefilter → extract → track → resolve + verify → suggestions

It reads the messages the collectors stored, finds the dated items they
assert, folds every claim about one test into one item ("DAA FT-I", "CT 1"
and "FJ-I" can be the same test), picks each item's date by who said it
(faculty, then the CR, then a classmate; the latest within a rank), flags
moved and conflicting dates, and writes the upcoming ones to
<STUDY_DIR>/_src/persona_suggestions.json, which the study sync offers in the
app as Add or Move.

    python3 -m persona.deadlines run      one run (the orchestrator's `deadlines` job)
    python3 -m persona.deadlines show     the tracked items, with flags and sources
"""
