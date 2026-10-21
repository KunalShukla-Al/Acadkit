# Class recorder

I record a lecture with Voice Memos on my iPhone. My Mac picks the recording up through iCloud,
works out which class it was, transcribes it, and lines the transcript up with that class's
slides. The app shows the transcript slide by slide, and search finds what was said. The audio
never leaves the Mac.

Recording a class needs the teacher's permission, so the recorder stays off until I turn it on.

## Setup

1. Turn on Voice Memos under iCloud, on the iPhone and on the Mac. A memo then appears on the Mac
   a minute or so after I stop recording.
2. Give `/bin/bash` Full Disk Access (System Settings → Privacy & Security). The tick already has
   it for the study folder; Voice Memos' folder needs it too.
3. Install whisper.cpp and its model (1.6 GB):
   ```bash
   brew install whisper-cpp
   node -v    # a brew install has broken node before; check it still runs
   mkdir -p "$HOME/Library/Application Support/AcadKit/whisper"
   curl -L -o "$HOME/Library/Application Support/AcadKit/whisper/ggml-large-v3-turbo.bin" \
     https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin
   ```
4. The embedder, if search isn't set up yet: `npm ci --prefix scripts/embedder`.
5. In `.env.local`:
   ```bash
   RECORDER=on
   RECORDER_LANG=auto   # optional: for a class that mixes in Hindi (English by default)
   ```

The recorder runs inside the tick's `npm run sync:app`, so nothing else needs starting. Without
whisper or the model, it says what's missing in the sync log and waits.

## What happens to a recording

1. **Picked up.** At the first tick after iCloud has finished writing it, one memo a tick. Its
   start time comes from the memo's file name, which Voice Memos sets when recording starts.
2. **Matched to its class.** The class on that day's Day Order that the recording overlaps most,
   as long as it covers half the class or the class covers half of it. A recording out of class
   hours has no class, and so no slides.
3. **Transcribed.** whisper.cpp, large-v3-turbo, on the Mac's GPU. Thirteen minutes of speech take
   about 70 seconds on my Mac, so a 50-minute lecture takes four or five minutes.
4. **Lined up with slides.** The transcript is cut into moments of about a minute. Of the course's
   decks under `02_Notes` (every `.pptx` and `.ppt`, and PDFs named as slides), the lecture
   follows the one its moments match best. The moments take its slides in order. A moment that
   matches no slide well is talk off the slides. On three stand-in lectures, it chose the right
   deck every time and put 43% of moments on the right slide, 51% within a page
   ([EVAL.md](../EVAL.md)).
5. **Sent to the app.** The lecture and its moments, with each moment's text, slide and search
   vector.

## In the app

- A subject's page lists its recorded lectures.
- A lecture opens as its transcript, in runs on one slide. "Slide 24" opens the deck in the
  viewer at that page.
- Searching inside files also finds what was said in class, and a hit opens the transcript at
  that moment. A subject's search finds only its own lectures.

## Privacy

- The audio stays in Voice Memos. The recorder reads it there and never copies it.
- The Mac keeps, in `~/Library/Application Support/AcadKit/recorder/`:
  - `seen.json`: each memo handled, its class and how it went.
  - `transcripts/<memo>.json`: whisper's timed text, the moments and their vectors.
  - `synced.json`: which transcripts the app has.
- My Supabase project gets each lecture (date, class, deck, length) and its moments (text, slide,
  vector). Never the audio, and never whisper's timed segments.
- Deleting the `recorder` folder forgets it all on the Mac. The app has no delete for a lecture
  yet; removing its row from `lectures` in Supabase takes its moments with it.

## Checking on it

- The sync log (`~/Library/Logs/AcadKit/study-sync.log`) has a `Recorder:` line for each memo:
  its length, class, words, and how many moments landed on a slide.
- `npm run test:recorder` runs the recorder on a short sample lecture through the real
  whisper.cpp.
- `npm run recorder:eval` measures the slide alignment on three stand-in lectures and writes the
  scores into [EVAL.md](../EVAL.md).

## Limits

- One memo a tick, so a backlog of recordings takes a few ticks to clear.
- Slides only go forward. When a teacher flips back to an earlier slide, its moments go to the
  later one, or to none.
- A moment is a minute, so it can span two slides; it gets the one it matches better.
- Neighbouring slides on one topic (three slides of one worked example) are what it confuses
  most, and a minute that is half aside often still gets a slide.
- Lab classes seldom have decks, so their transcripts mostly have no slides.
