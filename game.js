/* global Phaser */

const TILE = 32;
// Phaser Text objects are raster textures, so render those above 1×.
const TEXT_RESOLUTION = Math.min(
  3,
  Math.max(2, Math.ceil((window.devicePixelRatio || 1) * 1.25))
);
const MAZE = [
  '###################',
  '#........#........#',
  '#.##.###.#.###.##.#',
  '#.##.###.#.###.##.#',
  '#.................#',
  '#.##.#.#####.#.##.#',
  '#....#...#...#....#',
  '####.###.#.###.####',
  '####.#.......#.####',
  '####.#.##.##.#.####',
  '#......#...#......#',
  '####.#.#####.#.####',
  '####.#.......#.####',
  '#........#........#',
  '#.##.###.#.###.##.#',
  '#..#...........#..#',
  '##.#.#.#####.#.#.##',
  '#....#...#...#....#',
  '#.######.#.######.#',
  '#.................#',
  '###################'
];

const DIR = {
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 }
};
const DIRECTIONS = Object.values(DIR);

const dom = {
  score: document.getElementById('score'),
  high: document.getElementById('high-score'),
  remaining: document.getElementById('remaining'),
  status: document.getElementById('status-label'),
  sound: document.getElementById('sound-button'),
  pause: document.getElementById('pause-button')
};

let sceneRef;
let player;
let ghosts = [];
let dots = [];
let cursors;
let pauseOverlay;
let score = 0;
let remaining = 0;
let gameMode = 'boot';
let highScore = readHighScore();
let soundMuted = false;
let audioContext;
let lastDotSound = 0;

const config = {
  type: Phaser.AUTO,
  parent: 'game-canvas',
  width: MAZE[0].length * TILE,
  height: MAZE.length * TILE,
  backgroundColor: '#ffffff',
  antialias: true,
  transparent: false,
  physics: { default: 'arcade', arcade: { debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: { preload, create, update }
};

new Phaser.Game(config);
renderScore();

function preload() {
  this.load.image('prashanth', 'assets/prashanth.png');
}

function create() {
  sceneRef = this;
  document.querySelector('.game-state-overlay')?.remove();
  score = 0;
  ghosts = [];
  dots = [];
  gameMode = 'ready';

  drawMaze(this);
  createCollectibles(this);
  createActors(this);
  setupInput(this);
  updateStatus('SYSTEM READY', 'ready');
  renderScore();
  createStartOverlay(this);

  dom.pause.onclick = togglePause;
  dom.sound.onclick = toggleSound;

  document.querySelectorAll('[data-dir]').forEach((button) => {
    const setDirection = (event) => {
      event.preventDefault();
      queueDirection(button.dataset.dir);
    };
    button.onpointerdown = setDirection;
    button.onclick = setDirection;
  });

  document.onvisibilitychange = () => {
    if (document.hidden && gameMode === 'running') togglePause();
  };
}

function update(_time, delta) {
  if (gameMode !== 'running') return;
  const dt = Math.min(delta, 34) / 1000;

  readKeyboard();
  movePlayer(dt);
  ghosts.forEach((ghost) => moveGhost(ghost, dt));
  collectNearby();
  detectThreatCollision();
}

function drawMaze(scene) {
  const shadows = scene.add.graphics().setDepth(0);
  const walls = scene.add.graphics().setDepth(1);

  MAZE.forEach((row, r) => {
    [...row].forEach((cell, c) => {
      if (cell !== '#') return;
      const x = c * TILE;
      const y = r * TILE;
      shadows.fillStyle(0x8e0d47, 0.22);
      shadows.fillRect(x + 3, y + 5, TILE, TILE);
    });
  });

  MAZE.forEach((row, r) => {
    [...row].forEach((cell, c) => {
      if (cell !== '#') return;
      const x = c * TILE;
      const y = r * TILE;
      walls.fillStyle(0xd11269, 1);
      walls.fillRect(x, y, TILE, TILE);

      if (!isWall(c, r - 1)) {
        walls.fillStyle(0xf33b8c, 1);
        walls.fillRect(x, y, TILE, 4);
      }
      if (!isWall(c, r + 1)) {
        walls.fillStyle(0x980c4c, 1);
        walls.fillRect(x, y + TILE - 5, TILE, 5);
      }
      if (!isWall(c - 1, r)) {
        walls.fillStyle(0xe7297e, 1);
        walls.fillRect(x, y, 3, TILE);
      }
    });
  });
}

function createCollectibles(scene) {
  const reserved = new Set(['19,9', '10,8', '10,9', '10,10']);

  MAZE.forEach((row, r) => {
    [...row].forEach((cell, c) => {
      if (cell !== '.' || reserved.has(`${r},${c}`)) return;
      const dot = scene.add.circle(center(c), center(r), 3.7, 0x969395, 1).setDepth(3);
      dots.push({ row: r, col: c, view: dot, active: true });
    });
  });

  remaining = dots.length;
  dom.remaining.textContent = String(remaining).padStart(3, '0');
}

function createActors(scene) {
  const playerShadow = scene.add.ellipse(center(9), center(19) + 13, 34, 10, 0x5f555a, .16).setDepth(5);
  const playerView = scene.add.image(center(9), center(19), 'prashanth').setDisplaySize(45, 45).setDepth(7);
  player = {
    row: 19,
    col: 9,
    x: center(9),
    y: center(19),
    speed: 142,
    dir: { x: 0, y: 0 },
    queued: { ...DIR.left },
    targetCol: null,
    targetRow: null,
    view: playerView,
    shadow: playerShadow
  };

  ghosts.push(makeGhost(scene, 8, 10, 0xe43d38, 'ransomware', 116));
  ghosts.push(makeGhost(scene, 9, 10, 0x9e176d, 'insider', 110));
  ghosts.push(makeGhost(scene, 10, 10, 0x8c8a8b, 'supply', 106));
}

function makeGhost(scene, col, row, color, type, speed) {
  const x = center(col);
  const y = center(row);
  const shadow = scene.add.ellipse(x, y + 15, 28, 8, 0x5f555a, .16).setDepth(5);
  const container = scene.add.container(x, y).setDepth(6);
  const body = scene.add.graphics();

  body.fillStyle(color, 1);
  body.fillCircle(0, -4, 15);
  body.fillRect(-15, -4, 30, 17);
  body.fillTriangle(-15, 13, -10, 13, -12.5, 18);
  body.fillTriangle(-10, 13, 0, 13, -5, 18);
  body.fillTriangle(0, 13, 10, 13, 5, 18);
  body.fillTriangle(10, 13, 15, 13, 12.5, 18);
  body.fillStyle(0xffffff, 1);
  body.fillEllipse(-6, -7, 7, 9);
  body.fillEllipse(6, -7, 7, 9);
  body.fillStyle(0x41383d, 1);
  body.fillCircle(-5, -6, 1.7);
  body.fillCircle(7, -6, 1.7);

  drawThreatIcon(body, type);
  container.add(body);

  return {
    row, col, x, y, speed, type, view: container, shadow,
    dir: type === 'ransomware' ? { ...DIR.left } : { ...DIR.right },
    targetCol: null,
    targetRow: null
  };
}

function drawThreatIcon(g, type) {
  g.lineStyle(1.6, 0xffffff, .82);
  if (type === 'ransomware') {
    g.strokeRoundedRect(-5, 2, 10, 8, 2);
    g.beginPath();
    g.arc(0, 2, 3.4, Math.PI, 0);
    g.strokePath();
    g.fillStyle(0xffffff, .82);
    g.fillCircle(0, 6, 1.3);
  } else if (type === 'insider') {
    g.strokeRoundedRect(-7, 1, 14, 10, 1);
    g.strokeCircle(-3, 5, 2);
    g.lineBetween(1, 4, 5, 4);
    g.lineBetween(1, 7, 5, 7);
  } else {
    g.strokeEllipse(-3.5, 5, 9, 5);
    g.strokeEllipse(3.5, 5, 9, 5);
    g.lineBetween(-2, 5, 2, 5);
  }
}

function setupInput(scene) {
  cursors = scene.input.keyboard.createCursorKeys();
  scene.input.keyboard.addCapture(['UP', 'DOWN', 'LEFT', 'RIGHT', 'SPACE']);
  scene.input.keyboard.on('keydown-P', togglePause);
  scene.input.keyboard.on('keydown-ESC', togglePause);
}

function readKeyboard() {
  if (cursors.left.isDown) queueDirection('left');
  else if (cursors.right.isDown) queueDirection('right');
  else if (cursors.up.isDown) queueDirection('up');
  else if (cursors.down.isDown) queueDirection('down');
}

function queueDirection(name) {
  if (!player || !DIR[name]) return;
  player.queued = { ...DIR[name] };
}

function movePlayer(dt) {
  if (player.targetCol !== null && isOpposite(player.dir, player.queued)) {
    const previousCol = player.col;
    const previousRow = player.row;
    player.col = player.targetCol;
    player.row = player.targetRow;
    player.targetCol = previousCol;
    player.targetRow = previousRow;
    player.dir = { ...player.queued };
  }

  if (player.targetCol === null) {
    if (canMove(player.col, player.row, player.queued)) player.dir = { ...player.queued };
    if (!canMove(player.col, player.row, player.dir)) player.dir = { x: 0, y: 0 };
    setNextTarget(player);
  }

  advanceToTarget(player, player.speed * dt);
  syncActor(player);
}

function moveGhost(ghost, dt) {
  if (ghost.targetCol === null) {
    ghost.dir = chooseGhostDirection(ghost);
    setNextTarget(ghost);
  }

  advanceToTarget(ghost, ghost.speed * dt);
  syncActor(ghost);
}

function setNextTarget(actor) {
  if (!actor.dir.x && !actor.dir.y) return;
  if (!canMove(actor.col, actor.row, actor.dir)) return;
  actor.targetCol = actor.col + actor.dir.x;
  actor.targetRow = actor.row + actor.dir.y;
}

function advanceToTarget(actor, step) {
  if (actor.targetCol === null) return;
  const targetX = center(actor.targetCol);
  const targetY = center(actor.targetRow);
  const dx = targetX - actor.x;
  const dy = targetY - actor.y;
  const distanceToTarget = Math.hypot(dx, dy);

  if (step >= distanceToTarget) {
    actor.x = targetX;
    actor.y = targetY;
    actor.col = actor.targetCol;
    actor.row = actor.targetRow;
    actor.targetCol = null;
    actor.targetRow = null;
    return;
  }

  actor.x += (dx / distanceToTarget) * step;
  actor.y += (dy / distanceToTarget) * step;
}

function chooseGhostDirection(ghost) {
  let choices = DIRECTIONS.filter((dir) => canMove(ghost.col, ghost.row, dir));
  const forwardChoices = choices.filter((dir) => !isOpposite(dir, ghost.dir));
  if (forwardChoices.length) choices = forwardChoices;
  if (!choices.length) return { x: -ghost.dir.x, y: -ghost.dir.y };

  if (ghost.type === 'supply' && Math.random() < .72) {
    return { ...Phaser.Utils.Array.GetRandom(choices) };
  }

  let targetCol = player.col;
  let targetRow = player.row;
  if (ghost.type === 'insider') {
    targetCol += player.dir.x * 4;
    targetRow += player.dir.y * 4;
  }

  choices.sort((a, b) => {
    const da = Math.abs(ghost.col + a.x - targetCol) + Math.abs(ghost.row + a.y - targetRow) + Math.random() * (ghost.type === 'ransomware' ? .3 : 1.5);
    const db = Math.abs(ghost.col + b.x - targetCol) + Math.abs(ghost.row + b.y - targetRow) + Math.random() * (ghost.type === 'ransomware' ? .3 : 1.5);
    return da - db;
  });
  return { ...choices[0] };
}

function collectNearby() {
  dots.forEach((dot) => {
    if (!dot.active || distance(player.x, player.y, dot.view.x, dot.view.y) > 15) return;
    dot.active = false;
    dot.view.destroy();
    score += 10;
    remaining -= 1;
    dom.remaining.textContent = String(remaining).padStart(3, '0');
    renderScore();
    playTone(540, .025, 'sine');
    checkForWin();
  });

}

function checkForWin() {
  if (remaining === 0) finishGame(true);
}

function detectThreatCollision() {
  const hit = ghosts.find((ghost) => distance(player.x, player.y, ghost.x, ghost.y) < 22);
  if (!hit) return;
  finishGame(false, hit.type);
}

function finishGame(won, threatType) {
  if (gameMode !== 'running') return;
  gameMode = won ? 'won' : 'lost';
  updateHighScore();
  updateStatus(won ? 'CHAMPION UNLOCKED' : 'BREACH DETECTED', won ? 'ready' : 'danger');
  playTone(won ? 720 : 125, won ? .22 : .35, won ? 'sine' : 'sawtooth');

  if (!won) {
    sceneRef.tweens.add({ targets: player.view, alpha: 0, angle: 16, scale: .25, duration: 450, ease: 'Back.easeIn' });
  }

  window.setTimeout(() => {
    createEndOverlay(sceneRef, won, threatType);
  }, won ? 250 : 480);
}

function createStartOverlay(scene) {
  const overlay = scene.add.container(config.width / 2, config.height / 2).setDepth(100);
  const backdrop = scene.add.rectangle(0, 0, config.width, config.height, 0x171316, .93);
  const accent = scene.add.rectangle(0, -146, 74, 7, 0xd11269, 1);
  const label = scene.add.text(0, -116, 'SECURITY ARCADE', textStyle(13, '#ff4b9a')).setOrigin(.5);
  const title = scene.add.text(0, -71, 'PRASHANTH–MAN', textStyle(29, '#ffffff', 'Bungee')).setOrigin(.5);
  const copy = scene.add.text(0, -5, 'Collect every point.\nAvoid all three threats.', {
    fontFamily: 'DM Sans', fontSize: '17px', color: '#d8cfd3', align: 'center', lineSpacing: 7
  }).setOrigin(.5);
  const buttonBg = scene.add.rectangle(0, 82, 230, 52, 0xd11269, 1).setInteractive({ useHandCursor: true });
  const buttonLabel = scene.add.text(0, 82, 'START MISSION', textStyle(14, '#ffffff', 'Bungee')).setOrigin(.5);

  overlay.add([backdrop, accent, label, title, copy, buttonBg, buttonLabel]);
  buttonBg.on('pointerover', () => buttonBg.setFillStyle(0xeb1d78));
  buttonBg.on('pointerout', () => buttonBg.setFillStyle(0xd11269));
  buttonBg.on('pointerdown', () => {
    startAudio();
    gameMode = 'running';
    updateStatus('DEFENSE ACTIVE', 'ready');
    scene.tweens.add({ targets: overlay, alpha: 0, duration: 220, onComplete: () => overlay.destroy(true) });
  });
}

function createEndOverlay(scene, won, threatType) {
  const threatName = threatType ? threatType.replace('ransomware', 'Ransomware').replace('insider', 'Insider risk').replace('supply', 'Supply chain') : '';
  const overlay = document.createElement('div');
  overlay.className = 'game-state-overlay';

  const card = document.createElement('section');
  card.className = `end-card ${won ? 'is-win' : 'is-loss'}`;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  card.setAttribute('aria-labelledby', 'end-state-title');

  const status = document.createElement('p');
  status.className = 'end-card__status';
  status.innerHTML = `<span aria-hidden="true"></span>${won ? 'All points collected' : 'Incident detected'}`;

  const title = document.createElement('h2');
  title.id = 'end-state-title';
  title.textContent = won ? 'SECURITY CHAMPION!' : 'GAME OVER';

  const reason = document.createElement('p');
  reason.className = 'end-card__reason';
  reason.textContent = won ? 'You collected every point and kept the data safe.' : `${threatName} caught you.`;

  let championMark;
  if (won) {
    championMark = document.createElement('div');
    championMark.className = 'end-card__champion-mark';
    championMark.setAttribute('aria-hidden', 'true');
    championMark.textContent = '★';
  }

  const scoreBlock = document.createElement('div');
  scoreBlock.className = 'end-card__score';
  scoreBlock.innerHTML = `<small>FINAL SCORE</small><strong>${String(score).padStart(6, '0')}</strong>`;

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'end-card__button';
  button.innerHTML = '<span>PLAY AGAIN</span><span aria-hidden="true">↻</span>';
  button.addEventListener('click', () => {
    overlay.remove();
    scene.scene.restart();
  });

  card.append(status);
  if (championMark) card.append(championMark);
  card.append(title, reason, scoreBlock, button);
  overlay.append(card);
  document.getElementById('game-canvas').append(overlay);
  window.requestAnimationFrame(() => overlay.classList.add('is-visible'));
  button.focus();
}

function togglePause() {
  if (!sceneRef) return;
  if (gameMode === 'running') {
    gameMode = 'paused';
    updateStatus('MISSION PAUSED', 'warning');
    pauseOverlay = sceneRef.add.container(config.width / 2, config.height / 2).setDepth(110);
    const bg = sceneRef.add.rectangle(0, 0, config.width, config.height, 0x171316, .72).setInteractive();
    const title = sceneRef.add.text(0, -15, 'PAUSED', textStyle(34, '#ffffff', 'Bungee')).setOrigin(.5);
    const copy = sceneRef.add.text(0, 30, 'Press P, Esc, or the pause button to resume', textStyle(12, '#d8cfd3')).setOrigin(.5);
    pauseOverlay.add([bg, title, copy]);
  } else if (gameMode === 'paused') {
    gameMode = 'running';
    updateStatus('DEFENSE ACTIVE', 'ready');
    pauseOverlay?.destroy(true);
    pauseOverlay = null;
  }
}

function toggleSound() {
  soundMuted = !soundMuted;
  dom.sound.classList.toggle('muted', soundMuted);
  dom.sound.style.opacity = soundMuted ? '.35' : '';
  dom.sound.setAttribute('aria-label', soundMuted ? 'Enable sound' : 'Mute sound');
  dom.sound.title = soundMuted ? 'Enable sound' : 'Mute sound';
  if (!soundMuted) {
    startAudio();
    playTone(440, .05, 'sine');
  }
}

function startAudio() {
  if (!audioContext) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) audioContext = new AudioCtx();
  }
  if (audioContext?.state === 'suspended') audioContext.resume();
}

function playTone(frequency, duration, type) {
  const now = performance.now();
  if (frequency === 540 && now - lastDotSound < 55) return;
  if (frequency === 540) lastDotSound = now;
  if (soundMuted || !audioContext) return;

  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type;
  oscillator.frequency.value = frequency;
  gain.gain.setValueAtTime(.025, audioContext.currentTime);
  gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
  oscillator.connect(gain);
  gain.connect(audioContext.destination);
  oscillator.start();
  oscillator.stop(audioContext.currentTime + duration);
}

function showToast(message) {
  const toast = sceneRef.add.container(config.width / 2, 50).setDepth(90);
  const bg = sceneRef.add.rectangle(0, 0, 330, 38, 0x171316, .96);
  const accent = sceneRef.add.rectangle(-163, 0, 5, 38, 0xd11269, 1);
  const label = sceneRef.add.text(0, 0, message, textStyle(11, '#ffffff', 'Bungee')).setOrigin(.5);
  toast.add([bg, accent, label]);
  toast.setAlpha(0).setY(36);
  sceneRef.tweens.add({
    targets: toast, alpha: 1, y: 50, duration: 180, hold: 1100, yoyo: true,
    onComplete: () => toast.destroy(true)
  });
}

function syncActor(actor) {
  actor.view.setPosition(actor.x, actor.y);
  actor.shadow.setPosition(actor.x, actor.y + (actor === player ? 13 : 15));
  if (actor === player && actor.dir.x) actor.view.setFlipX(actor.dir.x < 0);
}

function updateStatus(label, state) {
  const dot = state === 'warning' ? 'warning' : state === 'danger' ? 'danger' : '';
  dom.status.innerHTML = `<i class="${dot}"></i> ${label}`;
}

function renderScore() {
  dom.score.textContent = String(score).padStart(6, '0');
  dom.high.textContent = String(Math.max(score, highScore)).padStart(6, '0');
}

function readHighScore() {
  try { return Number(localStorage.getItem('prashanth-man-high-score')) || 0; }
  catch (_error) { return 0; }
}

function updateHighScore() {
  if (score <= highScore) return;
  highScore = score;
  try { localStorage.setItem('prashanth-man-high-score', String(highScore)); }
  catch (_error) { /* Storage may be unavailable in private browsing. */ }
  renderScore();
}

function center(index) { return index * TILE + TILE / 2; }
function isWall(col, row) { return row < 0 || row >= MAZE.length || col < 0 || col >= MAZE[0].length || MAZE[row][col] === '#'; }
function canMove(col, row, dir) { return Boolean(dir) && !isWall(col + dir.x, row + dir.y); }
function isOpposite(a, b) { return Boolean(a && b) && a.x === -b.x && a.y === -b.y && (a.x !== 0 || a.y !== 0); }
function distance(x1, y1, x2, y2) { return Math.hypot(x1 - x2, y1 - y2); }
function textStyle(size, color, family = 'DM Sans') {
  return { fontFamily: family, fontSize: `${size}px`, fontStyle: 'bold', color, letterSpacing: 1 };
}

function crispText(scene, x, y, content, style) {
  return scene.add.text(x, y, content, style).setResolution(TEXT_RESOLUTION);
}
