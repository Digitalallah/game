// «Котогроза» — маленький 8-bit platformer без библиотек.
const canvas = document.getElementById("game");
const startScreen = document.getElementById("start-screen");
const playButton = document.getElementById("play-button");
const bestScore = document.getElementById("best-score");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

const W = 256;
const H = 256;
const SCALE = 4;
const MAX_LIVES = 3;
const GRAVITY = 0.34;
const keys = new Set();
const touchControls = { left: false, right: false, jump: false };
const telegramWebApp = window.Telegram?.WebApp;

function initTelegram() {
  if (!telegramWebApp) return;
  try {
    telegramWebApp.ready();
    telegramWebApp.expand();
  } catch (error) {
    console.warn("Telegram WebApp init failed", error);
  }
}

function haptic(type, style) {
  const feedback = telegramWebApp?.HapticFeedback;
  if (!feedback) return;
  try {
    if (type === "impact" && typeof feedback.impactOccurred === "function") feedback.impactOccurred(style);
    if (type === "notification" && typeof feedback.notificationOccurred === "function") feedback.notificationOccurred(style);
  } catch (error) {
    console.warn("Telegram haptic feedback failed", error);
  }
}

initTelegram();

const images = {
  background: loadImage("assets/back.png"),
  fish1: loadImage("assets/fish1.png"),
  fish2_1: loadImage("assets/fish2_1.png"),
  fish2_2: loadImage("assets/fish2_2.png"),
  catHead: loadImage("assets/player/head.png"),
  crab: {
    body: loadImage("assets/crab_body.png"),
    leftClaw: loadImage("assets/crab_left_claw.png"),
    rightClaw: loadImage("assets/crab_right_claw.png"),
    leftLeg: loadImage("assets/crab_left_leg.png"),
    rightLeg: loadImage("assets/crab_right_leg.png")
  },
  player: {
    tail: loadImage("assets/player/tail.png"),
    leftleg: loadImage("assets/player/leftleg.png"),
    rightleg: loadImage("assets/player/rightleg.png"),
    body: loadImage("assets/player/body.png"),
    head: loadImage("assets/player/head.png"),
    umbrella: loadImage("assets/player/umbrella.png")
  }
};

function loadImage(src) {
  const image = new Image();
  image.src = src;
  return image;
}

const requiredImages = [
  images.background, images.fish1, images.fish2_1, images.fish2_2, images.catHead,
  images.crab.body, images.crab.leftClaw, images.crab.rightClaw, images.crab.leftLeg, images.crab.rightLeg,
  ...Object.values(images.player)
];
let assetsReady = false;
Promise.all(requiredImages.map((image) => image.complete && image.naturalWidth > 0 ? Promise.resolve() : new Promise((resolve, reject) => {
  image.addEventListener("load", resolve, { once: true });
  image.addEventListener("error", reject, { once: true });
}))).then(() => { assetsReady = true; playButton.disabled = false; }).catch((error) => { console.error("Asset loading failed", error); playButton.disabled = false; });
playButton.disabled = true;

const platforms = [
  { x: 0, y: 222, w: 256, h: 34, kind: "street" },
  { x: 18, y: 184, w: 58, h: 9, kind: "awning" },
  { x: 92, y: 170, w: 72, h: 9, kind: "beam" },
  { x: 178, y: 186, w: 58, h: 9, kind: "roof" },
  { x: 34, y: 132, w: 64, h: 9, kind: "beam" },
  { x: 130, y: 118, w: 70, h: 9, kind: "awning" },
  { x: 52, y: 82, w: 58, h: 9, kind: "roof" },
  { x: 155, y: 74, w: 76, h: 9, kind: "beam" }
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
  lightnings: [],
  nextLightning: 1.5,
  nextCrab: 2.5,
  crabs: [],
  crabWarnings: [],
  drops: [],
  fishes: [],
  popups: [],
  sparks: [],
  riskText: 0,
  rain: [],
  cameraShake: 0,
  screenFlash: 0,
  started: false,
  hiddenPaused: false
};

function reset() {
  state.player = { x: 28, y: 184, w: 16, h: 24, vx: 0, vy: 0, facing: 1, grounded: false, inv: 0, anim: "idle", animTime: 0, collect: 0, hurt: 0 };
  state.score = 0;
  state.lives = 3;
  state.time = 0;
  state.paused = false;
  state.gameOver = false;
  state.lightning = null;
  state.lightnings = [];
  state.nextLightning = 1.2;
  state.nextCrab = 2.2;
  state.crabs = [];
  state.crabWarnings = [];
  state.drops = [];
  state.fishes = [];
  state.popups = [];
  state.sparks = [];
  state.riskText = 0;
  state.cameraShake = 0;
  state.screenFlash = 0;
  state.hiddenPaused = false;
  spawnFish(false);
}

for (let i = 0; i < 115; i++) {
  state.rain.push({ x: Math.random() * W, y: Math.random() * H, s: 1 + Math.random() * 2.2, layer: Math.random() });
}

addEventListener("keydown", (e) => {
  if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " "].includes(e.key)) e.preventDefault();
  keys.add(e.key.toLowerCase());
  if (e.key.toLowerCase() === "p" && state.started && !state.gameOver) state.paused = !state.paused;
  if (e.key.toLowerCase() === "r") { reset(); startGame(); }
});
addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

function clearInput() {
  keys.clear();
  for (const key of Object.keys(touchControls)) touchControls[key] = false;
  document.querySelectorAll(".touch-button.is-active").forEach((button) => button.classList.remove("is-active"));
}

function setTouchControl(control, active, button) {
  if (!(control in touchControls)) return;
  touchControls[control] = active;
  button.classList.toggle("is-active", active);
}

document.querySelectorAll("[data-control]").forEach((button) => {
  const control = button.dataset.control;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    setTouchControl(control, true, button);
  });
  for (const eventName of ["pointerup", "pointercancel", "lostpointercapture"]) {
    button.addEventListener(eventName, (event) => {
      event.preventDefault();
      setTouchControl(control, false, button);
    });
  }
});

addEventListener("blur", clearInput);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    if (state.started && !state.gameOver) { state.paused = true; state.hiddenPaused = true; }
    clearInput();
  } else if (state.hiddenPaused) {
    state.paused = true;
    state.hiddenPaused = false;
  }
});

function startGame() {
  state.started = true;
  state.paused = false;
  startScreen.hidden = true;
  canvas.focus?.();
}

playButton.addEventListener("click", () => {
  if (!assetsReady) return;
  reset();
  startGame();
});

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function choice(list) { return list[Math.floor(Math.random() * list.length)]; }
function safeTopFor(platform) { return { x: platform.x + 6 + Math.random() * Math.max(1, platform.w - 20), y: platform.y }; }

function spawnFish(risky, target = null) {
  const p = target || safeTopFor(choice(platforms));
  const gold = !!risky;
  const fish = { x: p.x, y: p.y - (gold ? 11 : 10), w: gold ? 13 : 12, h: gold ? 10 : 9, risky: gold, alive: true, bob: Math.random() * 10, age: 0, ttl: gold ? 5.5 : Infinity };
  if (!gold) state.fishes.push(fish);
  else state.fishes = state.fishes.filter((f) => !f.risky || f.age < 0.3).concat(fish);
}

function difficulty() {
  const t = state.time;
  return {
    lightningDelay: Math.max(0.72, 1.7 - t * 0.01),
    multiChance: Math.min(0.45, t / 180),
    crabDelay: Math.max(1.4, 4.5 - t * 0.018),
    crabSpeed: Math.min(1.45, 0.72 + t * 0.004),
    maxCrabs: Math.min(4, 1 + Math.floor(t / 42)),
    jumpChance: Math.min(0.55, Math.max(0, (t - 28) / 130))
  };
}

function spawnCrabWarning() {
  const d = difficulty();
  if (state.crabs.length + state.crabWarnings.length >= d.maxCrabs) return;
  const side = Math.random() < 0.5 ? -1 : 1;
  const street = platforms[0];
  if ((side < 0 && state.player.x < 44) || (side > 0 && state.player.x > W - 60)) return;
  state.crabWarnings.push({ side, y: street.y - 22, life: 0.7 });
}

function spawnCrab(side) {
  const d = difficulty();
  const dir = side < 0 ? 1 : -1;
  const speed = (d.crabSpeed + Math.random() * 0.28) * dir;
  state.crabs.push({ x: side < 0 ? -44 : W + 10, y: platforms[0].y - 24, w: 42, h: 24, vx: speed, vy: 0, dir, anim: 0, hit: false, jumper: Math.random() < d.jumpChance, jumpCd: 1.4 + Math.random() * 2.2, jumpPrep: 0, squash: 0, grounded: true, flash: 0 });
}

function crabHitbox(c) { return { x: c.x + 7, y: c.y + 7, w: c.w - 14, h: c.h - 9 }; }
function nearestSurfaceY(x, y) {
  let best = platforms[0].y;
  for (const p of platforms) if (x >= p.x && x <= p.x + p.w && p.y >= y - 4 && p.y < best) best = p.y;
  return best;
}
function spawnDropFromCrab(c) {
  const x = Math.max(12, Math.min(W - 12, c.x + c.w / 2));
  const surface = nearestSurfaceY(x, c.y);
  if (state.lives >= MAX_LIVES) spawnFish(true, { x: x - 6, y: surface });
  else state.drops.push({ type: "heart", x: x - 5, y: c.y + 4, w: 10, h: 10, vy: -1, targetY: surface - 11, life: 8, alive: true });
}

function startLightning() {
  const d = difficulty();
  const count = Math.random() < d.multiChance ? 2 : 1;
  const used = [];
  for (let i = 0; i < count; i++) {
    const platform = choice(platforms);
    const p = safeTopFor(platform);
    const x = Math.max(10, Math.min(W - 10, p.x));
    if (used.some((u) => Math.abs(u - x) < 42)) continue;
    used.push(x);
    state.lightnings.push({ x, y: p.y, w: 20, warning: 1, strike: 0, after: 0, hit: false, flicker: 0, seed: Math.random() * 99, dodgeBonus: false, wasDanger: overlaps(state.player, { x: x - 10, y: 0, w: 20, h: p.y + 18 }) });
    spawnFish(true, { x: Math.max(8, Math.min(W - 16, x + (Math.random() < 0.5 ? -20 : 20))), y: p.y });
  }
  state.lightning = state.lightnings[0] || null;
}

function update(dt) {
  if (!state.started || state.paused || state.gameOver) return;
  state.time += dt; state.score += dt * 3;
  state.riskText = Math.max(0, state.riskText - dt);
  state.cameraShake = Math.max(0, state.cameraShake - dt);
  state.screenFlash = Math.max(0, state.screenFlash - dt * 3.6);
  if (state.player.inv > 0) state.player.inv -= dt;
  if (state.player.collect > 0) state.player.collect -= dt;
  if (state.player.hurt > 0) state.player.hurt -= dt;
  updatePlayer(dt); updateFishes(dt); updateLightning(dt); updateCrabs(dt); updateDrops(dt); updateJuice(dt);
  if (!state.fishes.some((f) => !f.risky) && Math.random() < 0.012) spawnFish(false);
  state.best = Math.max(state.best, Math.floor(state.score));
  bestScore.textContent = String(state.best);
  localStorage.setItem("kotogrozaBest", state.best);
}

function updatePlayer(dt) {
  const p = state.player;
  const left = keys.has("arrowleft") || keys.has("a") || touchControls.left;
  const right = keys.has("arrowright") || keys.has("d") || touchControls.right;
  const jump = keys.has(" ") || keys.has("arrowup") || keys.has("w") || touchControls.jump;
  p.vx = (right - left) * 1.55;
  if (p.vx) p.facing = Math.sign(p.vx);
  if (jump && p.grounded) { p.vy = -6.2; p.grounded = false; }
  p.vy += GRAVITY; p.x += p.vx; p.x = Math.max(3, Math.min(W - p.w - 3, p.x));
  p.y += p.vy; p.grounded = false;
  for (const plat of platforms) if (overlaps(p, plat) && p.vy >= 0 && p.y + p.h - p.vy <= plat.y + 2) { p.y = plat.y - p.h; p.vy = 0; p.grounded = true; }
  if (p.y > H + 20) hurtPlayer();
  const nextAnim = p.hurt > 0 ? "hurt" : p.collect > 0 ? "collect" : !p.grounded ? (p.vy < 0 ? "jump" : "fall") : Math.abs(p.vx) > 0 ? "run" : "idle";
  if (nextAnim !== p.anim) { p.anim = nextAnim; p.animTime = 0; } else p.animTime += dt;
}

function addPopup(text, x, y, color = "#fff8d8") { state.popups.push({ text, x, y, vy: -16, life: 0.8, color }); }
function addSparks(x, y, color, count = 8) { for (let i = 0; i < count; i++) state.sparks.push({ x, y, vx: (Math.random() - 0.5) * 28, vy: -8 - Math.random() * 24, life: 0.35 + Math.random() * 0.35, color }); }

function updateFishes(dt) {
  for (const f of state.fishes) {
    f.bob += 0.09; f.age += dt;
    if (f.age > f.ttl) f.alive = false;
    if (f.alive && overlaps(state.player, f)) {
      f.alive = false; state.player.collect = 0.22;
      if (f.risky) { haptic("notification", "success"); const late = state.lightnings.some((l) => l.warning > 0 && l.warning < 0.35 && !l.dodgeBonus); const pts = 50; state.score += pts; if (late) state.riskText = 1; addPopup(`+${pts}`, f.x - 2, f.y - 4, "#ffcf4a"); addSparks(f.x + 5, f.y + 3, "#ffcf4a", 12); }
      else { haptic("impact", "light"); state.score += 10; addPopup("+10", f.x - 2, f.y - 4, "#7ee8ff"); addSparks(f.x + 5, f.y + 3, "#7ee8ff", 7); }
    }
  }
  state.fishes = state.fishes.filter((f) => f.alive);
}

function updateLightning(dt) {
  if (state.lightnings.length === 0) {
    state.lightning = null;
    state.nextLightning -= dt;
    if (state.nextLightning <= 0) startLightning();
    return;
  }
  for (const l of state.lightnings) {
    l.flicker += dt;
    const warningBox = { x: l.x - l.w / 2, y: 0, w: l.w, h: l.y + 18 };
    const inDanger = overlaps(state.player, warningBox);
    if (l.warning > 0) {
      if (l.wasDanger && !inDanger && l.warning < 0.35 && !l.dodgeBonus) {
        l.dodgeBonus = true; state.score += 25; state.riskText = 1; state.screenFlash = 0.28; haptic("impact", "light"); addPopup("НА УСАХ!", state.player.x - 9, state.player.y - 8, "#ffef8b");
      }
      l.wasDanger = inDanger; l.warning -= dt;
      if (l.warning <= 0) { state.screenFlash = 0.45; haptic("impact", "heavy"); }
      continue;
    }
    l.strike += dt; state.cameraShake = 0.18;
    const bolt = { x: l.x - (l.w - 5) / 2, y: 0, w: l.w - 5, h: l.y + 18 };
    if (!l.hit && overlaps(state.player, bolt)) { l.hit = true; hurtPlayer(); }
    for (const c of state.crabs) if (!c.hit && overlaps(crabHitbox(c), bolt)) { c.hit = true; c.flash = 0.2; spawnDropFromCrab(c); addSparks(c.x + c.w / 2, c.y + 10, "#bfeaff", 18); }
  }
  state.crabs = state.crabs.filter((c) => !c.hit);
  state.lightnings = state.lightnings.filter((l) => l.warning > 0 || l.strike <= 0.34);
  state.lightning = state.lightnings[0] || null;
  if (state.lightnings.length === 0) { const d = difficulty(); state.nextLightning = d.lightningDelay + Math.random() * 0.9; }
}

function updateCrabs(dt) {
  const d = difficulty();
  state.nextCrab -= dt;
  if (state.nextCrab <= 0) { spawnCrabWarning(); state.nextCrab = d.crabDelay + Math.random() * 1.2; }
  for (const w of state.crabWarnings) { w.life -= dt; if (w.life <= 0) spawnCrab(w.side); }
  state.crabWarnings = state.crabWarnings.filter((w) => w.life > 0);
  for (const c of state.crabs) {
    c.anim += dt * (6 + Math.abs(c.vx) * 5); c.squash = Math.max(0, c.squash - dt);
    if (c.jumper && c.grounded) { c.jumpCd -= dt; if (c.jumpCd <= 0 && c.jumpPrep <= 0) c.jumpPrep = 0.52; }
    if (c.jumpPrep > 0) { c.jumpPrep -= dt; if (c.jumpPrep <= 0) { c.vy = -4.4; c.grounded = false; c.jumpCd = 2.2 + Math.random() * 2.8; } }
    c.x += c.vx;
    if (!c.grounded) { c.vy += GRAVITY * 0.75; c.y += c.vy; if (c.y >= platforms[0].y - c.h) { c.y = platforms[0].y - c.h; c.vy = 0; c.grounded = true; c.squash = 0.18; } }
    if (!c.hit && !state.player.inv && overlaps(state.player, crabHitbox(c))) { c.hit = true; hurtPlayer(); state.player.vx += c.dir * 2.2; }
  }
  state.crabs = state.crabs.filter((c) => c.x > -70 && c.x < W + 70 && !c.hit);
}

function updateDrops(dt) {
  for (const d of state.drops) { d.life -= dt; d.vy += GRAVITY * dt * 18; d.y = Math.min(d.targetY, d.y + d.vy); if (d.y >= d.targetY) d.vy = 0; if (overlaps(state.player, d)) { d.alive = false; if (state.lives < MAX_LIVES) { state.lives++; haptic("notification", "success"); addPopup("+1", d.x, d.y - 4, "#ff7a7a"); } } }
  state.drops = state.drops.filter((d) => d.alive && d.life > 0);
}

function updateJuice(dt) {
  for (const p of state.popups) { p.life -= dt; p.y += p.vy * dt; }
  state.popups = state.popups.filter((p) => p.life > 0);
  for (const s of state.sparks) { s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 42 * dt; }
  state.sparks = state.sparks.filter((s) => s.life > 0);
}

function hurtPlayer() {
  const p = state.player; if (p.inv > 0) return;
  haptic("notification", "error");
  state.lives -= 1; p.inv = 1.5; p.hurt = 0.45; p.vy = -4; p.x = Math.max(8, p.x - p.facing * 10); state.cameraShake = 0.35; state.screenFlash = 0.22; addSparks(p.x + 8, p.y + 14, "#ff7a45", 10);
  if (state.lives <= 0) { state.gameOver = true; state.best = Math.max(state.best, Math.floor(state.score)); bestScore.textContent = String(state.best); localStorage.setItem("kotogrozaBest", state.best); }
}

function draw() {
  ctx.save(); ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0); ctx.clearRect(0, 0, W, H);
  if (state.cameraShake > 0) ctx.translate((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2);
  ctx.imageSmoothingEnabled = false; drawBackground(); drawPlatforms(); drawFishes(); drawDrops(); drawCrabWarnings(); drawCrabs(); drawLightning(); drawSparks(); drawCat(state.player); drawRainSplashes(); drawPopups(); drawHud(); drawFlash();
  if (!assetsReady && state.started) drawCenterText("ЗАГРУЗКА", "АССЕТЫ");
  if (!state.started) drawCenterText("КОТОГРОЗА", "НАЖМИТЕ ИГРАТЬ");
  if (state.paused) drawCenterText("ПАУЗА", "P — ПРОДОЛЖИТЬ");
  if (state.gameOver) drawCenterText("ИГРА ОКОНЧЕНА", "R — ЗАНОВО");
  if (state.riskText > 0) drawPixelText("РИСК!", 106, 104, "#ffcf4a", 2);
  ctx.restore(); requestAnimationFrame(draw);
}

function drawBackground() {
  const bg = images.background;
  if (bg.complete && bg.naturalWidth > 0) {
    const scale = Math.max(W / bg.naturalWidth, H / bg.naturalHeight);
    const sw = W / scale;
    const sh = H / scale;
    const sx = (bg.naturalWidth - sw) / 2;
    const sy = (bg.naturalHeight - sh) / 2;
    ctx.drawImage(bg, sx, sy, sw, sh, 0, 0, W, H);
  } else {
    ctx.fillStyle = "#061026";
    ctx.fillRect(0, 0, W, H);
  }

  const flash = state.lightning && state.lightning.warning <= 0 ? 0.18 : 0;
  if (flash) {
    ctx.fillStyle = `rgba(130,205,255,${flash})`;
    ctx.fillRect(0, 0, W, H);
  }

  drawAmbientLightning();
  drawRain();
  drawWaterReflections();
}

function drawStormClouds(flash) {
  const bands = [
    { y: 18, c: "#102456", hi: "#244681", step: 18, off: 0 },
    { y: 31, c: "#17346d", hi: "#315b9f", step: 22, off: 8 },
    { y: 44, c: "#0d214b", hi: "#203f80", step: 20, off: 3 }
  ];
  for (const b of bands) {
    for (let x = -28; x < W + 28; x += b.step) {
      const yy = b.y + Math.sin((x + state.time * 5 + b.off) * 0.08) * 4;
      ctx.fillStyle = b.c; ctx.fillRect(x, yy, b.step + 10, 10); ctx.fillRect(x + 6, yy - 7, b.step - 4, 8);
      ctx.fillStyle = flash ? "#69b8ff" : b.hi; ctx.globalAlpha = 0.34 + flash; ctx.fillRect(x + 4, yy + 8, b.step, 3); ctx.globalAlpha = 1;
    }
  }
}

function drawSkyline(offset, base, color, win, alpha) {
  ctx.globalAlpha = alpha; ctx.fillStyle = color;
  for (let x = -offset; x < W; x += 15) {
    const h = 22 + ((x * 7 + offset * 9) % 42);
    ctx.fillRect(x, base - h, 12, h);
    ctx.fillRect(x + 3, base - h - ((x + offset) % 3 === 0 ? 6 : 0), 6, 6);
    ctx.fillStyle = win;
    if ((x + offset) % 30 === 0) ctx.fillRect(x + 3, base - h + 9, 2, 3);
    if ((x + offset) % 45 === 0) ctx.fillRect(x + 8, base - h + 19, 2, 3);
    if ((x + offset) % 60 === 0) ctx.fillRect(x + 5, base - h + 31, 2, 3);
    ctx.fillStyle = color;
  }
  ctx.globalAlpha = 1;
}

function drawAmbientLightning() {
  const active = state.lightnings.some((l) => l.warning <= 0);
  if (!active) return;
  ctx.fillStyle = "rgba(130,205,255,.20)"; ctx.fillRect(178, 0, 34, 221);
  ctx.fillStyle = "#eef9ff";
  let x = 194;
  for (let y = 8; y < 224; y += 13) { const nx = 194 + Math.sin(y * 0.21 + state.time * 8) * 9; ctx.fillRect(Math.min(x, nx), y, Math.abs(nx - x) + 3, 8); x = nx; }
  ctx.fillStyle = "#48a7ff"; ctx.fillRect(187, 35, 18, 3); ctx.fillRect(190, 202, 18, 3);
}

function drawRain() {
  ctx.fillStyle = "#1f8ce8";
  for (const r of state.rain) {
    r.y += r.s; r.x -= 0.55 + r.layer * 0.45;
    if (r.y > H) { r.y = -8; r.x = Math.random() * W; }
    ctx.globalAlpha = 0.42 + r.layer * 0.38;
    ctx.fillRect(r.x, r.y, 1, 5 + r.layer * 6);
    if (r.layer > 0.72) ctx.fillRect(r.x - 1, r.y + 4, 1, 3);
  }
  ctx.globalAlpha = 1;
}

function drawWaterReflections() {
  ctx.fillStyle = "#0b3b75";
  for (let x = 0; x < W; x += 12) ctx.fillRect(x, 229 + ((x * 9 + Math.floor(state.time * 16)) % 7), 8, 1);
  ctx.fillStyle = "#ffc23b"; ctx.globalAlpha = .55;
  for (const x of [22, 220]) { ctx.fillRect(x - 3, 205, 8, 2); ctx.fillRect(x - 7, 214, 16, 2); ctx.fillRect(x - 4, 224, 10, 1); }
  ctx.globalAlpha = 1;
}

function drawRainSplashes() {
  ctx.fillStyle = "rgba(126, 232, 255, .55)";
  for (let x = 2; x < W; x += 19) if ((x + Math.floor(state.time * 24)) % 3 === 0) ctx.fillRect(x, 221, 4, 1);
}
function drawLamp(x, y) { ctx.fillStyle = "rgba(255,194,55,.16)"; ctx.fillRect(x - 7, y + 1, 17, 35); ctx.fillStyle = "#22182b"; ctx.fillRect(x + 2, y + 8, 2, 34); ctx.fillRect(x - 2, y + 40, 10, 3); ctx.fillStyle = "#ffd34a"; ctx.fillRect(x - 1, y, 8, 9); ctx.fillStyle = "#fff1a3"; ctx.fillRect(x + 1, y + 2, 4, 5); ctx.fillStyle = "#2b2a44"; ctx.fillRect(x - 3, y - 2, 12, 3); }
function drawPlatforms() { for (const p of platforms) { if (p.kind === "street") { ctx.fillStyle = "#151827"; ctx.fillRect(p.x, p.y, p.w, p.h); ctx.fillStyle = "#2b3348"; ctx.fillRect(p.x, p.y, p.w, 5); ctx.fillStyle = "#5f6f8e"; for (let x = 0; x < W; x += 18) ctx.fillRect(x, p.y + 1, 10, 2); ctx.fillStyle = "#070911"; for (let x = 0; x < W; x += 16) ctx.fillRect(x, p.y + 10, 2, 24); } else { ctx.fillStyle = "#0b0d18"; ctx.fillRect(p.x, p.y + 4, p.w, p.h - 2); ctx.fillStyle = p.kind === "awning" ? "#d96b17" : "#31384f"; ctx.fillRect(p.x, p.y, p.w, 4); ctx.fillStyle = "#6d7899"; for (let x = p.x; x < p.x + p.w; x += 13) ctx.fillRect(x, p.y + 1, 6, 2); ctx.fillStyle = "#182036"; ctx.fillRect(p.x + 3, p.y + p.h, p.w - 6, 2); } } }
function drawFishes() {
  for (const f of state.fishes) {
    const bob = Math.round(Math.sin(f.bob) * (f.risky ? 1 : 1));
    const image = f.risky ? (Math.floor(state.time / 0.16) % 2 ? images.fish2_2 : images.fish2_1) : images.fish1;
    if (f.risky) {
      ctx.fillStyle = "rgba(255,207,74,.24)"; ctx.fillRect(Math.round(f.x - 3), Math.round(f.y - 2 + bob), f.w + 6, f.h + 4);
      if (Math.floor(state.time * 12) % 3 === 0) { ctx.fillStyle = "#fff1a3"; ctx.fillRect(Math.round(f.x + f.w + 2), Math.round(f.y + bob + 1), 2, 2); }
    }
    if (image.complete && image.naturalWidth > 0) ctx.drawImage(image, Math.round(f.x), Math.round(f.y + bob), f.w, f.h);
  }
}

function drawCrabWarnings() {
  for (const w of state.crabWarnings) {
    const x = w.side < 0 ? 5 : W - 13;
    const blink = Math.floor(w.life * 16) % 2 === 0;
    ctx.fillStyle = blink ? "#ffcf4a" : "#7a3b1c";
    ctx.fillRect(x, w.y + 9, 8, 8); ctx.fillStyle = "#090818"; ctx.fillRect(x + 3, w.y + 11, 2, 4); ctx.fillRect(x + 3, w.y + 16, 2, 1);
  }
}

function drawCrabs() { for (const c of state.crabs) drawCrab(c); }

function drawCrab(c) {
  const walk = Math.round(Math.sin(c.anim) * 2);
  const bodyBob = c.jumpPrep > 0 ? 3 : c.squash > 0 ? 2 : Math.round(Math.sin(c.anim * 0.8));
  const claw = c.jumpPrep > 0 ? -3 : Math.round(Math.cos(c.anim) * 2);
  const sx = c.dir < 0 ? -1 : 1;
  ctx.save();
  ctx.translate(Math.round(c.x + c.w / 2), Math.round(c.y));
  ctx.scale(sx, 1);
  const draw = (img, x, y, w = 42, h = 27) => { if (img.complete && img.naturalWidth > 0) ctx.drawImage(img, Math.round(x), Math.round(y), w, h); };
  draw(images.crab.leftLeg, -21, 3 + walk, 42, 27);
  draw(images.crab.rightLeg, -21, 3 - walk, 42, 27);
  draw(images.crab.body, -21, bodyBob, 42, 27);
  draw(images.crab.leftLeg, -21, 5 - walk, 42, 27);
  draw(images.crab.rightLeg, -21, 5 + walk, 42, 27);
  draw(images.crab.leftClaw, -23 - claw, -1 + bodyBob + claw / 2, 42, 27);
  draw(images.crab.rightClaw, -19 + claw, -1 + bodyBob - claw / 2, 42, 27);
  if (c.flash > 0) { ctx.fillStyle = "rgba(210,245,255,.75)"; ctx.fillRect(-22, 0, 44, 28); }
  ctx.restore();
}

function drawDrops() {
  for (const d of state.drops) if (d.type === "heart") drawHeart(Math.round(d.x), Math.round(d.y), true);
}
function drawLightning() {
  for (const l of state.lightnings) {
    const blink = Math.floor(l.flicker * 14) % 2 === 0;
    if (l.warning > 0) { ctx.fillStyle = `rgba(255, 202, 47, ${blink ? 0.48 : 0.18})`; ctx.fillRect(l.x - l.w / 2, l.y - 2, l.w, 6); ctx.fillStyle = "rgba(255,239,139,.35)"; ctx.fillRect(l.x - 2, 34, 4, l.y - 34); ctx.fillStyle = "#ffef8b"; if (blink) ctx.fillRect(l.x - 1, 34, 2, l.y - 34); continue; }
    ctx.fillStyle = "rgba(77,154,255,.22)"; ctx.fillRect(l.x - 11, 0, 22, l.y + 18); ctx.fillStyle = "#f7fbff"; let x = l.x;
    for (let y = 0; y < l.y + 14; y += 9) { const nx = l.x + Math.sin((y + l.seed) * 0.45) * 8 + (Math.random() - 0.5) * 5; ctx.fillRect(Math.min(x, nx), y, Math.abs(nx - x) + 3, 5); ctx.fillStyle = "#7cc4ff"; ctx.fillRect(Math.min(x, nx) - 2, y + 2, Math.abs(nx - x) + 7, 2); ctx.fillStyle = "#f7fbff"; x = nx; }
    ctx.fillStyle = "#eaf8ff"; ctx.fillRect(l.x - 10, l.y + 8, 20, 4); ctx.fillStyle = "rgba(130,205,255,.6)"; ctx.fillRect(l.x - 14, Math.min(228, l.y + 18), 28, 2); ctx.fillRect(l.x - 8, Math.min(236, l.y + 25), 16, 1);
  }
}
function drawSparks() { for (const s of state.sparks) { ctx.fillStyle = s.color; ctx.fillRect(s.x, s.y, 2, 2); } }

function drawCat(p) {
  if (p.inv > 0 && Math.floor(p.inv * 12) % 2) return;

  const rate = p.anim === "run" ? 13 : 5;
  const frame = Math.floor(p.animTime * rate) % 4;
  const stride = p.anim === "run" ? (frame % 2 ? 1 : -1) : 0;
  const idleBob = p.anim === "idle" ? (frame === 1 ? -1 : 0) : 0;
  const jumpLift = p.anim === "jump" ? -2 : p.anim === "fall" ? 1 : 0;
  const hurtLean = p.anim === "hurt" ? -p.facing * 2 : 0;
  const collectLift = p.anim === "collect" ? -2 : 0;
  const flip = p.facing < 0 ? -1 : 1;

  const spriteSize = 32;
  const originX = Math.round(p.x + p.w / 2);
  const originY = Math.round(p.y + p.h - spriteSize + idleBob + jumpLift + collectLift);

  ctx.save();
  ctx.translate(originX + hurtLean, originY);
  ctx.scale(flip, 1);
  ctx.translate(-spriteSize / 2, 0);

  drawPlayerPart("tail", -2 - stride * 0.5, p.anim === "run" ? -stride : 0);
  drawPlayerPart("leftleg", -stride, p.anim === "run" ? Math.max(0, stride) : 0);
  drawPlayerPart("rightleg", stride, p.anim === "run" ? Math.max(0, -stride) : 0);
  drawPlayerPart("body", 0, p.anim === "collect" ? -1 : 0);
  drawPlayerPart("head", p.anim === "hurt" ? -1 : 0, p.anim === "run" ? idleBob : 0);
  drawPlayerPart("umbrella", p.anim === "run" ? stride * 0.5 : 0, p.anim === "jump" ? -1 : 0);

  if (p.anim === "hurt") {
    ctx.fillStyle = "#ffef8b";
    ctx.fillRect(5, 5, 2, 2);
    ctx.fillRect(27, 9, 2, 2);
  }
  if (p.anim === "collect") {
    ctx.fillStyle = "#ffcf4a";
    ctx.fillRect(4, 1, 2, 2);
    ctx.fillRect(27, 3, 2, 2);
  }
  ctx.restore();
}

function drawPlayerPart(name, dx, dy) {
  const image = images.player[name];
  if (image.complete && image.naturalWidth > 0) {
    ctx.drawImage(image, Math.round(dx), Math.round(dy), 32, 32);
  }
}

function drawRoundGlasses(x, y) {
  ctx.fillStyle = "#8a3f10";
  ctx.fillRect(x, y + 1, 6, 4); ctx.fillRect(x + 1, y, 4, 6);
  ctx.fillRect(x + 8, y + 1, 6, 4); ctx.fillRect(x + 9, y, 4, 6);
  ctx.fillStyle = "#ff8b18";
  ctx.fillRect(x + 1, y + 1, 4, 4); ctx.fillRect(x + 9, y + 1, 4, 4); ctx.fillRect(x + 6, y + 3, 3, 1);
  ctx.fillStyle = "#201515";
  ctx.fillRect(x + 2, y + 2, 2, 2); ctx.fillRect(x + 10, y + 2, 2, 2);
  ctx.fillStyle = "#fff7ec"; ctx.fillRect(x + 2, y + 1, 1, 1); ctx.fillRect(x + 10, y + 1, 1, 1);
}

function drawPopups() { for (const p of state.popups) drawPixelText(p.text, p.x, p.y, p.color, 1); }
function drawFlash() { if (state.screenFlash <= 0) return; ctx.fillStyle = `rgba(210,235,255,${state.screenFlash * 0.32})`; ctx.fillRect(0, 0, W, H); }

function drawHud() {
  ctx.fillStyle = "#050511"; ctx.fillRect(0, 0, W, 33);
  drawHudPanel(2, 2, 84, 29); drawHudPanel(88, 2, 70, 29); drawHudPanel(160, 2, 94, 29);
  drawCatIcon(8, 8); drawPixelText("ЖИЗНИ", 32, 7, "#f9b33d", 1);
  for (let i = 0; i < MAX_LIVES; i++) drawHeart(33 + i * 12, 18, i < state.lives);
  drawPixelText("СЧЁТ", 111, 7, "#f9b33d", 1); drawPixelText(String(Math.floor(state.score)).padStart(5, "0"), 111, 19, "#fff", 1);
  drawPixelText("РЕКОРД", 168, 7, "#f9b33d", 1); drawPixelText(String(state.best).padStart(5, "0"), 170, 19, "#fff", 1);
  drawPixelText(`ВРЕМЯ ${Math.floor(state.time)}`, 8, 38, "#87b8ff", 1); drawPixelText("P ПАУЗА", 209, 38, "#87b8ff", 1);
}
function drawHudPanel(x, y, w, h) { ctx.fillStyle = "#090818"; ctx.fillRect(x, y, w, h); ctx.strokeStyle = "#6d5d82"; ctx.strokeRect(x, y, w, h); ctx.strokeStyle = "#21172d"; ctx.strokeRect(x + 2, y + 2, w - 4, h - 4); }
function drawCatIcon(x, y) { const img = images.catHead; if (img.complete && img.naturalWidth > 0) ctx.drawImage(img, x - 2, y - 2, 24, 24); }
function drawHeart(x, y, full) { ctx.fillStyle = full ? "#e51f25" : "#48222b"; ctx.fillRect(x + 1, y, 3, 2); ctx.fillRect(x + 6, y, 3, 2); ctx.fillRect(x, y + 2, 10, 5); ctx.fillRect(x + 2, y + 7, 6, 2); ctx.fillRect(x + 4, y + 9, 2, 2); ctx.fillStyle = full ? "#ff7a7a" : "#2b1720"; ctx.fillRect(x + 2, y + 2, 2, 1); }

const font = {
  "А":"111101111101101", "Б":"111100111101111", "В":"110101110101110", "Г":"111100100100100", "Д":"011101101101111", "Е":"111100111100111", "Ж":"101101010101101", "З":"111001011001111", "И":"101101111101101", "Й":"010101111101101", "К":"101110100110101", "Л":"011101101101101", "М":"101111111101101", "Н":"101101111101101", "О":"111101101101111", "П":"111101101101101", "Р":"111101111100100", "С":"111100100100111", "Т":"111010010010010", "У":"101101111001111", "Ч":"101101111001001", "Ь":"100100111101111", "Я":"111101111011101", "Ы":"101101111101111", " ":"000000000000000", "0":"111101101101111", "1":"010110010010111", "2":"111001111100111", "3":"111001111001111", "4":"101101111001001", "5":"111100111001111", "6":"111100111101111", "7":"111001010010010", "8":"111101111101111", "9":"111101111001111", "P":"110101110100100", "R":"110101110101101", "+":"000010111010000", "!":"010010010000010", "—":"000000111000000" };
function drawPixelText(text, x, y, color, s = 1) { ctx.fillStyle = color; [...text].forEach((ch, n) => { const bits = font[ch] || font[" "]; for (let i = 0; i < 15; i++) if (bits[i] === "1") ctx.fillRect(x + n * 4 * s + (i % 3) * s, y + Math.floor(i / 3) * s, s, s); }); }
function drawCenterText(title, subtitle) { ctx.fillStyle = "rgba(0,0,0,.72)"; ctx.fillRect(36, 95, 184, 54); ctx.strokeStyle = "#6d5d82"; ctx.strokeRect(39, 98, 178, 48); drawPixelText(title, 58, 108, "#f9b33d", 2); drawPixelText(subtitle, 76, 133, "#fff", 1); }

let last = performance.now();
function frame(now) { const dt = Math.min(0.033, (now - last) / 1000); last = now; update(dt); requestAnimationFrame(frame); }
reset();
bestScore.textContent = String(state.best);
requestAnimationFrame(frame); draw();
