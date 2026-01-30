// Canvas and UI references
const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");
const nextCanvas = document.getElementById("next");
const nextCtx = nextCanvas.getContext("2d");

// Board geometry
const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const scoreEl = document.getElementById("score");
const levelEl = document.getElementById("level");
const linesEl = document.getElementById("lines");
const piecesEl = document.getElementById("pieces");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlay-title");
const overlaySub = document.getElementById("overlay-sub");
const leaderboard = document.getElementById("leaderboard");
const leaderboardForm = document.getElementById("leaderboard-form");
const leaderboardList = document.getElementById("leaderboard-list");
const playerNameInput = document.getElementById("player-name");
const leaderboardError = document.getElementById("leaderboard-error");
const submitScoreBtn = document.getElementById("submit-score");
const closeLeaderboardBtn = document.getElementById("close-leaderboard");
const closeLeaderboardListBtn = document.getElementById("close-leaderboard-list");

// Tetromino colors
const COLORS = {
  I: "#49c6ff",
  J: "#3b66ff",
  L: "#ff8b2f",
  O: "#f2d14b",
  S: "#50e08a",
  T: "#b970ff",
  Z: "#ff4c4c",
};

// Tetromino shapes (matrix representation)
const SHAPES = {
  I: [
    [0, 0, 0, 0],
    [1, 1, 1, 1],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ],
  J: [
    [1, 0, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  L: [
    [0, 0, 1],
    [1, 1, 1],
    [0, 0, 0],
  ],
  O: [
    [1, 1],
    [1, 1],
  ],
  S: [
    [0, 1, 1],
    [1, 1, 0],
    [0, 0, 0],
  ],
  T: [
    [0, 1, 0],
    [1, 1, 1],
    [0, 0, 0],
  ],
  Z: [
    [1, 1, 0],
    [0, 1, 1],
    [0, 0, 0],
  ],
};

// Game state
let board = createMatrix(COLS, ROWS);
let bag = [];
let current = null;
let next = null;
let dropCounter = 0;
let lastTime = 0;
let isPaused = false;
let isGameOver = false;

// Scoring state
let score = 0;
let lines = 0;
let level = 0;
let pieces = 0;
let combo = -1;
let backToBack = false;
let glowTimeout = null;
let submittedScore = false;
let lastSubmittedName = "";

// Create an empty board matrix
function createMatrix(w, h) {
  const matrix = [];
  for (let y = 0; y < h; y++) {
    matrix.push(new Array(w).fill(0));
  }
  return matrix;
}

// Create a new piece instance centered at the top
function createPiece(type) {
  const shape = SHAPES[type].map((row) => row.slice());
  return {
    type,
    shape,
    x: Math.floor(COLS / 2) - Math.ceil(shape[0].length / 2),
    y: -1,
    lastRotate: false,
  };
}

// 7-bag randomizer to match modern distribution
function refillBag() {
  const types = Object.keys(SHAPES);
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }
  bag = types.concat(bag);
}

function getNextPiece() {
  if (bag.length === 0) {
    refillBag();
  }
  return createPiece(bag.shift());
}

// Rotate a square matrix clockwise
function rotate(matrix) {
  const N = matrix.length;
  const result = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      result[x][N - 1 - y] = matrix[y][x];
    }
  }
  return result;
}

// Collision detection against borders and locked blocks
function collides(piece, offsetX = 0, offsetY = 0) {
  const { shape } = piece;
  for (let y = 0; y < shape.length; y++) {
    for (let x = 0; x < shape[y].length; x++) {
      if (shape[y][x] === 0) continue;
      const newX = x + piece.x + offsetX;
      const newY = y + piece.y + offsetY;
      if (newX < 0 || newX >= COLS || newY >= ROWS) return true;
      if (newY >= 0 && board[newY][newX]) return true;
    }
  }
  return false;
}

// Lock a piece into the board
function merge(piece) {
  piece.shape.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value && piece.y + y >= 0) {
        board[piece.y + y][piece.x + x] = piece.type;
      }
    });
  });
}

// Remove complete rows and return how many were cleared
function clearLines() {
  let cleared = 0;
  for (let y = ROWS - 1; y >= 0; y--) {
    if (board[y].every((cell) => cell !== 0)) {
      board.splice(y, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      y++;
    }
  }
  return cleared;
}

// True when the board is completely empty
function isPerfectClear() {
  return board.every((row) => row.every((cell) => cell === 0));
}

// T-Spin detection: T piece, last action was a rotation, 3 corners blocked
function isTSpin(piece) {
  if (piece.type !== "T") return false;
  if (!piece.lastRotate) return false;
  const cx = piece.x + 1;
  const cy = piece.y + 1;
  const corners = [
    [cx - 1, cy - 1],
    [cx + 1, cy - 1],
    [cx - 1, cy + 1],
    [cx + 1, cy + 1],
  ];
  let blocked = 0;
  corners.forEach(([x, y]) => {
    if (x < 0 || x >= COLS || y >= ROWS) {
      blocked++;
    } else if (y >= 0 && board[y][x]) {
      blocked++;
    }
  });
  return blocked >= 3;
}

// Apply scoring rules from regole.txt (line clears, T-Spins, B2B, combos, drops)
function applyScoring(cleared, tSpin) {
  const levelMultiplier = level + 1;
  let baseScore = 0;
  let b2bEligible = false;

  if (tSpin) {
    const tSpinScores = [400, 800, 1200, 1600];
    baseScore = tSpinScores[cleared] || 0;
    b2bEligible = true;
  } else {
    const lineScores = [0, 100, 300, 500, 800];
    baseScore = lineScores[cleared] || 0;
    b2bEligible = cleared === 4;
  }

  let total = baseScore * levelMultiplier;
  if (b2bEligible) {
    if (backToBack) {
      total = Math.floor(total * 1.5);
    }
    backToBack = true;
  } else if (cleared > 0) {
    backToBack = false;
  }

  if (cleared > 0) {
    combo++;
    if (combo > 0) {
      total += 50 * combo * levelMultiplier;
    }
  } else {
    combo = -1;
  }

  if (cleared > 0 && isPerfectClear()) {
    total += 2000 * levelMultiplier;
  }

  score += total;
  if (cleared === 4 && !tSpin) {
    triggerTetrisGlow();
  }
  if (cleared > 0) {
    lines += cleared;
    level = Math.floor(lines / 10);
  }
}

function triggerTetrisGlow() {
  if (glowTimeout) {
    clearTimeout(glowTimeout);
  }
  canvas.classList.remove("tetris-glow");
  void canvas.offsetWidth;
  canvas.classList.add("tetris-glow");
  glowTimeout = setTimeout(() => {
    canvas.classList.remove("tetris-glow");
    glowTimeout = null;
  }, 600);
}

// Finalize piece placement and scoring, then spawn the next
function lockPiece() {
  const tSpin = isTSpin(current);
  merge(current);
  const cleared = clearLines();
  if (cleared > 0 || tSpin) {
    applyScoring(cleared, tSpin);
  } else {
    combo = -1;
  }
  spawnPiece();
}

// Rendering helpers
function drawCell(x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK);
  ctx.strokeStyle = "#11181d";
  ctx.strokeRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK);
}

function drawBoard() {
  ctx.fillStyle = "#0b0e10";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (board[y][x]) {
        drawCell(x, y, COLORS[board[y][x]]);
      } else {
        ctx.strokeStyle = "#14181b";
        ctx.strokeRect(x * BLOCK, y * BLOCK, BLOCK, BLOCK);
      }
    }
  }
}

function drawPiece(piece) {
  piece.shape.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value && piece.y + y >= 0) {
        drawCell(piece.x + x, piece.y + y, COLORS[piece.type]);
      }
    });
  });
}

// Compute the ghost piece landing Y
function getGhostY(piece) {
  let ghostY = piece.y;
  while (!collides(piece, 0, ghostY - piece.y + 1)) {
    ghostY++;
  }
  return ghostY;
}

// Draw a soft “ghost” to preview landing position
function drawGhost(piece) {
  const ghostY = getGhostY(piece);
  ctx.save();
  ctx.globalAlpha = 0.25;
  piece.shape.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value && ghostY + y >= 0) {
        drawCell(piece.x + x, ghostY + y, COLORS[piece.type]);
      }
    });
  });
  ctx.restore();
}

// Draw next piece preview
function drawNext() {
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  if (!next) return;
  const size = next.shape.length;
  const block = nextCanvas.width / 4;
  const offsetX = (4 - size) / 2;
  const offsetY = (4 - size) / 2;

  next.shape.forEach((row, y) => {
    row.forEach((value, x) => {
      if (value) {
        nextCtx.fillStyle = COLORS[next.type];
        nextCtx.fillRect((x + offsetX) * block, (y + offsetY) * block, block, block);
        nextCtx.strokeStyle = "#11181d";
        nextCtx.strokeRect((x + offsetX) * block, (y + offsetY) * block, block, block);
      }
    });
  });
}

// Update scoreboard
function updateStats() {
  scoreEl.textContent = score;
  levelEl.textContent = level + 1;
  linesEl.textContent = lines;
  piecesEl.textContent = pieces;
}

// Spawn current piece and prepare the next
function spawnPiece() {
  if (!next) {
    next = getNextPiece();
  }
  current = next;
  next = getNextPiece();
  pieces++;
  if (collides(current)) {
    gameOver();
  }
  drawNext();
}

async function fetchLeaderboard() {
  const response = await fetch("/api/scores");
  if (!response.ok) return [];
  return response.json();
}

// Submit score to the server and show updated leaderboard.
async function submitScore() {
  if (submittedScore) return;
  submittedScore = true;
  leaderboardError.classList.add("hidden");
  leaderboardError.textContent = "";
  const rawName = playerNameInput.value.trim();
  if (!rawName) {
    leaderboardError.textContent = "Inserisci un nome per salvare il punteggio.";
    leaderboardError.classList.remove("hidden");
    submittedScore = false;
    return;
  }
  const normalizedName = rawName.slice(0, 18);
  lastSubmittedName = normalizedName;
  const response = await fetch("/api/scores", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: normalizedName, score }),
  });
  if (!response.ok) {
    if (response.status === 409) {
      leaderboardError.textContent = "Nome gia usato, scegline un altro.";
      leaderboardError.classList.remove("hidden");
    }
    submittedScore = false;
    return;
  }
  const payload = await response.json();
  renderLeaderboard(payload);
  leaderboardForm.classList.add("hidden");
  leaderboardList.classList.remove("hidden");
  closeLeaderboardListBtn.classList.remove("hidden");
}

// Render leaderboard list; supports API payload with { top, extra }.
function renderLeaderboard(data) {
  let scores = Array.isArray(data) ? data : data.top || [];
  const extra = Array.isArray(data) ? null : data.extra;
  const highlight = lastSubmittedName.trim().toLowerCase();
  leaderboardList.innerHTML = "";
  scores.forEach((entry, index) => {
    const li = document.createElement("li");
    const name = document.createElement("span");
    const value = document.createElement("span");
    const entryName = String(entry.name);
    name.textContent = `${index + 1}. ${entryName}`;
    if (highlight && entryName.toLowerCase() === highlight) {
      const you = document.createElement("span");
      you.textContent = " (Tu)";
      you.classList.add("leaderboard-you");
      name.appendChild(you);
    }
    value.textContent = entry.score;
    li.appendChild(name);
    li.appendChild(value);
    leaderboardList.appendChild(li);
  });

  if (extra && extra.rank) {
    const separator = document.createElement("li");
    separator.classList.add("leaderboard-separator");
    separator.textContent = "";
    leaderboardList.appendChild(separator);

    const li = document.createElement("li");
    const name = document.createElement("span");
    const value = document.createElement("span");
    const entryName = String(extra.name);
    name.textContent = `${extra.rank}. ${entryName}`;
    if (highlight && entryName.toLowerCase() === highlight) {
      const you = document.createElement("span");
      you.textContent = " (Tu)";
      you.classList.add("leaderboard-you");
      name.appendChild(you);
    }
    value.textContent = extra.score;
    li.appendChild(name);
    li.appendChild(value);
    leaderboardList.appendChild(li);
  }
}

async function openLeaderboard() {
  leaderboard.classList.remove("hidden");
  leaderboardForm.classList.remove("hidden");
  leaderboardList.classList.add("hidden");
  closeLeaderboardListBtn.classList.add("hidden");
  leaderboardError.classList.add("hidden");
  leaderboardError.textContent = "";
  lastSubmittedName = "";
  playerNameInput.value = "";
  playerNameInput.focus();
  submittedScore = false;
  const scores = await fetchLeaderboard();
  renderLeaderboard(scores);
}

function closeLeaderboard() {
  leaderboard.classList.add("hidden");
}

async function openLeaderboardPeek() {
  if (!leaderboard.classList.contains("hidden")) return;
  leaderboard.classList.remove("hidden");
  leaderboardForm.classList.add("hidden");
  leaderboardList.classList.remove("hidden");
  closeLeaderboardListBtn.classList.remove("hidden");
  const scores = await fetchLeaderboard();
  renderLeaderboard(scores);
}


// Gravity / soft drop step
function drop(isSoftDrop = false) {
  if (collides(current, 0, 1)) {
    lockPiece();
  } else {
    current.y++;
    if (isSoftDrop) {
      score += 1;
    }
  }
}

// Hard drop: instant fall with points per cell
function hardDrop() {
  let distance = 0;
  while (!collides(current, 0, 1)) {
    current.y++;
    distance++;
  }
  if (distance > 0) {
    score += distance * 2;
  }
  lockPiece();
}

// Horizontal movement
function move(dir) {
  if (!collides(current, dir, 0)) {
    current.x += dir;
    current.lastRotate = false;
  }
}

// Rotate with simple wall-kick
function rotateCurrent() {
  const rotated = rotate(current.shape);
  const oldShape = current.shape;
  current.shape = rotated;
  if (collides(current)) {
    if (!collides(current, -1, 0)) {
      current.x -= 1;
    } else if (!collides(current, 1, 0)) {
      current.x += 1;
    } else {
      current.shape = oldShape;
      return;
    }
  }
  current.lastRotate = true;
}

// Falling speed based on current level
function speedForLevel() {
  const base = 800;
  const step = 60;
  return Math.max(100, base - level * step);
}

// Main loop
function update(time = 0) {
  if (isPaused || isGameOver) {
    lastTime = time;
    requestAnimationFrame(update);
    return;
  }

  const delta = time - lastTime;
  lastTime = time;
  dropCounter += delta;
  if (dropCounter > speedForLevel()) {
    drop();
    dropCounter = 0;
  }

  drawBoard();
  if (current) {
    drawGhost(current);
    drawPiece(current);
  }
  updateStats();
  requestAnimationFrame(update);
}

// Reset full game state
function resetGame() {
  board = createMatrix(COLS, ROWS);
  bag = [];
  score = 0;
  lines = 0;
  level = 0;
  pieces = 0;
  combo = -1;
  backToBack = false;
  submittedScore = false;
  isGameOver = false;
  overlay.classList.add("hidden");
  leaderboard.classList.add("hidden");
  next = null;
  spawnPiece();
}

// Pause handling
function togglePause() {
  if (isGameOver) return;
  isPaused = !isPaused;
  overlay.classList.toggle("hidden", !isPaused);
  overlayTitle.textContent = isPaused ? "PAUSA" : "";
  overlaySub.textContent = isPaused ? "Premi P per continuare" : "";
  if (isPaused) {
    closeLeaderboard();
  }
}

// Game over overlay
function gameOver() {
  isGameOver = true;
  overlay.classList.remove("hidden");
  overlayTitle.textContent = "GAME OVER";
  overlaySub.textContent = "Premi R per ricominciare";
  openLeaderboard();
}

// Input handling
document.addEventListener("keydown", (event) => {
  if (!leaderboard.classList.contains("hidden")) {
    if (event.key === "Enter") {
      submitScore();
    }
    return;
  }
  if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", "Space"].includes(event.code)) {
    event.preventDefault();
  }
  if (event.code === "KeyP") {
    togglePause();
    return;
  }
  if (event.code === "KeyF") {
    toggleFullscreen();
    return;
  }
  if (event.code === "KeyR") {
    resetGame();
    return;
  }
  if (isPaused || isGameOver) return;

  switch (event.code) {
    case "ArrowLeft":
      move(-1);
      break;
    case "ArrowRight":
      move(1);
      break;
    case "ArrowDown":
      drop(true);
      dropCounter = 0;
      break;
    case "ArrowUp":
      rotateCurrent();
      break;
    case "Space":
      hardDrop();
      dropCounter = 0;
      break;
    default:
      break;
  }
});

submitScoreBtn.addEventListener("click", submitScore);
playerNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    submitScore();
  }
});
closeLeaderboardBtn.addEventListener("click", closeLeaderboard);
closeLeaderboardListBtn.addEventListener("click", closeLeaderboard);

// Fullscreen toggle (bind to F)
async function toggleFullscreen() {
  if (document.fullscreenElement) {
    await document.exitFullscreen();
  } else {
    await document.documentElement.requestFullscreen();
  }
}

resetGame();
requestAnimationFrame(update);
