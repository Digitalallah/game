// «Котогроза» — маленький 8-bit platformer без библиотек.
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const W = 256;
const H = 256;
const SCALE = 4;
const GRAVITY = 0.34;
const keys = new Set();

const platforms = [
  { x: 0, y: 222, w: 256, h: 34 },
  { x: 18, y: 184, w: 58, h: 9 },
  { x: 92, y: 170, w: 72, h: 9 },
  { x: 178, y: 186, w: 58, h: 9 },
  { x: 34, y: 132, w: 64, h: 9 },
  { x: 130, y: 118, w: 70, h: 9 },
  { x: 52, y: 82, w: 58, h: 9 },
  { x: 155, y: 74, w: 76, h: 9 }
];

const state = {
  player: null,
  score: 0,
  best: Number(localStorage.getItem("kotogrozaBest") || 0),
  lives: 3,
  time: 0,
  paused: false,
  gameOver: false,
  lightning: null,
  nextLightning: 1.5,
  fishes: [],
  riskText: 0,
  rain: [],
  cameraShake: 0
};

function reset() {
  state.player = { x: 28, y: 184, w: 16, h: 24, vx: 0, vy: 0, facing: 1, grounded: false, inv: 0 };
  state.score = 0;
  state.lives = 3;
  state.time = 0;
  state.paused = false;
  state.gameOver = false;
  state.lightning = null;
  state.nextLightning = 1.2;
  state.fishes = [];
  state.riskText = 0;
  state.cameraShake = 0;
  spawnFish(false);
}

for (let i = 0; i < 80; i++) {
  state.rain.push({ x: Math.random() * W, y: Math.random() * H, s: 1 + Math.random() * 2 });
}

addEventListener("keydown", (e) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) e.preventDefault();
  keys.add(e.key.toLowerCase());
  if (e.key.toLowerCase() === "p" && !state.gameOver) state.paused = !state.paused;
  if (e.key.toLowerCase() === "r") reset();
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function choice(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function safeTopFor(platform) {
  return { x: platform.x + 6 + Math.random() * Math.max(1, platform.w - 20), y: platform.y };
}

function spawnFish(risky, target = null) {
  const p = target || safeTopFor(choice(platforms));
  const fish = { x: p.x, y: p.y - 9, w: 11, h: 6, risky, alive: true };
  if (!risky) state.fishes.push(fish);
  else state.fishes = state.fishes.filter((f) => !f.risky).concat(fish);
}

function startLightning() {
  const platform = choice(platforms);
  const p = safeTopFor(platform);
  state.lightning = { x: Math.max(8, Math.min(W - 8, p.x)), y: p.y, w: 20, warning: 1, strike: 0, hit: false, flicker: 0 };
  spawnFish(true, { x: Math.max(8, Math.min(W - 16, p.x + (Math.random() < 0.5 ? -18 : 18))), y: p.y });
}

function update(dt) {
  if (state.paused || state.gameOver) return;
  state.time += dt;
  state.score += dt * 3;
  state.riskText = Math.max(0, state.riskText - dt);
  state.cameraShake = Math.max(0, state.cameraShake - dt);
  if (state.player.inv > 0) state.player.inv -= dt;

  updatePlayer(dt);
  updateFishes();
  updateLightning(dt);

  if (!state.fishes.some((f) => !f.risky) && Math.random() < 0.012) spawnFish(false);
  state.best = Math.max(state.best, Math.floor(state.score));
  localStorage.setItem("kotogrozaBest", state.best);
}

function updatePlayer(dt) {
  const p = state.player;
  const left = keys.has("arrowleft") || keys.has("a");
  const right = keys.has("arrowright") || keys.has("d");
  const jump = keys.has(" ") || keys.has("arrowup") || keys.has("w");
  p.vx = (right - left) * 1.55;
  if (p.vx) p.facing = Math.sign(p.vx);
  if (jump && p.grounded) {
    p.vy = -6.2;
    p.grounded = false;
  }
  p.vy += GRAVITY;
  p.x += p.vx;
  p.x = Math.max(3, Math.min(W - p.w - 3, p.x));
  p.y += p.vy;
  p.grounded = false;

  for (const plat of platforms) {
    if (overlaps(p, plat) && p.vy >= 0 && p.y + p.h - p.vy <= plat.y + 2) {
      p.y = plat.y - p.h;
      p.vy = 0;
      p.grounded = true;
    }
  }
  if (p.y > H + 20) hurtPlayer();
}

function updateFishes() {
  for (const f of state.fishes) {
    if (f.alive && overlaps(state.player, f)) {
      f.alive = false;
      if (f.risky) {
        const late = state.lightning && state.lightning.warning < 0.35;
        state.score += late ? 100 : 50;
        if (late) state.riskText = 1;
      } else {
        state.score += 10;
      }
    }
  }
  state.fishes = state.fishes.filter((f) => f.alive);
}

function updateLightning(dt) {
  if (!state.lightning) {
    state.nextLightning -= dt;
    if (state.nextLightning <= 0) startLightning();
    return;
  }
  const l = state.lightning;
  l.flicker += dt;
  if (l.warning > 0) {
    l.warning -= dt;
    return;
  }
  l.strike += dt;
  state.cameraShake = 0.18;
  const bolt = { x: l.x - l.w / 2, y: 0, w: l.w, h: l.y + 18 };
  if (!l.hit && overlaps(state.player, bolt)) {
    l.hit = true;
    hurtPlayer();
  }
  if (l.strike > 0.34) {
    state.lightning = null;
    state.nextLightning = 1.4 + Math.random() * 1.2;
  }
}

function hurtPlayer() {
  const p = state.player;
  if (p.inv > 0) return;
  state.lives -= 1;
  p.inv = 1.5;
  p.vy = -4;
  p.x = Math.max(8, p.x - p.facing * 10);
  state.cameraShake = 0.35;
  if (state.lives <= 0) {
    state.gameOver = true;
    state.best = Math.max(state.best, Math.floor(state.score));
    localStorage.setItem("kotogrozaBest", state.best);
  }
}

function draw() {
  ctx.save();
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.clearRect(0, 0, W, H);
  if (state.cameraShake > 0) ctx.translate((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
  drawBackground();
  drawPlatforms();
  drawFishes();
  drawLightning();
  drawCat(state.player);
  drawHud();
  if (state.paused) drawCenterText("ПАУЗА", "P — ПРОДОЛЖИТЬ");
  if (state.gameOver) drawCenterText("ИГРА ОКОНЧЕНА", "R — ЗАНОВО");
  if (state.riskText > 0) drawPixelText("РИСК!", 106, 104, "#ffcf4a", 2);
  ctx.restore();
  requestAnimationFrame(draw);
}

function drawBackground() {
  ctx.fillStyle = "#091532";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#17214a";
  for (let i = 0; i < 7; i++) ctx.fillRect(i * 42 - 8, 35 + (i % 2) * 8, 52, 12);
  ctx.fillStyle = "#0a1631";
  for (let x = 0; x < W; x += 20) {
    const h = 28 + ((x * 7) % 36);
    ctx.fillRect(x, 158 - h, 16, h);
    ctx.fillStyle = "#d79628";
    if (x % 40 === 0) ctx.fillRect(x + 6, 146 - h, 2, 3);
    if (x % 60 === 0) ctx.fillRect(x + 10, 134 - h, 2, 3);
    ctx.fillStyle = "#0a1631";
  }
  ctx.fillStyle = "#1f6bb7";
  for (const r of state.rain) {
    r.y += r.s;
    r.x -= 0.45;
    if (r.y > H) { r.y = -8; r.x = Math.random() * W; }
    ctx.fillRect(r.x, r.y, 1, 7);
  }
  ctx.fillStyle = "#f6b936";
  ctx.fillRect(22, 158, 3, 30);
  ctx.fillRect(220, 158, 3, 30);
  ctx.fillRect(17, 153, 13, 5);
  ctx.fillRect(215, 153, 13, 5);
}

function drawPlatforms() {
  for (const p of platforms) {
    ctx.fillStyle = "#111420";
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = "#343a55";
    ctx.fillRect(p.x, p.y, p.w, 4);
    ctx.fillStyle = "#53617d";
    for (let x = p.x; x < p.x + p.w; x += 13) ctx.fillRect(x, p.y + 1, 6, 2);
  }
}

function drawFishes() {
  for (const f of state.fishes) {
    ctx.fillStyle = f.risky ? "#ffcf4a" : "#5fe0ff";
    ctx.fillRect(f.x, f.y + 2, 8, 4);
    ctx.fillRect(f.x + 8, f.y + 1, 3, 6);
    ctx.fillStyle = "#fff8d8";
    ctx.fillRect(f.x + 2, f.y + 1, 2, 1);
  }
}

function drawLightning() {
  const l = state.lightning;
  if (!l) return;
  const blink = Math.floor(l.flicker * 12) % 2 === 0;
  if (l.warning > 0 && blink) {
    ctx.fillStyle = "rgba(255, 202, 47, 0.55)";
    ctx.fillRect(l.x - l.w / 2, l.y - 2, l.w, 6);
    ctx.fillStyle = "#ffef8b";
    ctx.fillRect(l.x - 1, 10, 2, l.y - 10);
  }
  if (l.warning <= 0) {
    ctx.fillStyle = "#6db8ff";
    ctx.fillRect(l.x - 7, 0, 14, l.y + 12);
    ctx.fillStyle = "#f7fbff";
    let x = l.x;
    for (let y = 0; y < l.y + 12; y += 10) {
      const nx = l.x + Math.sin(y * 0.42) * 8 + (Math.random() - 0.5) * 5;
      ctx.fillRect(Math.min(x, nx), y, Math.abs(nx - x) + 3, 5);
      x = nx;
    }
    ctx.fillRect(l.x - 10, l.y + 8, 20, 4);
  }
}

function drawCat(p) {
  if (p.inv > 0 && Math.floor(p.inv * 12) % 2) return;
  const x = Math.round(p.x);
  const y = Math.round(p.y);
  // Оранжевый плащ и зонтик — силуэт как на референсе.
  ctx.fillStyle = "#ff970f";
  ctx.fillRect(x + 4, y + 11, 11, 12);
  ctx.fillRect(x + 1, y + 22, 6, 3);
  ctx.fillRect(x + 11, y + 22, 6, 3);
  ctx.fillStyle = "#ffd25b";
  ctx.fillRect(x - 5, y + 2, 26, 5);
  ctx.fillRect(x - 2, y - 1, 20, 4);
  ctx.fillRect(x + 6, y - 4, 5, 3);
  ctx.fillStyle = "#5b2c13";
  ctx.fillRect(x + 15, y + 5, 2, 17);
  ctx.fillStyle = "#fff3e6";
  ctx.fillRect(x + 3, y + 5, 13, 12);
  ctx.fillRect(x + 2, y + 2, 4, 6);
  ctx.fillRect(x + 12, y + 2, 4, 6);
  ctx.fillStyle = "#ffb4a3";
  ctx.fillRect(x + 3, y + 3, 2, 3);
  ctx.fillRect(x + 13, y + 3, 2, 3);
  ctx.fillStyle = "#2b1b19";
  ctx.fillRect(x + 5, y + 9, 3, 3);
  ctx.fillRect(x + 12, y + 9, 3, 3);
  ctx.fillStyle = "#ff8b18";
  ctx.fillRect(x + 4, y + 8, 5, 1);
  ctx.fillRect(x + 11, y + 8, 5, 1);
  ctx.fillStyle = "#50312c";
  ctx.fillRect(x + 9, y + 12, 2, 1);
  ctx.fillStyle = "#fff3e6";
  ctx.fillRect(x - 2, y + 13, 4, 9);
  ctx.fillRect(x - 6, y + 13, 5, 5);
  ctx.fillRect(x - 8, y + 10, 4, 4);
}

function drawHud() {
  ctx.fillStyle = "#050511";
  ctx.fillRect(0, 0, W, 33);
  ctx.strokeStyle = "#35284a";
  ctx.strokeRect(2, 2, 252, 29);
  drawPixelText("ЖИЗНИ", 12, 8, "#f9b33d", 1);
  for (let i = 0; i < 3; i++) drawHeart(48 + i * 14, 12, i < state.lives);
  drawPixelText(`СЧЁТ ${String(Math.floor(state.score)).padStart(5, "0")}`, 88, 8, "#fff", 1);
  drawPixelText(`РЕКОРД ${String(state.best).padStart(5, "0")}`, 160, 8, "#f9b33d", 1);
  drawPixelText(`ВРЕМЯ ${Math.floor(state.time)}`, 178, 22, "#87b8ff", 1);
  drawPixelText("P ПАУЗА", 8, 22, "#87b8ff", 1);
}

function drawHeart(x, y, full) {
  ctx.fillStyle = full ? "#e51f25" : "#48222b";
  ctx.fillRect(x + 1, y, 3, 2);
  ctx.fillRect(x + 6, y, 3, 2);
  ctx.fillRect(x, y + 2, 10, 5);
  ctx.fillRect(x + 2, y + 7, 6, 2);
  ctx.fillRect(x + 4, y + 9, 2, 2);
}

const font = {
  "А":"111101111101101", "Б":"111100111101111", "В":"110101110101110", "Г":"111100100100100",
  "Д":"011101101101111", "Е":"111100111100111", "Ж":"101101010101101", "З":"111001011001111",
  "И":"101101111101101", "Й":"010101111101101", "К":"101110100110101", "Л":"011101101101101",
  "М":"101111111101101", "Н":"101101111101101", "О":"111101101101111", "П":"111101101101101",
  "Р":"111101111100100", "С":"111100100100111", "Т":"111010010010010", "У":"101101111001111",
  "Ч":"101101111001001", "Ь":"100100111101111", "Я":"111101111011101", " ":"000000000000000",
  "0":"111101101101111", "1":"010110010010111", "2":"111001111100111", "3":"111001111001111",
  "4":"101101111001001", "5":"111100111001111", "6":"111100111101111", "7":"111001010010010",
  "8":"111101111101111", "9":"111101111001111", "P":"110101110100100", "R":"110101110101101",
  "!":"010010010000010"
};

function drawPixelText(text, x, y, color, s = 1) {
  ctx.fillStyle = color;
  [...text].forEach((ch, n) => {
    const bits = font[ch] || font[" "];
    for (let i = 0; i < 15; i++) if (bits[i] === "1") ctx.fillRect(x + n * 4 * s + (i % 3) * s, y + Math.floor(i / 3) * s, s, s);
  });
}

function drawCenterText(title, subtitle) {
  ctx.fillStyle = "rgba(0,0,0,.72)";
  ctx.fillRect(36, 95, 184, 54);
  ctx.strokeStyle = "#6d5d82";
  ctx.strokeRect(39, 98, 178, 48);
  drawPixelText(title, 58, 108, "#f9b33d", 2);
  drawPixelText(subtitle, 76, 133, "#fff", 1);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.033, (now - last) / 1000);
  last = now;
  update(dt);
  requestAnimationFrame(frame);
}

reset();
requestAnimationFrame(frame);
draw();
