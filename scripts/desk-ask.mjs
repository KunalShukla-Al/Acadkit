/**
 * Ask Claude from the phone (docs/desk.md): answers the Desk's questions on
 * this Mac with Claude Code, read-only in the study folder, on the Claude
 * plan it is signed in with. Kept running by com.acadkit.deskask (npm run mac:install).
 *
 *   <pin>/inbox/ask/<id>.json   a question from the phone (src/api/desk.ts)
 *   <pin>/ask/<id>.json         its answer, rewritten as it streams in
 *   <pin>/ask/heartbeat.json    when this last looked, so the phone knows the Mac is here
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { macClient } from "./lib/mac-client.mjs";
import { studyRoots } from "./lib/roots.mjs";

const BUCKET = "study-files";
const POLL_MS = 3000;
const BEAT_MS = 60_000;
const WRITE_MS = 1500;
const MAX_RUNNING = 2;
const TIMEOUT_MS = 6 * 60_000;

const PROMPT = `You answer questions from my AcadKit Desk, sent from my phone about one past-paper question. \
I'm a B.Tech CSE (Data Science) student at SRM KTR. SRM papers have one-mark MCQs, 8-mark answers and 15-mark answers.
Lead with the answer, like a good tutor. For numericals, show the method step by step. For written answers, give an \
exam-ready structure: definition, the diagram described in words, the algorithm or code, a worked example. Keep it \
short unless I ask for more. The working directory is my study folder: notes, past papers and analyses. Open them when \
the answer depends on my course's notes or a past paper; the message names the paper and page. You can only read files.
Plain text and Markdown only (lists, code blocks, tables). Write maths in plain text, like x^2 or sqrt(x); never LaTeX.`;

const env = process.env;
const pin = env.STUDY_PIN;
if (!env.VITE_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !/^\d{4}$/.test(pin ?? "")) {
  console.error("desk-ask: add VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and STUDY_PIN to .env.local");
  process.exit(1);
}
const bucket = macClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY).storage.from(BUCKET);
const { dir, extras } = studyRoots();
const CLAUDE = [path.join(homedir(), ".local/bin/claude"), "/opt/homebrew/bin/claude", "/usr/local/bin/claude"].find(existsSync);

const log = (...a) => console.log(new Date().toISOString(), "desk-ask:", ...a);
const put = (key, body) => bucket.upload(key, JSON.stringify(body), { contentType: "application/json", upsert: true, cacheControl: "0" });

/** The study folder a question's course lives in: Sem 4's courses in the next semester's folder. */
function folderFor(item) {
  const course = String(item ?? "").split("/")[0];
  if (course === "OS") return dir;
  return extras.find((x) => /Sem4$/i.test(x.dir))?.dir ?? dir;
}

/** The phone's thread so far and the new question, as one prompt. */
function fullPrompt(req) {
  const earlier = (req.thread ?? []).map((t) => `${t.role === "user" ? "Me" : "You"}: ${t.text}`).join("\n\n");
  return earlier ? `Our conversation so far:\n\n${earlier}\n\nNow:\n${req.prompt}` : req.prompt;
}

function answer(req) {
  return new Promise((resolve) => {
    const key = `${pin}/ask/${req.id}.json`;
    const out = { id: req.id, text: "", status: "Thinking", done: false, error: null, at: Date.now() };
    if (!CLAUDE) {
      void put(key, { ...out, done: true, error: "Claude Code isn't installed on the Mac." }).then(resolve);
      return;
    }
    const child = spawn(
      CLAUDE,
      ["-p", fullPrompt(req), "--output-format", "stream-json", "--include-partial-messages", "--verbose",
        "--tools", "Read,Grep,Glob", "--setting-sources", "project", "--strict-mcp-config", "--disable-slash-commands",
        "--append-system-prompt", PROMPT],
      { cwd: folderFor(req.item), stdio: ["ignore", "pipe", "pipe"], env: { ...env, PATH: `${path.dirname(CLAUDE)}:/opt/homebrew/bin:/usr/bin:/bin` } }
    );
    let buf = "";
    let dirty = true;
    let stderr = "";
    const flush = async () => {
      if (!dirty) return;
      dirty = false;
      out.at = Date.now();
      await put(key, out);
    };
    const timer = setInterval(() => void flush(), WRITE_MS);
    const kill = setTimeout(() => child.kill(), TIMEOUT_MS);
    child.stdout.on("data", (d) => {
      buf += d;
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        let e;
        try {
          e = JSON.parse(line);
        } catch {
          continue;
        }
        if (e.type === "stream_event" && e.event?.type === "content_block_delta" && e.event.delta?.type === "text_delta") {
          out.text += e.event.delta.text;
          out.status = "Writing";
          dirty = true;
        } else if (e.type === "assistant") {
          for (const b of e.message?.content ?? []) {
            if (b.type !== "tool_use") continue;
            out.status = b.name === "Read" ? `Reading ${path.basename(b.input?.file_path ?? "a file")}` : b.name === "Grep" ? `Searching your notes for “${b.input?.pattern ?? ""}”` : "Looking through your study folder";
            dirty = true;
          }
        } else if (e.type === "result") {
          if (e.is_error) out.error = String(e.result ?? "Claude couldn't answer.");
          else if (!out.text && e.result) out.text = String(e.result);
          out.done = true;
          dirty = true;
        }
      }
    });
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", async () => {
      clearInterval(timer);
      clearTimeout(kill);
      if (!out.done) {
        out.done = true;
        out.error = stderr.trim().split("\n").slice(-2).join(" ") || "It stopped without an answer.";
      }
      out.status = null;
      dirty = true;
      await flush();
      resolve();
    });
  });
}

const running = new Set();

async function poll() {
  const { data, error } = await bucket.list(`${pin}/inbox/ask`, { limit: 100, sortBy: { column: "created_at", order: "asc" } });
  if (error) return log("couldn't list the inbox:", error.message);
  for (const o of data ?? []) {
    if (!o.id || !o.name.endsWith(".json") || running.has(o.name) || running.size >= MAX_RUNNING) continue;
    running.add(o.name);
    const key = `${pin}/inbox/ask/${o.name}`;
    void (async () => {
      try {
        const { data: blob, error: dlErr } = await bucket.download(key);
        if (dlErr) throw new Error(dlErr.message);
        const req = JSON.parse(await blob.text());
        if (!/^[A-Za-z0-9_-]{1,160}$/.test(req.id ?? "") || typeof req.prompt !== "string") throw new Error("not a question");
        log(`answering ${req.id}`);
        await answer({ ...req, prompt: req.prompt.slice(0, 8000) });
      } catch (e) {
        log(`skipped ${o.name}: ${e.message}`);
      } finally {
        await bucket.remove([key]);
        running.delete(o.name);
      }
    })();
  }
}

let lastBeat = 0;
log(`listening for ${pin}/inbox/ask every ${POLL_MS / 1000} s${CLAUDE ? "" : " (no claude found)"}`);
for (;;) {
  if (Date.now() - lastBeat > BEAT_MS) {
    lastBeat = Date.now();
    await put(`${pin}/ask/heartbeat.json`, { at: lastBeat });
  }
  await poll().catch((e) => log(e.message));
  await new Promise((r) => setTimeout(r, POLL_MS));
}
