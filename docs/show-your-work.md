# How Show your work builds an explainer

A number with a dotted underline can show how it was worked out. Tap it and a short animation
plays the sum, step by step, from my own data: the classes stacking up, the 75% line coming in,
the margin that's left.

## Which numbers

| On | Tap | It shows |
| --- | --- | --- |
| Marks | the predicted SGPA | each subject's grade points times its credits, added and divided |
| Attendance | a subject's percentage, classes to spare or to make up | where the count comes from, the percentage, and the sum that keeps it at the bar |
| Marks → Targets | the marks a grade needs | what's banked, where the grade starts, what's still to play for, and the share it needs |
| Skips, from the corner | a day's free or needed label | each class that day, and whether missing it holds the bar |

Grade odds have an explainer too, though no number on screen opens it yet.

## From a number to a scene

1. **The working.** Each calculation in `packages/core` has a twin that returns the same number
   with its working: a list of steps, each a sentence that reads on its own, its sum if it has
   one, and the figures it used, by name. The number and the explainer can't disagree, because
   the twin is the same calculation.
2. **The scene.** Each kind of number has a scene that draws those figures on a small stage:
   attendance as a grid of classes, then a bar filling to the percentage; the SGPA as a bar per
   subject, as wide as its credits; marks needed on a 0–100 scale with the gap to the grade.
3. **The player.** It shows a step at a time, for as long as its sentence takes to read (2.5 to 9
   seconds), and moves the shapes into place. Back, Pause, Next and a dot per step take over.

The working and the scenes load only when a number is tapped, so the screens don't carry them.

## Captions, voice and video

- **Captions** come in a word at a time under the scene, never over it. CC turns them off, and the
  phone remembers.
- **The voice** is off until I turn it on. It's the phone's own speech, with a voice that runs on
  the device (Indian English first), so nothing is sent anywhere to be spoken.
- **Make a video** records the explainer from the start, with the sentence drawn under each step,
  as an MP4 where the browser can make one and a WebM where it can't. **Save video** then saves
  it; on an iPhone, that opens the share sheet.
- **Reduced motion** (Settings → Accessibility → Motion) turns the animation into stills: every
  step at once, to read at my own pace.
