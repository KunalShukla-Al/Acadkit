// AcadKit Today: PersonaOS's home-screen widget (docs/persona.md), for the Scriptable app on iPhone.
//
// 1. On the Mac, `npm run persona -- widget` prints the widget's link.
// 2. In Scriptable, make a script named "AcadKit Today" with this text and paste the link below.
// 3. Add a Scriptable widget to the home screen, edit it, and pick this script.
//
// It shows what's due in the next three days, how many dates from my groups wait to be
// confirmed, and when the Mac last refreshed it (the "phone" job, every 30 minutes).

/* global ListWidget, Color, Font, Request, Script, config */

const LINK = "PASTE THE LINK FROM npm run persona -- widget";

const INK = new Color("#0b0b0b");
const LIME = new Color("#c6ff3d");
const WHITE = new Color("#f4f4f4");
const GREY = new Color("#8a8a8a");

function line(widget, text, size, color, bold = false) {
  const t = widget.addText(text);
  t.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  t.textColor = color;
  t.lineLimit = 1;
  return t;
}

async function build() {
  const w = new ListWidget();
  w.backgroundColor = INK;
  w.setPadding(12, 14, 12, 14);
  line(w, "AcadKit", 13, LIME, true);
  w.addSpacer(6);
  let data;
  try {
    data = await new Request(LINK).loadJSON();
  } catch {
    line(w, "Can't reach the Mac's feed", 12, WHITE);
    return w;
  }
  const rows = data.due.slice(0, config.widgetFamily === "small" ? 2 : 4);
  if (!rows.length) line(w, "Nothing due in three days", 12, WHITE);
  for (const r of rows) {
    const day = new Date(r.when).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
    line(w, `${day}  ${r.title}`, 12, WHITE);
  }
  if (data.unconfirmed) {
    w.addSpacer(4);
    line(w, `${data.unconfirmed} new from your groups`, 11, LIME);
  }
  w.addSpacer();
  const at = new Date(data.at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  line(w, `as of ${at}`, 9, GREY);
  w.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);
  return w;
}

build().then(async (w) => {
  if (config.runsInWidget) Script.setWidget(w);
  else await w.presentMedium();
  Script.complete();
});
