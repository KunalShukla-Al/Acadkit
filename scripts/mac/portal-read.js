// The portals' read for PersonaOS (persona/portal.py), run by portal-read.sh with
// `/usr/bin/osascript -l JavaScript`. It never logs in and never opens, moves or reloads a tab:
// in a Student Portal tab and an Academia tab I'm already signed in to, it fetches the pages in
// the background through my own session and prints them as JSON. Chrome needs
// View > Developer > Allow JavaScript from Apple Events.

// In the Student Portal tab: attendance (form 9) and internal marks (form 13), posted the way the
// portal's own menu posts them (funShow), with the page's form details and CSRF salt.
const PORTAL = `(function () {
  var f = document.getElementById("userHomePage");
  if (!f) return JSON.stringify({ login: true });
  var value = function (n) { return (f.elements[n] || {}).value || ""; };
  var read = function (iden, page) {
    var x = new XMLHttpRequest();
    x.open("POST", "/srmiststudentportal/students/report/" + page, false);
    x.setRequestHeader("Content-Type", "application/x-www-form-urlencoded");
    x.send(new URLSearchParams({ iden: String(iden), filter: "", hdnFormDetails: value("hdnFormDetails"), csrfPreventionSalt: value("csrfPreventionSalt") }).toString());
    return { status: x.status, text: x.responseText };
  };
  var a = read(9, "studentAttendanceDetails.jsp");
  if (a.status !== 200 || /LoginServlet|youLogin/.test(a.text)) return JSON.stringify({ login: true });
  var m = read(13, "studentInternalMarkDetails.jsp");
  return JSON.stringify({ attendance: a.text, marks: m.status === 200 ? m.text : "" });
})()`;

// In the Academia tab: my timetable and the two latest academic planners, found by the menu's links.
const ACADEMIA = `(function () {
  var links = Array.prototype.map.call(document.querySelectorAll('a[href^="#Page:"]'), function (a) { return a.getAttribute("href").slice(6); });
  if (!links.length) return JSON.stringify({ login: true });
  var get = function (page) {
    var x = new XMLHttpRequest();
    x.open("GET", "/srm_university/academia-academic-services/page/" + page, false);
    x.send();
    return x.status === 200 ? x.responseText : "";
  };
  var timetable = links.filter(function (p) { return /^My_Time_Table/i.test(p); })[0];
  var planners = links.filter(function (p) { return /^Academic_Planner/i.test(p); }).slice(0, 2);
  return JSON.stringify({
    timetable: timetable ? get(timetable) : "",
    planners: planners.map(function (p) { return { name: p, html: get(p) }; })
  });
})()`;

function tabOn(chrome, pattern) {
  for (const win of chrome.windows()) for (const tab of win.tabs()) if (pattern.test(tab.url())) return tab;
  return null;
}

function readTab(chrome, pattern, script) {
  const tab = tabOn(chrome, pattern);
  if (!tab) return { tab: false };
  try {
    return JSON.parse(tab.execute({ javascript: script }));
  } catch (err) {
    return { error: String(err.message || err) };
  }
}

// osascript calls run().
function run() {
  const chrome = Application("Google Chrome");
  if (!chrome.running()) return JSON.stringify({ error: "Chrome isn't open" });
  return JSON.stringify({
    at: new Date().toISOString(),
    portal: readTab(chrome, /^https:\/\/sp\.srmist\.edu\.in\/srmiststudentportal\/students\//, PORTAL),
    academia: readTab(chrome, /^https:\/\/academia\.srmist\.edu\.in\//, ACADEMIA),
  });
}
