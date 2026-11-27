// Hot Dog Run: a one-button endless runner. Jump over the obstacles; the run
// speeds up the longer you last. createGame() runs one game inside an element;
// the npm package (src/index.js) wraps it as mount(el), <hot-dog-run> and
// <HotDogRun />. Default art lives in sprites.js; every image can be swapped.

import { DEFAULT_PLAYER, DEFAULT_OBSTACLES, DEFAULT_SPECIALS } from './sprites.js';

// The board never scales its art. Its width follows the element it's mounted
// in (up to 800px), so narrow boards see a shorter stretch of road. Its height
// follows the element too (288-360px): short boards trim sky from the top,
// never the ground or headroom. Give the element a width and a height.
const MAX_WIDTH = 800;
const WORLD_HEIGHT = 360;    // the game world; the board shows its bottom HEIGHT px
const MIN_HEIGHT = 288;      // a small phone in landscape, minus a little margin
const GROUND_Y = 310;        // everything stands on this line (world coordinates)
const FONT = 'monospace';
const TEXT_COLOR = '#000000';
const START_SPEED = 220;     // px per second
const SPEED_PER_SECOND = 0.825; // +0.825 px/s every second survived = +49.5 px/s per minute, smooth
const MAX_SPEED = 700;       // safety limit only (~10 min in); speed keeps climbing until then
const LEG_SWAP_MS = 220;     // ~4.5 steps per second, easy to see each pose
const JUMP_VELOCITY = -540;  // normal jump: ~90px high
const BOOST_VELOCITY = -400; // second press while airborne: one extra push up...
const BOOST_FLOAT = -300;    // ...with lighter gravity so it hangs longer
const SCORE_TICK_MS = 200;   // +1 point every 200ms survived (5 per second)
// Boards narrower than this get smaller score text and the player closer to
// the left edge (a 600px window minus 16px margins)
const SMALL_BOARD = 568;
const DEFAULT_STORAGE_KEY = 'hot-dog-run-hi';
const PATTERN_SEED = 'hot-dog-run';  // change this to get a different (but still fixed) pattern
const FIRST_OBSTACLE_X = 560;        // where the obstacle waiting on the start screen sits

// Player hitbox, as fractions of the player frame (a little forgiving)
const PLAYER_BODY_W = 0.56;
const PLAYER_BODY_TOP = 0.1;

// Small obstacles: a tiny one tucked behind a regular one, and the partner in a
// special combo. Sizes are fractions of that obstacle's largest height.
const TUCK_CHANCE = 0.15;
const TUCK_SIZE = [0.55, 0.7];
const TUCK_GAP = 26;
// Combos: sometimes a special gets a small regular obstacle right next to it.
// All combos are clearable with the mid-air boost; most also with a well-timed
// normal jump.
const COMBO_CHANCE = 0.35;
const COMBO_GAP = 4;                 // px between the two
const COMBO_SIZE = [0.45, 0.55];
const COMBO_EXTRA_GAP_S = 0.4;       // extra room after a combo to land a boosted jump

// Special obstacle schedule:
//   60 points  -> the first special, guaranteed, on its own
//   120 points -> the second special, guaranteed, on its own
//   160+       -> specials mixed in often, at least two regular obstacles between
const FIRST_SPECIAL_AT = 60;
const SECOND_SPECIAL_AT = 120;
const SPECIALS_OFTEN_FROM = 160;
const SPECIAL_CHANCE = 0.45;

const pad = (n) => String(n).padStart(5, '0');

/**
 * Starts the game inside `el` and returns { pause(), resume(), destroy() }.
 * Options are documented in types/index.d.ts and the README.
 */
export function createGame(Phaser, el, options = {}) {
  const pointerTarget = options.pointerTarget || el;
  const storageKey = options.storageKey || DEFAULT_STORAGE_KEY;
  const INVINCIBLE = !!options.invincible;
  const captureKeys = !!options.captureKeys;
  let active = options.active !== false;
  let destroyed = false;

  // Art: defaults, with anything the host passes in on top
  const playerArt = { ...DEFAULT_PLAYER, ...(options.player || {}) };
  const obstacleArt = normalizeObstacles(options.obstacles, DEFAULT_OBSTACLES);
  const specialArt = normalizeObstacles(options.specials, DEFAULT_SPECIALS);
  if (!obstacleArt.length) throw new Error('hot-dog-run: obstacles needs at least one image');

  const containerWidth = () => Math.min(MAX_WIDTH, Math.floor(el.clientWidth) || MAX_WIDTH);
  const boardHeight = () =>
    Math.max(MIN_HEIGHT, Math.min(WORLD_HEIGHT, Math.floor(el.clientHeight) || WORLD_HEIGHT));
  let WIDTH = containerWidth();
  let HEIGHT = boardHeight();

  // Space kept under the ground line: 50px on a full board, down to 30px on the shortest
  const bottomMargin = () => Math.max(30, Math.min(50, HEIGHT - GROUND_Y));
  // How far the camera looks down into the world (0 on a full-height board)
  const cameraTop = () => Math.max(0, GROUND_Y + bottomMargin() - HEIGHT);
  // Ground line's position on screen (for things pinned to the screen)
  const screenGround = () => GROUND_Y - cameraTop();

  let scene = null;
  let player;
  let playerScale = 1;
  let obstacles;
  let score = 0;
  let scoreText;
  let gameOver = false;
  let speed = START_SPEED;
  let spawnTimer;
  let runClock = 0;
  let scoreClock = 0;
  let runTime = 0;             // ms survived this run; drives the speed every frame
  let started = false;
  let hiText;
  let hiScore = loadHiScore();
  let canBoost = false;
  let paused = false;
  let pausedByHost = false;    // paused by pause(), not by P: any jump input carries on
  let pausedText;
  let restartFn = null;
  let gameOverArt = [];
  let waitingObstacle;
  let sinceSpecial = 0;        // obstacles since the last special
  let introShown = 0;          // how many of the two guaranteed specials have appeared
  let rng;

  // High score is remembered in this browser; works without storage too.
  function loadHiScore() {
    try { return parseInt(localStorage.getItem(storageKey), 10) || 0; } catch (e) { return 0; }
  }
  function saveHiScore() {
    try { localStorage.setItem(storageKey, String(hiScore)); } catch (e) {}
  }

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    width: WIDTH,
    height: HEIGHT,
    parent: el,
    backgroundColor: '#ffffff',
    pixelArt: true,
    // Phaser stays out of touch events so swipes on the game still scroll the page.
    // All clicks/taps are handled by one listener on pointerTarget below.
    input: { touch: false },
    audio: { noAudio: true },  // the game has no sound
    banner: false,
    scale: {
      mode: Phaser.Scale.NONE   // 1 game pixel = 1 CSS pixel; we resize ourselves
    },
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { y: 1600 },
        debug: false
      }
    },
    scene: {
      preload: preload,
      create: create,
      update: update
    }
  });

  // Clicks/taps (on the element, or wherever pointerTarget is): start, jump,
  // boost, or restart after game over. Pointer events fire once per tap, so no
  // double jumps.
  const onPointerDown = (e) => {
    if (!active || !scene) return;
    if (e.button !== 0) return;  // primary click / touch only
    if (gameOver) {
      if (restartFn) restartFn();
      return;
    }
    jump.call(scene, e);
  };
  pointerTarget.addEventListener('pointerdown', onPointerDown);

  // Follow the element's size
  const onResize = () => {
    if (destroyed) return;
    const h = boardHeight();
    const w = containerWidth();
    if (w !== WIDTH || h !== HEIGHT || game.scale.height !== HEIGHT) {
      WIDTH = w;
      HEIGHT = h;
      game.scale.resize(WIDTH, HEIGHT);
    }
  };
  const resizeObserver = new ResizeObserver(onResize);
  resizeObserver.observe(el);

  // P pauses / resumes a run in progress: freezes obstacles, score, speed and spawn timer.
  function togglePause() {
    if (!started || gameOver) return;
    paused = !paused;
    if (paused) {
      scene.physics.pause();
      scene.time.paused = true;
      pausedText = scene.add.text(WIDTH / 2, screenGround() - 160, 'PAUSED', { fontSize: '20px', fontFamily: FONT, color: TEXT_COLOR })
        .setOrigin(0.5).setScrollFactor(0).setDepth(2);
    } else {
      pausedByHost = false;
      scene.physics.resume();
      scene.time.paused = false;
      if (pausedText) pausedText.destroy();
    }
  }

  function preload() {
    // Images from another origin need CORS headers to be drawn with WebGL
    this.load.setCORS('anonymous');
    this.load.image('run1', playerArt.run1);
    this.load.image('run2', playerArt.run2);
    this.load.image('jump', playerArt.jump);
    this.load.image('dead', playerArt.dead);   // shown on any crash
    obstacleArt.forEach((o, i) => this.load.image(o.key = 'obstacle-' + i, o.src));
    specialArt.forEach((o, i) => this.load.image(o.key = 'special-' + i, o.src));
  }

  function create(data) {
    scene = this;
    game.canvas.style.display = 'block';
    // First load waits for input; a restart after game over starts right away.
    started = !!(data && data.autostart);
    score = 0;
    gameOver = false;
    speed = START_SPEED;
    runClock = 0;
    scoreClock = 0;
    runTime = 0;
    sinceSpecial = 0;
    introShown = 0;
    // Fixed seed: every run gets the same sequence of obstacles, sizes and gaps
    rng = new Phaser.Math.RandomDataGenerator([PATTERN_SEED]);

    // Static dotted ground line (drawn full max width; narrower boards just clip it)
    const ground = this.add.graphics();
    ground.fillStyle(0x535353, 1);
    for (let x = 0; x < MAX_WIDTH; x += 12) {
      ground.fillRect(x, GROUND_Y, 6, 2);
    }

    // Invisible floor whose top edge is exactly GROUND_Y
    const floor = this.add.rectangle(MAX_WIDTH / 2, GROUND_Y + 10, MAX_WIDTH, 20);
    this.physics.add.existing(floor, true);

    // Player: origin at the feet, standing on the line. Drawn in front of the
    // obstacles so the face (and crash frame) is never hidden.
    player = this.physics.add.sprite(playerX(), GROUND_Y, 'run1').setOrigin(0.5, 1).setDepth(1);
    playerScale = playerArt.height ? playerArt.height / player.height : 1;
    player.setScale(playerScale);
    const bodyW = Math.round(player.width * PLAYER_BODY_W);
    const bodyTop = Math.round(player.height * PLAYER_BODY_TOP);
    player.body.setSize(bodyW, player.height - bodyTop, false);
    player.body.setOffset((player.width - bodyW) / 2, bodyTop);
    this.physics.add.collider(player, floor);

    obstacles = this.physics.add.group({ allowGravity: false, immovable: true });

    // An obstacle is already on screen before the run starts; it begins moving
    // with the game. On narrow screens it sits closer, but always on screen.
    const first = obstacleArt[0];
    const midHeight = (first.height[0] + first.height[1]) / 2;
    waitingObstacle = spawnObstacle(this, first, firstObstacleX() - (WIDTH + 60), [midHeight, midHeight]);
    if (!started) waitingObstacle.body.setVelocityX(0);

    // Top right: "HI 00000" then the current score.
    const scoreStyle = { fontSize: scoreFontSize(), fontFamily: FONT, color: TEXT_COLOR };
    // Pinned to the screen (scroll factor 0), so they stay at the top on short boards
    scoreText = this.add.text(0, 14, '00000', scoreStyle).setOrigin(1, 0).setScrollFactor(0).setDepth(2);
    hiText = this.add.text(0, 14, 'HI ' + pad(hiScore), scoreStyle).setOrigin(1, 0).setScrollFactor(0).setDepth(2);
    gameOverArt = [];
    layout();

    if (INVINCIBLE) {
      this.add.text(8, 8, 'TEST MODE', { fontSize: '11px', fontFamily: FONT, color: '#cc0000' }).setScrollFactor(0);
    }

    // Keep things in place when the board size changes
    this.scale.on('resize', layout);
    this.events.once('shutdown', () => this.scale.off('resize', layout));

    this.input.keyboard.on('keydown-SPACE', jump, this);
    this.input.keyboard.on('keydown-UP', jump, this);
    this.input.keyboard.on('keydown-P', (e) => { if (!e.repeat) togglePause(); });
    if (captureKeys) this.input.keyboard.addCapture('SPACE,UP');
    paused = false;
    pausedByHost = false;

    if (started) scheduleSpawn(this);
    // Mounted while paused: draw this first frame, then stay frozen
    if (!active) applyInactive();
  }

  // Obstacle on the start screen: 560px in, or closer on narrow boards
  const firstObstacleX = () => Math.min(FIRST_OBSTACLE_X, WIDTH - 50);

  // Narrow boards get 25% smaller score text
  const scoreFontSize = () => (WIDTH < SMALL_BOARD ? '15px' : '20px');
  // Player's distance from the left edge (center of the sprite)
  const playerX = () => (WIDTH < SMALL_BOARD ? 70 : 130);

  function layout() {
    // Short boards look at the bottom of the world: ground, obstacles and jump
    // headroom stay in view, extra sky at the top is trimmed
    scene.cameras.main.setScroll(0, cameraTop());
    player.setX(playerX());
    scoreText.setFontSize(scoreFontSize());
    hiText.setFontSize(scoreFontSize());
    scoreText.setX(WIDTH - 16);
    hiText.setX(scoreText.x - scoreText.width - 14);
    gameOverArt.forEach((img) => img.setX(WIDTH / 2).setY(screenGround() + img.groundOffset));
    if (pausedText && pausedText.active) pausedText.setPosition(WIDTH / 2, screenGround() - 160);
    if (!started && waitingObstacle && waitingObstacle.active) {
      waitingObstacle.setX(firstObstacleX());
      waitingObstacle.body.updateFromGameObject();
    }
  }

  function startGame(s) {
    started = true;
    scheduleSpawn(s);
  }

  function update(time, delta) {
    if (!started || gameOver || paused) return;

    const onGround = player.body.blocked.down || player.body.touching.down;

    // Steady leg swap, time-based so it's the same on any screen
    if (onGround) {
      if (player.body.velocity.y >= 0) {
        player.body.setGravityY(0);
        canBoost = false;
      }
      runClock += delta;
      player.setTexture(Math.floor(runClock / LEG_SWAP_MS) % 2 === 0 ? 'run1' : 'run2');
    } else {
      player.setTexture('jump');
    }

    // Score is time survived: +1 every SCORE_TICK_MS
    scoreClock += delta;
    while (scoreClock >= SCORE_TICK_MS) {
      scoreClock -= SCORE_TICK_MS;
      score += 1;
      scoreText.setText(pad(score));
      if (score > hiScore && !INVINCIBLE) {  // test runs never touch the high score
        hiScore = score;
        hiText.setText('HI ' + pad(hiScore));
      }
    }

    // Continuous speed-up from exact time survived: changes a tiny bit every frame, never jumps
    runTime += delta;
    speed = Math.min(MAX_SPEED, START_SPEED + (runTime / 1000) * SPEED_PER_SECOND);

    obstacles.getChildren().forEach((obstacle) => {
      obstacle.body.setVelocityX(-speed);
      if (obstacle.x < -150) obstacle.destroy();
    });

    if (!INVINCIBLE) this.physics.overlap(player, obstacles, hitObstacle, null, this);
  }

  // First press on the ground jumps. One more press while in the air gives a
  // single boost; it resets on landing.
  function jump(input) {
    if (gameOver) return;
    // Holding the key auto-repeats keydown; only a fresh press counts.
    if (input && input.repeat) return;
    if (paused) {
      // Paused because the host page hid the game: the next press carries on
      if (pausedByHost) togglePause();
      return;
    }
    if (!started) {
      startGame(this);
      return;
    }
    if (player.body.blocked.down || player.body.touching.down) {
      player.setVelocityY(JUMP_VELOCITY);
      player.body.setGravityY(0);
      canBoost = true;
    } else if (canBoost) {
      canBoost = false;
      player.setVelocityY(BOOST_VELOCITY);
      player.body.setGravityY(BOOST_FLOAT);
    }
  }

  // Weighted pick from a list of obstacle art
  function pickFrom(list) {
    const total = list.reduce((sum, o) => sum + o.weight, 0);
    let r = rng.frac() * total;
    for (const o of list) {
      r -= o.weight;
      if (r < 0) return o;
    }
    return list[list.length - 1];
  }

  // Returns the art for the next obstacle and whether it's a special
  function pickObstacle() {
    sinceSpecial++;
    if (specialArt.length) {
      if (introShown === 0 && score >= FIRST_SPECIAL_AT) {
        introShown = 1; sinceSpecial = 0;
        return { art: specialArt[0], special: true };
      }
      if (introShown === 1 && score >= SECOND_SPECIAL_AT) {
        introShown = 2; sinceSpecial = 0;
        return { art: specialArt[1 % specialArt.length], special: true };
      }
      if (score >= SPECIALS_OFTEN_FROM && sinceSpecial >= 2 && rng.frac() < SPECIAL_CHANCE) {
        sinceSpecial = 0;
        return { art: pickFrom(specialArt), special: true };
      }
    }
    return { art: pickFrom(obstacleArt), special: false };
  }

  // A height range that's a fraction of an obstacle's largest height
  const smallHeights = (art, [lo, hi]) => [art.height[1] * lo, art.height[1] * hi];

  function scheduleSpawn(s, extraGap = 0) {
    // Uneven gaps in pixels. The shortest gap grows with speed so there's always
    // room to land (~0.85s of travel) before the next obstacle.
    const minGap = Math.max(240, Math.round(speed * 0.85));
    const gap = rng.between(minGap, minGap + 400) + extraGap;
    spawnTimer = s.time.delayedCall((gap / speed) * 1000, () => {
      if (gameOver) return;
      const { art, special } = pickObstacle();
      let nextExtra = 0;
      // Combos only once specials are in the regular mix (the two intro ones stand alone)
      if (special && score >= SPECIALS_OFTEN_FROM && rng.frac() < COMBO_CHANCE) {
        spawnCombo(s, art);
        nextExtra = Math.round(speed * COMBO_EXTRA_GAP_S);
      } else {
        const first = spawnObstacle(s, art, 0);
        // Sometimes a small one tucked right behind a regular one
        if (!special && rng.frac() < TUCK_CHANCE) {
          spawnObstacle(s, art, first.displayWidth / 2 + TUCK_GAP, smallHeights(art, TUCK_SIZE));
        }
      }
      scheduleSpawn(s, nextExtra);
    });
  }

  // A special with a small regular obstacle right before or after it
  function spawnCombo(s, specialArtItem) {
    const partner = pickFrom(obstacleArt);
    const partnerHeights = smallHeights(partner, COMBO_SIZE);
    const partnerFirst = rng.frac() < 0.5;
    const [aArt, aHeights, bArt, bHeights] = partnerFirst
      ? [partner, partnerHeights, specialArtItem, undefined]
      : [specialArtItem, undefined, partner, partnerHeights];
    const a = spawnObstacle(s, aArt, 0, aHeights);
    const b = spawnObstacle(s, bArt, 0, bHeights);
    b.setX(a.x + a.displayWidth / 2 + COMBO_GAP + b.displayWidth / 2);
    b.body.updateFromGameObject();
  }

  function spawnObstacle(s, art, offsetX, heights) {
    const [lo, hi] = heights || art.height;

    // Bottom of the sprite sits exactly on the ground line
    const obstacle = obstacles.create(WIDTH + 60 + offsetX, GROUND_Y, art.key).setOrigin(0.5, 1);
    obstacle.setScale(rng.realInRange(lo, hi) / obstacle.height);

    // Slightly forgiving hitbox, anchored to the ground (sizes are pre-scale)
    const w = obstacle.width, h = obstacle.height;
    obstacle.body.setSize(w * 0.8, h * 0.85, false);
    obstacle.body.setOffset(w * 0.1, h * 0.15);
    obstacle.body.setVelocityX(-speed);
    return obstacle;
  }

  function hitObstacle() {
    if (gameOver) return;
    gameOver = true;
    saveHiScore();
    this.physics.pause();
    if (spawnTimer) spawnTimer.remove();
    player.setTexture('dead');

    makeGameOverTextures(this);
    // Pinned to the screen, a fixed distance above the ground line
    const text = this.add.image(WIDTH / 2, 0, 'gameover-text').setScrollFactor(0).setDepth(2);
    const button = this.add.image(WIDTH / 2, 0, 'restart-btn').setScrollFactor(0).setDepth(2)
      .setInteractive({ useHandCursor: true });
    text.groundOffset = -170;
    button.groundOffset = -138;
    gameOverArt = [text, button];
    layout();

    // Short pause so a held jump doesn't instantly restart.
    // Space, Up, or a click/tap (including the button) restarts.
    this.time.delayedCall(300, () => {
      let done = false;
      const restart = () => {
        if (done) return;
        done = true;
        restartFn = null;
        this.scene.restart({ autostart: true });
      };
      restartFn = restart;
      this.input.keyboard.once('keydown-SPACE', restart);
      this.input.keyboard.once('keydown-UP', restart);
    });
  }

  // ---- Pausing from the host page ----
  function applyInactive() {
    if (started && !gameOver && !paused) {
      togglePause();
      pausedByHost = true;
    }
    if (game.input && game.input.keyboard) game.input.keyboard.enabled = false;
    // Stop drawing frames until resume()
    game.loop.sleep();
  }

  function pause() {
    if (destroyed || !active) return;
    active = false;
    if (scene) applyInactive();  // before the first frame, create() does it
  }

  function resume() {
    if (destroyed || active) return;
    active = true;
    if (!scene) return;
    if (game.input && game.input.keyboard) game.input.keyboard.enabled = true;
    // Start timing fresh so the frozen time isn't counted as one long frame
    game.loop.resetDelta();
    game.loop.wake();
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    active = false;
    pointerTarget.removeEventListener('pointerdown', onPointerDown);
    resizeObserver.disconnect();
    // Removes the canvas and Phaser's own keyboard/mouse/visibility listeners
    game.destroy(true);
  }

  return { pause, resume, destroy };
}

// Accepts strings (image URLs) or { src, height: [min, max] | number, weight }.
// Passing a list replaces the defaults; omitting it keeps them.
function normalizeObstacles(list, defaults) {
  if (list == null) list = defaults;
  return list.map((item) => {
    const o = typeof item === 'string' ? { src: item } : item;
    let height = o.height == null ? [40, 60] : o.height;
    if (typeof height === 'number') height = [height, height];
    return { src: o.src, height, weight: o.weight == null ? 1 : o.weight };
  });
}

// ---- Game over art: drawn from tiny bitmaps so it stays crisp pixel art ----
const PIXEL = 2;              // screen pixels per art pixel
const INK = 0x000000;         // black, same as the score

const GLYPHS = {
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#']
};

// Restart arrow, white on the dark button ('#' = white)
const RESTART_ICON = [
  '....#...',
  '.#####..',
  '.#..#...',
  '.#....#.',
  '.#....#.',
  '.######.'
];

function drawBitmap(g, rows, ox, oy, color) {
  g.fillStyle(color, 1);
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (row[x] === '#') g.fillRect((ox + x) * PIXEL, (oy + y) * PIXEL, PIXEL, PIXEL);
    }
  });
}

function makeGameOverTextures(scene) {
  if (scene.textures.exists('gameover-text')) return;

  // "GAME OVER" with a little letter spacing
  const LETTER_GAP = 3, WORD_GAP = 5;
  const g = scene.make.graphics({ add: false });
  let x = 0;
  for (const ch of 'GAME OVER') {
    if (ch === ' ') { x += WORD_GAP; continue; }
    drawBitmap(g, GLYPHS[ch], x, 0, INK);
    x += 5 + LETTER_GAP;
  }
  g.generateTexture('gameover-text', (x - LETTER_GAP) * PIXEL, 7 * PIXEL);
  g.destroy();

  // Small rounded button with the restart arrow centered
  const BW = 12, BH = 10;
  const b = scene.make.graphics({ add: false });
  b.fillStyle(INK, 1);
  b.fillRect(PIXEL, 0, (BW - 2) * PIXEL, BH * PIXEL);
  b.fillRect(0, PIXEL, BW * PIXEL, (BH - 2) * PIXEL);
  drawBitmap(b, RESTART_ICON, (BW - RESTART_ICON[0].length) / 2, Math.floor((BH - RESTART_ICON.length) / 2), 0xffffff);
  b.generateTexture('restart-btn', BW * PIXEL, BH * PIXEL);
  b.destroy();
}
