/**
 * The Study page's "This week" and "Projects" cards, from two files in the
 * study folder's _src that the sync checks and sends on:
 *
 * - acadkit_notices.json: short notices from the weekly scan that aren't
 *   deadlines ("FT-3 portion is Unit 4 + half of Unit 5", "bring the record
 *   notebook"). Each has an end date and leaves the app on its own after it.
 * - acadkit_projects.json: where each of my projects stands, its next step,
 *   and the to-dos that are mine to do.
 *
 * Each check returns the body to upload plus warnings for what it dropped,
 * so one bad entry never hides the rest.
 */

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const isDay = (s) => typeof s === "string" && DAY.test(s) && !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime());
const text = (s) => (typeof s === "string" ? s.trim() : "");
const https = (s) => (typeof s === "string" && /^https:\/\/\S+$/.test(s.trim()) ? s.trim() : null);

/**
 * `{ notices: [{ subject_code, text, source, posted, until, file }] }`.
 * `text` and `until` are required; `file` must be a path the sync knows.
 */
export function checkNotices(data, known) {
  const warnings = [];
  const notices = [];
  for (const [i, n] of (data?.notices ?? []).entries()) {
    const what = `notice ${i + 1}${n?.subject_code ? ` (${n.subject_code})` : ""}`;
    if (!text(n?.text)) {
      warnings.push(`${what}: needs text`);
      continue;
    }
    if (!isDay(n.until)) {
      warnings.push(`${what}: needs an end date, "until": "YYYY-MM-DD"`);
      continue;
    }
    let file = text(n.file) || null;
    if (file && !known.has(file)) {
      warnings.push(`${what}: no such file ${file}, shown without it`);
      file = null;
    }
    notices.push({
      subject_code: text(n.subject_code) || null,
      text: text(n.text),
      source: text(n.source) || null,
      posted: isDay(n.posted) ? n.posted : null,
      until: n.until,
      file,
    });
  }
  return { body: { version: 1, generatedAt: Date.now(), notices }, warnings };
}

const STATES = new Set(["active", "waiting", "paused", "done"]);

/**
 * `{ updated, projects: [{ name, state, status, next, url }], todos: [{ text, project, due }] }`.
 * A project needs a name and a status line; a to-do needs its text.
 */
export function checkProjects(data) {
  const warnings = [];
  const projects = [];
  for (const [i, p] of (data?.projects ?? []).entries()) {
    if (!text(p?.name) || !text(p?.status)) {
      warnings.push(`project ${i + 1}: needs a name and a status`);
      continue;
    }
    projects.push({
      name: text(p.name),
      state: STATES.has(p.state) ? p.state : "active",
      status: text(p.status),
      next: text(p.next) || null,
      url: https(p.url),
    });
  }
  const todos = [];
  for (const [i, t] of (data?.todos ?? []).entries()) {
    if (!text(t?.text)) {
      warnings.push(`to-do ${i + 1}: needs text`);
      continue;
    }
    if (t.due != null && !isDay(t.due)) warnings.push(`to-do ${i + 1}: due must be YYYY-MM-DD, shown without it`);
    todos.push({ text: text(t.text), project: text(t.project) || null, due: isDay(t.due) ? t.due : null });
  }
  return {
    body: { version: 1, generatedAt: Date.now(), updated: isDay(data?.updated) ? data.updated : null, projects, todos },
    warnings,
  };
}
