// Simple HTTP server with JSON file persistence for leaderboard scores.
const http = require("http");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const { URL } = require("url");

const ROOT = __dirname;
const SCORES_PATH = path.join(ROOT, "scores.json");
const PORT = process.env.PORT || 3000;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

async function ensureScoresFile() {
  try {
    await fsp.access(SCORES_PATH, fs.constants.F_OK);
  } catch {
    await fsp.writeFile(SCORES_PATH, JSON.stringify([], null, 2));
  }
}

async function readScores() {
  await ensureScoresFile();
  const raw = await fsp.readFile(SCORES_PATH, "utf8");
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeScores(scores) {
  await fsp.writeFile(SCORES_PATH, JSON.stringify(scores, null, 2));
}

function sanitizeName(name) {
  if (!name || typeof name !== "string") return "";
  const clean = name.trim().slice(0, 18);
  return clean;
}

function isDuplicateName(scores, name) {
  const key = name.toLowerCase();
  return scores.some((entry) => String(entry.name).toLowerCase() === key);
}

function topTen(scores) {
  return scores
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

function rankForName(scores, name) {
  const sorted = scores.slice().sort((a, b) => b.score - a.score);
  const key = name.toLowerCase();
  const index = sorted.findIndex((entry) => String(entry.name).toLowerCase() === key);
  return index === -1 ? null : index + 1;
}

// API: GET /api/scores (top 10), POST /api/scores (save + return top + optional extra rank)
async function handleApi(req, res, url) {
  if (url.pathname === "/api/scores" && req.method === "GET") {
    const scores = await readScores();
    const payload = topTen(scores);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
    return true;
  }

  if (url.pathname === "/api/scores" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", async () => {
      try {
        const data = JSON.parse(body || "{}");
        const name = sanitizeName(data.name);
        if (!name) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "name_required" }));
          return;
        }
        const score = Number.isFinite(data.score) ? Math.max(0, Math.floor(data.score)) : 0;
        const scores = await readScores();
        if (isDuplicateName(scores, name)) {
          res.writeHead(409, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "duplicate_name" }));
          return;
        }
        scores.push({ name, score, time: Date.now() });
        await writeScores(scores);
        const top = topTen(scores);
        const rank = rankForName(scores, name);
        const payload = {
          top,
          extra: rank && rank > 10 ? { rank, name, score } : null,
        };
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(JSON.stringify(payload));
      } catch {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "invalid_json" }));
      }
    });
    return true;
  }

  return false;
}

async function serveStatic(req, res, url) {
  let filePath = url.pathname === "/" ? "/index.html" : url.pathname;
  filePath = path.normalize(filePath).replace(/^\.\.(\\|\/)/, "");
  const fullPath = path.join(ROOT, filePath);

  try {
    const stat = await fsp.stat(fullPath);
    if (stat.isDirectory()) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    const stream = fs.createReadStream(fullPath);
    res.writeHead(200, { "Content-Type": type });
    stream.pipe(res);
  } catch {
    res.writeHead(404);
    res.end("Not Found");
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (await handleApi(req, res, url)) {
    return;
  }

  await serveStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log(`Tetris Web server running on http://localhost:${PORT}`);
});
