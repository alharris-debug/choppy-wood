import Phaser from 'phaser';

// === DEV TOGGLES - Set to false before release ===
const DEV_GOD_MODE = false;
const DEV_HOTKEYS = false; // Axe tier keys (1-3, 0) and sky theme keys (7-9)
// =================================================

export default class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: 'GameScene' });
  }

  // init() is called every time the scene starts/restarts (before create)
  init() {
    // Game state - reset on every restart
    this.score = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.multiplier = 1;
    this.gameOver = false;
    this.isRestarting = false;
    this.lives = 3;
    this.maxLives = 3;

    // Load high score from localStorage
    this.highScore = this.loadHighScore();

    // Timing config (in ms)
    this.baseDropTime = 1000;
    this.currentDropTime = 1000;
    this.minDropTime = 280;

    // Current log state
    this.currentLog = null;
    this.logState = 'waiting';
    this.chopWindow = { start: 0, end: 0 };
    this.chopTimer = null;
    this.landingTime = 0;
    this.lastMissTime = 0;
    this.inputLocked = false;

    // Clear references from previous game
    this.axe = null;
    this.hearts = [];
    this.axeTrail = [];

    // Axe head style - locked to Simple Hatchet (style 1)
    this.axeHeadStyle = 1;
  }

  preload() {
    // Load background music
    this.load.audio('bgm', 'audio/bgm.mp3');
  }

  create() {
    const { width, height } = this.scale;

    // Initialize sound system
    this.initSounds();

    // Background gradient
    this.createBackground(width, height);

    // Ground with grass
    this.createGround(width, height);

    // Detailed chopping block
    this.createChoppingBlock(width, height);

    // Axe with swing mechanics - pivot is at handle bottom (grip point)
    this.axe = this.createAxe(0, 0);
    this.axe.setScale(1.6); // Bigger axe!
    this.axe.setPosition(width / 2 + 110, height - 60); // Grip positioned - further from base
    this.axe.setAngle(25); // Ready position - more upright, slightly leaning back

    // Motion trail for axe swing
    this.axeTrail = [];
    for (let i = 0; i < 5; i++) {
      const trail = this.add.graphics();
      trail.setAlpha(0);
      this.axeTrail.push(trail);
    }

    // === UI BACKING ===
    // Soft, translucent backing for UI - fits the calm aesthetic
    this.uiBackingLeft = this.add.graphics();
    this.uiBackingLeft.fillStyle(0x000000, 0.25);
    this.uiBackingLeft.fillRoundedRect(8, 8, 190, 130, 12);
    this.uiBackingLeft.setDepth(199);

    this.uiBackingRight = this.add.graphics();
    this.uiBackingRight.fillStyle(0x000000, 0.25);
    this.uiBackingRight.fillRoundedRect(width - 135, 8, 127, 80, 12);
    this.uiBackingRight.setDepth(199);

    // Score display with rolling animation support
    this.displayedScore = 0;
    this.scoreText = this.add.text(20, 20, 'Score: 0', {
      fontSize: '26px',
      fontFamily: 'Arial Black',
      color: '#f0f0f0',
      stroke: '#1a1a1a',
      strokeThickness: 3
    });
    this.scoreText.setDepth(200);

    // High score display - softer gold
    this.highScoreText = this.add.text(width - 20, 55, 'Best: ' + this.highScore, {
      fontSize: '16px',
      fontFamily: 'Arial Black',
      color: '#e8d090',
      stroke: '#1a1a1a',
      strokeThickness: 2
    }).setOrigin(1, 0).setDepth(200);

    // Streak container with flame effect - centered in left panel (panel: x=8, w=190, center=103)
    this.streakContainer = this.add.container(103, 68);
    this.streakContainer.setDepth(200);
    this.streakText = this.add.text(0, 0, 'Streak: 0', {
      fontSize: '20px',
      fontFamily: 'Arial Black',
      color: '#e8d080',
      stroke: '#1a1a1a',
      strokeThickness: 2
    }).setOrigin(0.5, 0.5);
    this.streakContainer.add(this.streakText);

    // Streak flame particles (hidden initially)
    this.createStreakFlame();

    // Multiplier with glow effect - softer styling
    this.multiplierContainer = this.add.container(width - 20, 20);
    this.multiplierContainer.setDepth(200);
    this.multiplierGlow = this.add.circle(0, 20, 25, 0xd08040, 0);
    this.multiplierText = this.add.text(0, 0, 'x1', {
      fontSize: '28px',
      fontFamily: 'Arial Black',
      color: '#d08040',
      stroke: '#1a1a1a',
      strokeThickness: 3
    }).setOrigin(1, 0);
    this.multiplierContainer.add([this.multiplierGlow, this.multiplierText]);

    // Lives display (logs) - centered in left panel (panel: x=8, w=190, center=103)
    this.heartsContainer = this.add.container(103, 105);
    this.heartsContainer.setScale(1.8);
    this.heartsContainer.setDepth(200);
    this.hearts = [];
    this.createHeartsDisplay();

    // Tap instruction - softer styling
    this.instructionText = this.add.text(width / 2, height / 2 - 50, 'TAP TO CHOP!', {
      fontSize: '32px',
      fontFamily: 'Arial Black',
      color: '#f0ebe0',
      stroke: '#2a2520',
      strokeThickness: 4
    }).setOrigin(0.5);

    // Feedback text (for Perfect!, Good!, etc.) - cleaner styling
    this.feedbackText = this.add.text(width / 2, height / 2, '', {
      fontSize: '36px',
      fontFamily: 'Arial Black',
      color: '#90d090',
      stroke: '#1a2a1a',
      strokeThickness: 4
    }).setOrigin(0.5).setAlpha(0);

    // Input handling
    this.input.on('pointerdown', () => this.handleTap());

    // Keyboard support
    this.input.keyboard.on('keydown-SPACE', () => this.handleTap());

    // === DEV: Test hotkeys (enable with DEV_HOTKEYS = true) ===
    if (DEV_HOTKEYS) {
      // Axe tier keys: 1=gold, 2=flame, 3=sapphire, 0=reset
      this.input.keyboard.on('keydown-ONE', () => { this.axe.axeTier = 0; this.makeAxeGolden(); });
      this.input.keyboard.on('keydown-TWO', () => { this.axe.axeTier = 1; this.makeAxeFlame(); });
      this.input.keyboard.on('keydown-THREE', () => { this.axe.axeTier = 2; this.makeAxeSapphire(); });
      this.input.keyboard.on('keydown-ZERO', () => this.resetAxeTier());
      // Sky theme keys: 7=space, 8=galaxy, 9=lightspeed
      this.input.keyboard.on('keydown-SEVEN', () => { this.streak = 150; this.updateBackgroundTheme(); });
      this.input.keyboard.on('keydown-EIGHT', () => { this.streak = 200; this.updateBackgroundTheme(); });
      this.input.keyboard.on('keydown-NINE', () => { this.streak = 250; this.updateBackgroundTheme(); });
    }
    // ==========================================================

    // === DESIGN MODE: Cycle axe head styles (disabled - locked to Hatchet) ===
    // this.input.keyboard.on('keydown-A', () => this.cycleAxeHeadStyle());
    // =========================================================

    // Particle emitter for wood chips
    this.createParticles();

    // Start first log after brief delay
    this.time.delayedCall(1000, () => this.dropLog());
  }

  createBackground(width, height) {
    // Sky themes based on streak milestones
    // Muted, harmonious color palette - calm forest aesthetic
    this.skyThemes = {
      dawn: { top: 0xd4c4b0, mid: 0xc9b8a8, bottom: 0xa8c0b8, tree: 0x3d4a3a, foliage: 0x4a5a48, mountain: 0x8a9088, mountainFar: 0xa0a8a0 },
      day: { top: 0xa8c8d8, mid: 0xb8d0d8, bottom: 0xc8dce0, tree: 0x4a5040, foliage: 0x3a4a38, mountain: 0x7a8a80, mountainFar: 0x9aa8a0 },
      sunset: { top: 0xc8a090, mid: 0xd0b8a0, bottom: 0xd8c8a8, tree: 0x4a3830, foliage: 0x6a5040, mountain: 0x807068, mountainFar: 0x989088 },
      dusk: { top: 0x4a5560, mid: 0x606a70, bottom: 0x706860, tree: 0x2a3030, foliage: 0x384040, mountain: 0x505858, mountainFar: 0x687070 },
      night: { top: 0x1a2030, mid: 0x283040, bottom: 0x303840, tree: 0x202828, foliage: 0x283030, mountain: 0x2a3238, mountainFar: 0x384048 },
      aurora: { top: 0x1a2838, mid: 0x2a3848, bottom: 0x406058, tree: 0x203030, foliage: 0x305048, mountain: 0x2a4040, mountainFar: 0x385050 },
      space: { top: 0x0a0a18, mid: 0x101028, bottom: 0x181830, tree: 0x151520, foliage: 0x1a1a28, mountain: 0x1a1a2a, mountainFar: 0x252538 },
      galaxy: { top: 0x0f0820, mid: 0x1a1040, bottom: 0x280a50, tree: 0x120818, foliage: 0x1a1028, mountain: 0x1a0a30, mountainFar: 0x2a1848 },
      lightspeed: { top: 0x000008, mid: 0x000818, bottom: 0x001030, tree: 0x000510, foliage: 0x000818, mountain: 0x000a18, mountainFar: 0x001028 }
    };
    this.currentTheme = 'day';

    // Sky gradient (stored for updates)
    this.skyGraphics = this.add.graphics();
    this.drawSky(width, height, this.skyThemes.day);

    // Sun/Moon
    // Soft sun/moon - muted glow
    this.celestialBody = this.add.circle(width - 60, 80, 22, 0xf0e8d0);
    this.celestialGlow = this.add.circle(width - 60, 80, 40, 0xf0e8d0, 0.15);

    // === MOUNTAINS ===
    this.mountainsGraphics = this.add.graphics();
    this.drawMountains(width, height, this.skyThemes.day);

    // === ANIMATED CLOUDS ===
    this.clouds = [];
    for (let i = 0; i < 5; i++) {
      const cloud = this.createCloud(
        Math.random() * width,
        50 + Math.random() * 120,
        0.5 + Math.random() * 0.5
      );
      this.clouds.push(cloud);

      // Drift animation
      this.tweens.add({
        targets: cloud,
        x: cloud.x + width + 200,
        duration: 30000 + Math.random() * 20000,
        repeat: -1,
        onRepeat: () => {
          cloud.x = -150;
          cloud.y = 50 + Math.random() * 120;
        }
      });
    }

    // Far trees (parallax layer - slower)
    this.farTrees = this.add.container(0, 0);
    for (let i = 0; i < 8; i++) {
      const x = 30 + i * (width / 6);
      const tree = this.createDetailedTree(x, height - 60, 0.5, true);
      this.farTrees.add(tree);
    }

    // Near trees (parallax layer - main)
    this.nearTrees = this.add.container(0, 0);
    this.treeElements = [];
    for (let i = 0; i < 5; i++) {
      const x = 50 + i * (width / 5);
      const tree = this.createDetailedTree(x, height - 60, 1, false);
      this.nearTrees.add(tree);
      this.treeElements.push(tree);
      
      // Gentle tree sway - slow, staggered timing
      this.tweens.add({
        targets: tree,
        angle: { from: -2, to: 2 },
        duration: 3000 + Math.random() * 2000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: Math.random() * 2000
      });
    }
    
    // Also sway far trees (more subtle)
    this.farTrees.each((tree) => {
      this.tweens.add({
        targets: tree,
        angle: { from: -1, to: 1 },
        duration: 4000 + Math.random() * 2000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        delay: Math.random() * 3000
      });
    });

    // === SOFT VIGNETTE ===
    // Frames the action, keeps focus on center
    this.vignette = this.add.graphics();
    // Top edge
    this.vignette.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.3, 0.3, 0, 0);
    this.vignette.fillRect(0, 0, width, 80);
    // Bottom edge
    this.vignette.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0, 0.25, 0.25);
    this.vignette.fillRect(0, height - 60, width, 60);
    // Left edge
    this.vignette.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0.2, 0, 0.2, 0);
    this.vignette.fillRect(0, 0, 40, height);
    // Right edge
    this.vignette.fillGradientStyle(0x000000, 0x000000, 0x000000, 0x000000, 0, 0.2, 0, 0.2);
    this.vignette.fillRect(width - 40, 0, 40, height);
    this.vignette.setDepth(100); // Above most elements but below UI

    // Floating particles in background (dust motes / fireflies at night)
    this.bgParticles = [];
    // Reduced count, more subtle - ethereal spores/pollen
    for (let i = 0; i < 10; i++) {
      const particle = this.add.circle(
        Math.random() * width,
        Math.random() * (height - 150),
        Math.random() * 1.5 + 0.5,
        0xe8e0d8,
        Math.random() * 0.15 + 0.05
      );
      this.bgParticles.push(particle);

      // Ethereal floating - slow upward drift like spores/pollen
      this.tweens.add({
        targets: particle,
        y: particle.y - 30 - Math.random() * 20,
        x: particle.x + (Math.random() * 20 - 10),
        alpha: { from: particle.alpha, to: 0.02 },
        duration: 6000 + Math.random() * 4000,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          // Reset particle to bottom and restart
          particle.y = height - 100 + Math.random() * 50;
          particle.x = Math.random() * width;
          particle.setAlpha(Math.random() * 0.12 + 0.03);
          this.tweens.add({
            targets: particle,
            y: particle.y - 30 - Math.random() * 20,
            x: particle.x + (Math.random() * 20 - 10),
            alpha: 0.02,
            duration: 6000 + Math.random() * 4000,
            ease: 'Sine.easeInOut',
            repeat: -1,
            yoyo: false
          });
        }
      });
    }

    // === SPACE EFFECTS (hidden until space theme) ===
    this.createSpaceEffects(width, height);
  }

  createSpaceEffects(width, height) {
    // Twinkling stars
    this.stars = [];
    for (let i = 0; i < 50; i++) {
      const star = this.add.circle(
        Math.random() * width,
        Math.random() * (height - 200),
        Math.random() * 2 + 0.5,
        0xffffff,
        Math.random() * 0.8 + 0.2
      );
      star.setVisible(false);
      this.stars.push(star);
      
      // Twinkle animation
      this.tweens.add({
        targets: star,
        alpha: { from: star.alpha, to: Math.random() * 0.3 + 0.1 },
        duration: 500 + Math.random() * 1000,
        yoyo: true,
        repeat: -1,
        delay: Math.random() * 2000
      });
    }

    // Planets (for galaxy theme)
    this.planets = [];
    const planetColors = [0xff6644, 0x44aaff, 0xffaa44, 0xaa66ff, 0x66ffaa];
    for (let i = 0; i < 3; i++) {
      const planetContainer = this.add.container(
        100 + Math.random() * (width - 200),
        50 + Math.random() * 150
      );
      
      // Planet body
      const size = 8 + Math.random() * 12;
      const color = planetColors[Math.floor(Math.random() * planetColors.length)];
      const planet = this.add.circle(0, 0, size, color);
      
      // Planet glow
      const glow = this.add.circle(0, 0, size + 4, color, 0.2);
      
      // Ring for some planets
      if (Math.random() > 0.5) {
        const ring = this.add.ellipse(0, 0, size * 3, size * 0.8, color, 0.4);
        ring.setAngle(Math.random() * 30 - 15);
        planetContainer.add(ring);
      }
      
      planetContainer.add([glow, planet]);
      planetContainer.setVisible(false);
      planetContainer.setScale(0.8);
      this.planets.push(planetContainer);
      
      // Slow orbit drift
      this.tweens.add({
        targets: planetContainer,
        x: planetContainer.x + (Math.random() * 40 - 20),
        y: planetContainer.y + (Math.random() * 20 - 10),
        duration: 10000 + Math.random() * 5000,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }

    // Lightspeed streaks
    this.lightspeedStreaks = [];
    for (let i = 0; i < 30; i++) {
      const streak = this.add.rectangle(
        Math.random() * width,
        Math.random() * height,
        Math.random() * 100 + 50,
        1,
        0xffffff,
        Math.random() * 0.6 + 0.2
      );
      streak.setVisible(false);
      streak.setAngle(-15);
      this.lightspeedStreaks.push(streak);
    }
  }

  updateSpaceEffects(theme) {
    const isSpace = theme === 'space' || theme === 'galaxy' || theme === 'lightspeed';
    const isGalaxy = theme === 'galaxy' || theme === 'lightspeed';
    const isLightspeed = theme === 'lightspeed';

    // Stars visible in space+
    this.stars.forEach(star => star.setVisible(isSpace));
    
    // Planets visible in galaxy+
    this.planets.forEach(planet => planet.setVisible(isGalaxy));
    
    // Lightspeed streaks
    if (isLightspeed && !this.lightspeedActive) {
      this.lightspeedActive = true;
      this.lightspeedStreaks.forEach((streak, i) => {
        streak.setVisible(true);
        // Animate streaks flying across screen
        this.tweens.add({
          targets: streak,
          x: streak.x + 800,
          duration: 200 + Math.random() * 300,
          repeat: -1,
          onRepeat: () => {
            streak.x = -100;
            streak.y = Math.random() * this.scale.height;
          }
        });
      });
    } else if (!isLightspeed && this.lightspeedActive) {
      this.lightspeedActive = false;
      this.lightspeedStreaks.forEach(streak => {
        this.tweens.killTweensOf(streak);
        streak.setVisible(false);
      });
    }
  }

  drawSky(width, height, theme) {
    this.skyGraphics.clear();
    // Use gradient fills to eliminate visible segment lines
    const step = height / 3;
    
    // Top to mid gradient
    this.skyGraphics.fillGradientStyle(theme.top, theme.top, theme.mid, theme.mid, 1, 1, 1, 1);
    this.skyGraphics.fillRect(0, 0, width, step + 2);
    
    // Mid to bottom gradient
    this.skyGraphics.fillGradientStyle(theme.mid, theme.mid, theme.bottom, theme.bottom, 1, 1, 1, 1);
    this.skyGraphics.fillRect(0, step, width, step + 2);
    
    // Bottom solid (extends to edge)
    this.skyGraphics.fillStyle(theme.bottom);
    this.skyGraphics.fillRect(0, step * 2, width, step + 2);
  }

  drawMountains(width, height, theme) {
    const g = this.mountainsGraphics;
    g.clear();

    // Far mountain range (lighter, more distant)
    g.fillStyle(theme.mountainFar || 0x7a8a7a);
    g.beginPath();
    g.moveTo(0, height - 200);
    g.lineTo(60, height - 280);
    g.lineTo(100, height - 250);
    g.lineTo(150, height - 320);
    g.lineTo(200, height - 260);
    g.lineTo(250, height - 290);
    g.lineTo(320, height - 240);
    g.lineTo(380, height - 300);
    g.lineTo(width, height - 220);
    g.lineTo(width, height - 150);
    g.lineTo(0, height - 150);
    g.closePath();
    g.fillPath();

    // Snow caps on far mountains
    g.fillStyle(0xffffff, 0.4);
    g.beginPath();
    g.moveTo(140, height - 310);
    g.lineTo(150, height - 320);
    g.lineTo(160, height - 308);
    g.closePath();
    g.fillPath();
    g.beginPath();
    g.moveTo(370, height - 292);
    g.lineTo(380, height - 300);
    g.lineTo(390, height - 290);
    g.closePath();
    g.fillPath();

    // Near mountain range (darker, closer)
    g.fillStyle(theme.mountain || 0x5a6a5a);
    g.beginPath();
    g.moveTo(0, height - 150);
    g.lineTo(40, height - 200);
    g.lineTo(80, height - 170);
    g.lineTo(140, height - 230);
    g.lineTo(200, height - 180);
    g.lineTo(260, height - 210);
    g.lineTo(340, height - 165);
    g.lineTo(400, height - 195);
    g.lineTo(width, height - 160);
    g.lineTo(width, height - 60);
    g.lineTo(0, height - 60);
    g.closePath();
    g.fillPath();

    // Mountain texture (ridges)
    g.lineStyle(1, 0x4a5a4a, 0.3);
    g.beginPath();
    g.moveTo(140, height - 230);
    g.lineTo(160, height - 180);
    g.strokePath();
    g.beginPath();
    g.moveTo(260, height - 210);
    g.lineTo(280, height - 165);
    g.strokePath();
  }

  createCloud(x, y, scale) {
    const cloud = this.add.container(x, y);

    // Cloud is made of overlapping circles
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 0.8);

    // Main body
    g.fillCircle(0, 0, 25 * scale);
    g.fillCircle(-20 * scale, 5 * scale, 20 * scale);
    g.fillCircle(25 * scale, 5 * scale, 22 * scale);
    g.fillCircle(10 * scale, -10 * scale, 18 * scale);
    g.fillCircle(-10 * scale, -8 * scale, 15 * scale);

    // Subtle highlight on top
    g.fillStyle(0xffffff, 0.95);
    g.fillCircle(-5 * scale, -12 * scale, 12 * scale);

    // Shadow on bottom
    g.fillStyle(0xddeeff, 0.6);
    g.fillCircle(5 * scale, 10 * scale, 18 * scale);

    cloud.add(g);
    return cloud;
  }

  createDetailedTree(x, baseY, scale, isFar) {
    const tree = this.add.container(x, baseY);
    const g = this.add.graphics();

    const alpha = isFar ? 0.5 : 1;
    const trunkHeight = (80 + Math.random() * 40) * scale;
    const trunkWidth = 12 * scale;

    // Trunk shadow
    g.fillStyle(0x2a1a10, alpha);
    g.fillRect(-trunkWidth / 2 + 2, -trunkHeight, trunkWidth, trunkHeight);

    // Trunk
    g.fillStyle(0x4a3020, alpha);
    g.fillRect(-trunkWidth / 2, -trunkHeight - 2, trunkWidth - 2, trunkHeight);

    // Trunk texture lines
    g.lineStyle(1, 0x3a2015, alpha * 0.5);
    for (let ty = -trunkHeight; ty < -5; ty += 15 * scale) {
      g.beginPath();
      g.moveTo(-trunkWidth / 2 + 2, ty);
      g.lineTo(-trunkWidth / 2 + 2, ty + 10 * scale);
      g.strokePath();
    }

    // Foliage layers (multiple triangles for pine tree effect)
    const foliageColor = isFar ? 0x1d4a17 : 0x2d5a27;
    const foliageDark = isFar ? 0x153a10 : 0x1d4a17;

    // Bottom layer (widest)
    g.fillStyle(foliageDark, alpha);
    const bottomY = -trunkHeight + 10 * scale;
    g.beginPath();
    g.moveTo(0, bottomY - 50 * scale);
    g.lineTo(-40 * scale, bottomY);
    g.lineTo(40 * scale, bottomY);
    g.closePath();
    g.fillPath();

    // Middle layer
    g.fillStyle(foliageColor, alpha);
    const midY = bottomY - 25 * scale;
    g.beginPath();
    g.moveTo(0, midY - 45 * scale);
    g.lineTo(-32 * scale, midY);
    g.lineTo(32 * scale, midY);
    g.closePath();
    g.fillPath();

    // Top layer
    const topY = midY - 20 * scale;
    g.beginPath();
    g.moveTo(0, topY - 35 * scale);
    g.lineTo(-22 * scale, topY);
    g.lineTo(22 * scale, topY);
    g.closePath();
    g.fillPath();

    // Snow/highlight on edges
    if (!isFar) {
      g.fillStyle(0xffffff, 0.15);
      g.beginPath();
      g.moveTo(0, topY - 35 * scale);
      g.lineTo(-15 * scale, topY - 10 * scale);
      g.lineTo(0, topY - 15 * scale);
      g.closePath();
      g.fillPath();
    }

    tree.add(g);
    return tree;
  }

  updateBackgroundTheme() {
    const { width, height } = this.scale;
    let newTheme = 'day';

    if (this.streak >= 250) newTheme = 'lightspeed';
    else if (this.streak >= 200) newTheme = 'galaxy';
    else if (this.streak >= 150) newTheme = 'space';
    else if (this.streak >= 100) newTheme = 'aurora';
    else if (this.streak >= 50) newTheme = 'night';
    else if (this.streak >= 25) newTheme = 'dusk';
    else if (this.streak >= 10) newTheme = 'sunset';
    else if (this.streak >= 5) newTheme = 'dawn';

    if (newTheme !== this.currentTheme) {
      this.currentTheme = newTheme;
      const theme = this.skyThemes[newTheme];

      // Animate sky transition
      this.drawSky(width, height, theme);

      // Update mountains
      this.drawMountains(width, height, theme);

      // Update space effects visibility
      this.updateSpaceEffects(newTheme);

      // Update sun/moon
      const isNight = newTheme === 'night' || newTheme === 'aurora' || newTheme === 'dusk';
      const celestialColor = isNight ? 0xe8e8f0 : 0xfff4a0;
      const glowColor = isNight ? 0xaaaacc : 0xfff4a0;

      this.tweens.add({
        targets: this.celestialBody,
        fillColor: celestialColor,
        duration: 1000
      });
      this.tweens.add({
        targets: this.celestialGlow,
        fillColor: glowColor,
        alpha: isNight ? 0.15 : 0.3,
        duration: 1000
      });

      // Update cloud opacity for night
      const cloudAlpha = isNight ? 0.3 : 0.8;
      this.clouds.forEach(cloud => {
        this.tweens.add({
          targets: cloud,
          alpha: cloudAlpha,
          duration: 500
        });
      });

      // Update particle glow for night/aurora
      const particleColor = (newTheme === 'night' || newTheme === 'aurora') ? 0x00ffaa : 0xffffff;
      const particleAlpha = (newTheme === 'night' || newTheme === 'aurora') ? 0.6 : 0.2;
      this.bgParticles.forEach(p => {
        this.tweens.add({
          targets: p,
          fillColor: particleColor,
          fillAlpha: particleAlpha,
          duration: 500
        });
      });
    }
  }

  createGround(width, height) {
    const g = this.add.graphics();

    // Dirt base layer
    g.fillStyle(0x3d2817);
    g.fillRect(0, height - 60, width, 60);

    // Darker dirt underneath
    g.fillStyle(0x2d1810);
    g.fillRect(0, height - 20, width, 20);

    // Dirt texture variation
    g.fillStyle(0x4a3520);
    for (let i = 0; i < 20; i++) {
      const x = Math.random() * width;
      const w = 20 + Math.random() * 40;
      g.fillRect(x, height - 55 + Math.random() * 10, w, 8);
    }

    // Grass tufts on top
    g.fillStyle(0x3d6b2d);
    for (let x = 0; x < width; x += 8) {
      const grassHeight = 8 + Math.random() * 12;
      const baseY = height - 58;

      // Each tuft has 3 blades
      g.beginPath();
      g.moveTo(x, baseY);
      g.lineTo(x - 2 + Math.random() * 2, baseY - grassHeight);
      g.lineTo(x + 2, baseY);
      g.closePath();
      g.fillPath();

      g.beginPath();
      g.moveTo(x + 3, baseY);
      g.lineTo(x + 4 + Math.random() * 3, baseY - grassHeight * 0.8);
      g.lineTo(x + 6, baseY);
      g.closePath();
      g.fillPath();
    }

    // Lighter grass highlights
    g.fillStyle(0x4d8b3d);
    for (let x = 5; x < width; x += 15) {
      const grassHeight = 6 + Math.random() * 8;
      const baseY = height - 58;

      g.beginPath();
      g.moveTo(x, baseY);
      g.lineTo(x + 1, baseY - grassHeight);
      g.lineTo(x + 3, baseY);
      g.closePath();
      g.fillPath();
    }

    // Small rocks/pebbles
    const rockColors = [0x6b6b6b, 0x7a7a7a, 0x5a5a5a];
    for (let i = 0; i < 8; i++) {
      const rx = Math.random() * width;
      const ry = height - 45 + Math.random() * 15;
      const rw = 4 + Math.random() * 6;
      g.fillStyle(rockColors[Math.floor(Math.random() * 3)]);
      g.fillEllipse(rx, ry, rw, rw * 0.6);
    }
  }

  createChoppingBlock(width, height) {
    const block = this.add.container(width / 2, height - 85);
    const g = this.add.graphics();

    // === GROUND SHADOW ===
    g.fillStyle(0x000000, 0.25);
    g.fillEllipse(0, 58, 90, 22);

    // === EXPOSED ROOTS ===
    // Root 1 - left
    g.fillStyle(0x3a2515);
    g.beginPath();
    g.moveTo(-50, 50);
    g.lineTo(-75, 55);
    g.lineTo(-80, 52);
    g.lineTo(-70, 48);
    g.lineTo(-50, 45);
    g.closePath();
    g.fillPath();
    g.fillStyle(0x4a3520);
    g.beginPath();
    g.moveTo(-52, 47);
    g.lineTo(-70, 50);
    g.lineTo(-68, 48);
    g.lineTo(-52, 45);
    g.closePath();
    g.fillPath();

    // Root 2 - right
    g.fillStyle(0x3a2515);
    g.beginPath();
    g.moveTo(45, 52);
    g.lineTo(68, 56);
    g.lineTo(72, 53);
    g.lineTo(65, 50);
    g.lineTo(45, 48);
    g.closePath();
    g.fillPath();

    // Root 3 - front
    g.fillStyle(0x35200f);
    g.beginPath();
    g.moveTo(-10, 55);
    g.lineTo(-5, 62);
    g.lineTo(8, 60);
    g.lineTo(5, 55);
    g.closePath();
    g.fillPath();

    // === STUMP BASE ===
    // Outer bark
    g.fillStyle(0x2a1a0f);
    g.beginPath();
    g.moveTo(-58, 52);
    g.lineTo(-62, 30);
    g.lineTo(-60, 5);
    g.lineTo(-55, -15);
    g.lineTo(-48, -28);
    g.lineTo(-30, -35);
    g.lineTo(-5, -38);
    g.lineTo(20, -36);
    g.lineTo(42, -30);
    g.lineTo(52, -18);
    g.lineTo(58, 0);
    g.lineTo(60, 25);
    g.lineTo(56, 52);
    g.closePath();
    g.fillPath();

    // Mid bark
    g.fillStyle(0x3d2815);
    g.beginPath();
    g.moveTo(-54, 50);
    g.lineTo(-57, 28);
    g.lineTo(-55, 5);
    g.lineTo(-50, -12);
    g.lineTo(-44, -24);
    g.lineTo(-28, -31);
    g.lineTo(-5, -34);
    g.lineTo(18, -32);
    g.lineTo(38, -26);
    g.lineTo(48, -15);
    g.lineTo(54, 2);
    g.lineTo(55, 26);
    g.lineTo(52, 50);
    g.closePath();
    g.fillPath();

    // Inner bark
    g.fillStyle(0x4a3520);
    g.beginPath();
    g.moveTo(-48, 48);
    g.lineTo(-50, 25);
    g.lineTo(-48, 5);
    g.lineTo(-44, -8);
    g.lineTo(-38, -18);
    g.lineTo(-25, -25);
    g.lineTo(-5, -28);
    g.lineTo(15, -26);
    g.lineTo(32, -22);
    g.lineTo(42, -12);
    g.lineTo(48, 5);
    g.lineTo(49, 25);
    g.lineTo(46, 48);
    g.closePath();
    g.fillPath();

    // === BARK TEXTURE ===
    g.lineStyle(2, 0x1a0f05, 0.7);
    [-42, -30, -18, -5, 8, 22, 35].forEach(x => {
      g.beginPath();
      g.moveTo(x, 48);
      g.lineTo(x + 2, 15);
      g.lineTo(x - 1, -15);
      g.strokePath();
    });

    // Bark highlights
    g.lineStyle(1, 0x5a4530, 0.4);
    g.beginPath();
    g.moveTo(-35, 40);
    g.lineTo(-33, 10);
    g.strokePath();
    g.beginPath();
    g.moveTo(15, 42);
    g.lineTo(17, 5);
    g.strokePath();

    // === MOSS PATCHES ===
    g.fillStyle(0x4a6040, 0.6);
    g.fillEllipse(-45, 20, 8, 12);
    g.fillStyle(0x3a5030, 0.5);
    g.fillEllipse(-43, 35, 6, 8);
    g.fillStyle(0x4a6840, 0.4);
    g.fillEllipse(40, 28, 7, 10);

    // === TOP SURFACE ===
    // Bark edge
    g.fillStyle(0x3d2815);
    g.fillEllipse(0, -32, 55, 24);

    // Cut wood
    g.fillStyle(0xb89868);
    g.fillEllipse(0, -32, 48, 20);

    // Wood grain layers
    g.fillStyle(0xa08050);
    g.fillEllipse(-5, -33, 38, 15);
    g.fillStyle(0xc8a878);
    g.fillEllipse(-3, -32, 28, 11);
    g.fillStyle(0xa88858);
    g.fillEllipse(-2, -33, 18, 7);

    // Heartwood
    g.fillStyle(0x705035);
    g.fillEllipse(0, -33, 10, 5);

    // Cracks
    g.lineStyle(2, 0x6a5030, 0.6);
    g.beginPath();
    g.moveTo(0, -33);
    g.lineTo(-20, -38);
    g.strokePath();
    g.beginPath();
    g.moveTo(0, -33);
    g.lineTo(15, -26);
    g.strokePath();
    g.lineStyle(1, 0x6a5030, 0.4);
    g.beginPath();
    g.moveTo(0, -33);
    g.lineTo(-12, -25);
    g.strokePath();

    // Axe marks
    g.lineStyle(2, 0x907858, 0.5);
    g.beginPath();
    g.moveTo(-18, -36);
    g.lineTo(8, -30);
    g.strokePath();
    g.beginPath();
    g.moveTo(-10, -40);
    g.lineTo(12, -35);
    g.strokePath();

    // Wood knot
    g.fillStyle(0x5a4025);
    g.fillEllipse(18, -30, 6, 4);
    g.fillStyle(0x6a5035);
    g.fillEllipse(18, -30, 4, 2.5);

    // Top highlight
    g.fillStyle(0xffffff, 0.12);
    g.fillEllipse(-12, -38, 22, 7);

    // === WOOD CHIPS ===
    g.fillStyle(0xc49464);
    g.fillEllipse(-55, 54, 5, 2.5);
    g.fillEllipse(-35, 56, 4, 2);
    g.fillEllipse(42, 55, 5, 2);
    g.fillStyle(0xb88454);
    g.fillEllipse(-20, 58, 6, 2.5);
    g.fillEllipse(25, 57, 4, 2);
    g.fillEllipse(55, 53, 4, 2);
    g.fillStyle(0xd4a474, 0.7);
    g.fillEllipse(50, 56, 12, 4);

    block.add(g);
    this.block = block;
  }

  createAxe(x, y) {
    const axeGroup = this.add.container(x, y);
    const g = this.add.graphics();

    axeGroup.add(g);

    // Store graphics reference for tier effects
    axeGroup.axeGraphics = g;
    axeGroup.axeTier = 0; // 0=normal, 1=gold, 2=flame, 3=sapphire

    // Draw initial axe using the modular system
    this.axe = axeGroup; // Temporarily set so redraw works
    this.redrawAxeGraphics(0);

    return axeGroup;
  }

  makeAxeGolden() {
    if (!this.axe || this.axe.axeTier >= 1) return;
    this.axe.axeTier = 1;
    this.redrawAxeGraphics(1);

    // Effects
    this.playUpgradeSound(1);
    this.shakeScreen(4, 150);
    this.showUpgradeFlash(0xffd700, this.axe.x - 25, this.axe.y - 50);
    this.sparks.emitParticleAt(this.axe.x - 20, this.axe.y - 40, 30);

    // Flash effect with size increase (7% bigger)
    this.tweens.add({
      targets: this.axe,
      scale: { from: 2.0, to: 1.712 },
      duration: 300,
      ease: 'Back.easeOut'
    });
    this.showFeedback('GOLDEN AXE!', '#ffd700');
  }

  makeAxeFlame() {
    if (!this.axe || this.axe.axeTier >= 2) return;
    this.axe.axeTier = 2;
    this.redrawAxeGraphics(2);

    // Effects - more intense
    this.playUpgradeSound(2);
    this.shakeScreen(6, 200);
    this.showUpgradeFlash(0xff4422, this.axe.x - 25, this.axe.y - 50);
    this.sparks.emitParticleAt(this.axe.x - 20, this.axe.y - 40, 40);

    // Flash effect with size increase (14% bigger than base)
    this.tweens.add({
      targets: this.axe,
      scale: { from: 2.1, to: 1.824 },
      duration: 300,
      ease: 'Back.easeOut'
    });
    this.showFeedback('FLAME AXE!', '#ff4422');
  }

  makeAxeSapphire() {
    if (!this.axe || this.axe.axeTier >= 3) return;
    this.axe.axeTier = 3;
    this.redrawAxeGraphics(3);

    // Effects - most intense
    this.playUpgradeSound(3);
    this.shakeScreen(8, 250);
    this.showUpgradeFlash(0x4488ff, this.axe.x - 25, this.axe.y - 50);
    this.sparks.emitParticleAt(this.axe.x - 20, this.axe.y - 40, 50);

    // Flash effect with size increase (21% bigger than base)
    this.tweens.add({
      targets: this.axe,
      scale: { from: 2.2, to: 1.936 },
      duration: 300,
      ease: 'Back.easeOut'
    });
    this.showFeedback('SAPPHIRE AXE!', '#4488ff');
  }

  resetAxeTier() {
    if (!this.axe) return;
    this.axe.axeTier = 0;
    this.redrawAxeGraphics(0);
    this.axe.setScale(1.6); // Reset to base size
  }

  cycleAxeHeadStyle() {
    const styleNames = ['Nordic Bearded', 'Simple Hatchet', 'Broad Axe', 'Double-Bit', 'War Axe'];
    this.axeHeadStyle = (this.axeHeadStyle + 1) % 5;
    this.redrawAxeGraphics(this.axe.axeTier);
    this.showFeedback(`Style ${this.axeHeadStyle}: ${styleNames[this.axeHeadStyle]}`, '#ffffff');
  }

  getColorPalette(tier) {
    const palettes = {
      0: { // Normal - gray metal
        handleShadow: 0x3d2010, handleBase: 0x6b4423, handleGrain1: 0x8b5a2b, handleGrain2: 0x7a4a1b,
        handleWrap: 0x4a3728, handleWrapLine: 0x3a2718, handleCap: 0x5a4020,
        collar1: 0x555555, collar2: 0x666666,
        bladeBack: 0x4a4a4a, bladeMain: 0x707070, bladeEdge: 0xa8a8a8,
        bladeHighlight: 0xcccccc, edgeGlint: 0xeeeeee, bladeShadow: 0x3a3a3a,
        notch1: 0x555555, notch2: 0x666666
      },
      1: { // Golden
        handleShadow: 0x4a3010, handleBase: 0x7a5020, handleGrain1: 0x9a6830, handleGrain2: 0x8a5820,
        handleWrap: 0x6a4020, handleWrapLine: 0x5a3010, handleCap: 0x7a5020,
        collar1: 0x8b7000, collar2: 0xa08000,
        bladeBack: 0xb8860b, bladeMain: 0xdaa520, bladeEdge: 0xffd700,
        bladeHighlight: 0xffec8b, edgeGlint: 0xfffacd, bladeShadow: 0x8b6914,
        notch1: 0xb8860b, notch2: 0xcd9b1d
      },
      2: { // Flame
        handleShadow: 0x3d1010, handleBase: 0x5a2020, handleGrain1: 0x7a3030, handleGrain2: 0x6a2525,
        handleWrap: 0x4a1818, handleWrapLine: 0x3a1010, handleCap: 0x5a2020,
        collar1: 0x8b2500, collar2: 0xa03000,
        bladeBack: 0x8b0000, bladeMain: 0xcc3300, bladeEdge: 0xff4500,
        bladeHighlight: 0xff6347, edgeGlint: 0xff7f50, bladeShadow: 0x660000,
        notch1: 0x8b0000, notch2: 0xb22222
      },
      3: { // Sapphire
        handleShadow: 0x102040, handleBase: 0x203050, handleGrain1: 0x304060, handleGrain2: 0x283858,
        handleWrap: 0x182848, handleWrapLine: 0x102038, handleCap: 0x203050,
        collar1: 0x1e4080, collar2: 0x2850a0,
        bladeBack: 0x0047ab, bladeMain: 0x4169e1, bladeEdge: 0x6495ed,
        bladeHighlight: 0x87ceeb, edgeGlint: 0xb0e0e6, bladeShadow: 0x00008b,
        notch1: 0x0047ab, notch2: 0x4682b4
      }
    };
    return palettes[tier] || palettes[0];
  }

  drawAxeHandle(g, p) {
    g.fillStyle(p.handleShadow);
    g.fillRoundedRect(-4, -5, 14, 95, 3);
    g.fillStyle(p.handleBase);
    g.fillRoundedRect(-5, -8, 12, 90, 2);
    g.fillStyle(p.handleGrain1);
    g.fillRoundedRect(-3, -6, 3, 85, 1);
    g.fillStyle(p.handleGrain2);
    g.fillRoundedRect(2, -4, 2, 82, 1);
    g.fillStyle(p.handleWrap);
    g.fillRect(-6, 60, 14, 20);
    g.lineStyle(2, p.handleWrapLine);
    for (let wy = 62; wy < 78; wy += 4) {
      g.beginPath();
      g.moveTo(-6, wy);
      g.lineTo(8, wy);
      g.strokePath();
    }
    g.fillStyle(p.handleCap);
    g.fillRoundedRect(-6, 78, 14, 6, 2);
  }

  drawAxeHead_Nordic(g, p) {
    // Style 0: Nordic/Bearded - curved blade with beard extending down
    g.fillStyle(p.collar1);
    g.fillRect(-8, -12, 18, 16);
    g.fillStyle(p.collar2);
    g.fillRect(-6, -10, 14, 12);

    g.fillStyle(p.bladeBack);
    g.beginPath();
    g.moveTo(-8, -10);
    g.lineTo(-25, -18);
    g.lineTo(-42, -12);
    g.lineTo(-50, 5);
    g.lineTo(-42, 22);
    g.lineTo(-20, 18);
    g.lineTo(-8, 8);
    g.closePath();
    g.fillPath();

    g.fillStyle(p.bladeMain);
    g.beginPath();
    g.moveTo(-8, -8);
    g.lineTo(-24, -15);
    g.lineTo(-40, -10);
    g.lineTo(-47, 5);
    g.lineTo(-40, 19);
    g.lineTo(-20, 15);
    g.lineTo(-8, 6);
    g.closePath();
    g.fillPath();

    g.fillStyle(p.bladeEdge);
    g.beginPath();
    g.moveTo(-40, -10);
    g.lineTo(-47, 5);
    g.lineTo(-40, 19);
    g.lineTo(-52, 5);
    g.closePath();
    g.fillPath();

    g.fillStyle(p.bladeHighlight, 0.4);
    g.beginPath();
    g.moveTo(-12, -6);
    g.lineTo(-28, -13);
    g.lineTo(-42, -8);
    g.lineTo(-46, 0);
    g.lineTo(-40, -5);
    g.lineTo(-25, -8);
    g.lineTo(-12, -3);
    g.closePath();
    g.fillPath();

    g.lineStyle(2, p.edgeGlint, 0.6);
    g.beginPath();
    g.moveTo(-48, -4);
    g.lineTo(-50, 5);
    g.lineTo(-48, 14);
    g.strokePath();

    g.fillStyle(p.notch1);
    g.fillCircle(-25, 0, 3);
    g.fillStyle(p.notch2);
    g.fillCircle(-25, 0, 2);
  }

  drawAxeHead_Hatchet(g, p) {
    // Style 1: Simple Hatchet - compact triangular head
    g.fillStyle(p.collar1);
    g.fillRect(-7, -10, 16, 14);
    g.fillStyle(p.collar2);
    g.fillRect(-5, -8, 12, 10);

    // Simple wedge shape
    g.fillStyle(p.bladeBack);
    g.beginPath();
    g.moveTo(-7, -12);
    g.lineTo(-35, -20);
    g.lineTo(-45, 0);
    g.lineTo(-35, 20);
    g.lineTo(-7, 12);
    g.closePath();
    g.fillPath();

    g.fillStyle(p.bladeMain);
    g.beginPath();
    g.moveTo(-7, -10);
    g.lineTo(-32, -17);
    g.lineTo(-42, 0);
    g.lineTo(-32, 17);
    g.lineTo(-7, 10);
    g.closePath();
    g.fillPath();

    // Sharp edge
    g.fillStyle(p.bladeEdge);
    g.beginPath();
    g.moveTo(-38, -14);
    g.lineTo(-48, 0);
    g.lineTo(-38, 14);
    g.lineTo(-42, 0);
    g.closePath();
    g.fillPath();

    // Highlight
    g.fillStyle(p.bladeHighlight, 0.5);
    g.beginPath();
    g.moveTo(-10, -8);
    g.lineTo(-30, -14);
    g.lineTo(-38, -5);
    g.lineTo(-35, 0);
    g.lineTo(-25, -5);
    g.lineTo(-10, -4);
    g.closePath();
    g.fillPath();

    g.lineStyle(2, p.edgeGlint, 0.7);
    g.beginPath();
    g.moveTo(-44, -8);
    g.lineTo(-48, 0);
    g.lineTo(-44, 8);
    g.strokePath();
  }

  drawAxeHead_Broad(g, p) {
    // Style 2: Broad Axe - wide flat blade for felling
    g.fillStyle(p.collar1);
    g.fillRect(-8, -8, 18, 12);
    g.fillStyle(p.collar2);
    g.fillRect(-6, -6, 14, 8);

    // Wide rectangular-ish blade
    g.fillStyle(p.bladeBack);
    g.beginPath();
    g.moveTo(-8, -15);
    g.lineTo(-50, -25);
    g.lineTo(-55, 0);
    g.lineTo(-50, 25);
    g.lineTo(-8, 15);
    g.closePath();
    g.fillPath();

    g.fillStyle(p.bladeMain);
    g.beginPath();
    g.moveTo(-8, -12);
    g.lineTo(-46, -22);
    g.lineTo(-52, 0);
    g.lineTo(-46, 22);
    g.lineTo(-8, 12);
    g.closePath();
    g.fillPath();

    // Curved cutting edge
    g.fillStyle(p.bladeEdge);
    g.beginPath();
    g.moveTo(-48, -20);
    g.lineTo(-58, 0);
    g.lineTo(-48, 20);
    g.lineTo(-52, 0);
    g.closePath();
    g.fillPath();

    // Top highlight
    g.fillStyle(p.bladeHighlight, 0.4);
    g.beginPath();
    g.moveTo(-10, -10);
    g.lineTo(-44, -19);
    g.lineTo(-50, -10);
    g.lineTo(-48, 0);
    g.lineTo(-40, -8);
    g.lineTo(-10, -5);
    g.closePath();
    g.fillPath();

    g.lineStyle(3, p.edgeGlint, 0.6);
    g.beginPath();
    g.moveTo(-54, -12);
    g.lineTo(-58, 0);
    g.lineTo(-54, 12);
    g.strokePath();

    // Decorative line
    g.lineStyle(2, p.bladeShadow);
    g.beginPath();
    g.moveTo(-20, -10);
    g.lineTo(-20, 10);
    g.strokePath();
  }

  drawAxeHead_DoubleBit(g, p) {
    // Style 3: Double-Bit - blades on both sides
    g.fillStyle(p.collar1);
    g.fillRect(-6, -6, 14, 12);
    g.fillStyle(p.collar2);
    g.fillRect(-4, -4, 10, 8);

    // Left blade
    g.fillStyle(p.bladeBack);
    g.beginPath();
    g.moveTo(-6, -10);
    g.lineTo(-35, -18);
    g.lineTo(-45, 0);
    g.lineTo(-35, 18);
    g.lineTo(-6, 10);
    g.closePath();
    g.fillPath();

    g.fillStyle(p.bladeMain);
    g.beginPath();
    g.moveTo(-6, -8);
    g.lineTo(-32, -15);
    g.lineTo(-42, 0);
    g.lineTo(-32, 15);
    g.lineTo(-6, 8);
    g.closePath();
    g.fillPath();

    g.fillStyle(p.bladeEdge);
    g.beginPath();
    g.moveTo(-38, -12);
    g.lineTo(-48, 0);
    g.lineTo(-38, 12);
    g.lineTo(-42, 0);
    g.closePath();
    g.fillPath();

    // Right blade (mirror)
    g.fillStyle(p.bladeBack);
    g.beginPath();
    g.moveTo(8, -10);
    g.lineTo(35, -18);
    g.lineTo(45, 0);
    g.lineTo(35, 18);
    g.lineTo(8, 10);
    g.closePath();
    g.fillPath();

    g.fillStyle(p.bladeMain);
    g.beginPath();
    g.moveTo(8, -8);
    g.lineTo(32, -15);
    g.lineTo(42, 0);
    g.lineTo(32, 15);
    g.lineTo(8, 8);
    g.closePath();
    g.fillPath();

    g.fillStyle(p.bladeEdge);
    g.beginPath();
    g.moveTo(38, -12);
    g.lineTo(48, 0);
    g.lineTo(38, 12);
    g.lineTo(42, 0);
    g.closePath();
    g.fillPath();

    // Highlights
    g.fillStyle(p.bladeHighlight, 0.4);
    g.beginPath();
    g.moveTo(-8, -6);
    g.lineTo(-30, -12);
    g.lineTo(-38, -4);
    g.lineTo(-30, -6);
    g.lineTo(-8, -3);
    g.closePath();
    g.fillPath();

    g.lineStyle(2, p.edgeGlint, 0.6);
    g.beginPath();
    g.moveTo(-44, -6);
    g.lineTo(-48, 0);
    g.lineTo(-44, 6);
    g.strokePath();
    g.beginPath();
    g.moveTo(44, -6);
    g.lineTo(48, 0);
    g.lineTo(44, 6);
    g.strokePath();
  }

  drawAxeHead_War(g, p) {
    // Style 4: War Axe - aggressive angular design
    g.fillStyle(p.collar1);
    g.fillRect(-8, -10, 18, 16);
    g.fillStyle(p.collar2);
    g.fillRect(-6, -8, 14, 12);

    // Aggressive angular blade
    g.fillStyle(p.bladeBack);
    g.beginPath();
    g.moveTo(-8, -12);
    g.lineTo(-20, -28);  // Upper spike
    g.lineTo(-45, -15);
    g.lineTo(-55, 5);    // Main edge
    g.lineTo(-45, 25);
    g.lineTo(-15, 22);   // Lower hook
    g.lineTo(-8, 10);
    g.closePath();
    g.fillPath();

    g.fillStyle(p.bladeMain);
    g.beginPath();
    g.moveTo(-8, -10);
    g.lineTo(-18, -24);
    g.lineTo(-42, -12);
    g.lineTo(-50, 5);
    g.lineTo(-42, 22);
    g.lineTo(-14, 19);
    g.lineTo(-8, 8);
    g.closePath();
    g.fillPath();

    // Sharp edge with hook
    g.fillStyle(p.bladeEdge);
    g.beginPath();
    g.moveTo(-45, -12);
    g.lineTo(-55, 5);
    g.lineTo(-45, 22);
    g.lineTo(-50, 5);
    g.closePath();
    g.fillPath();

    // Upper spike edge
    g.fillStyle(p.bladeEdge);
    g.beginPath();
    g.moveTo(-18, -24);
    g.lineTo(-22, -30);
    g.lineTo(-42, -14);
    g.lineTo(-42, -12);
    g.closePath();
    g.fillPath();

    // Highlight
    g.fillStyle(p.bladeHighlight, 0.4);
    g.beginPath();
    g.moveTo(-10, -8);
    g.lineTo(-16, -20);
    g.lineTo(-40, -10);
    g.lineTo(-48, 0);
    g.lineTo(-40, -5);
    g.lineTo(-20, -10);
    g.lineTo(-10, -5);
    g.closePath();
    g.fillPath();

    g.lineStyle(2, p.edgeGlint, 0.6);
    g.beginPath();
    g.moveTo(-50, -8);
    g.lineTo(-55, 5);
    g.lineTo(-50, 18);
    g.strokePath();

    // Decorative rivet
    g.fillStyle(p.notch1);
    g.fillCircle(-25, 2, 4);
    g.fillStyle(p.notch2);
    g.fillCircle(-25, 2, 2);
  }

  redrawAxeGraphics(tier) {
    if (!this.axe || !this.axe.axeGraphics) return;

    const g = this.axe.axeGraphics;
    g.clear();

    const p = this.getColorPalette(tier);

    // Draw handle (same for all styles)
    this.drawAxeHandle(g, p);

    // Draw axe head based on current style
    switch (this.axeHeadStyle) {
      case 0: this.drawAxeHead_Nordic(g, p); break;
      case 1: this.drawAxeHead_Hatchet(g, p); break;
      case 2: this.drawAxeHead_Broad(g, p); break;
      case 3: this.drawAxeHead_DoubleBit(g, p); break;
      case 4: this.drawAxeHead_War(g, p); break;
      default: this.drawAxeHead_Nordic(g, p);
    }

    g.y = -84;
  }

  createParticles() {
    const graphics = this.add.graphics();

    graphics.fillStyle(0xdeb887);
    graphics.fillRect(0, 0, 12, 4);
    graphics.generateTexture('splinter', 12, 4);

    graphics.clear();
    graphics.fillStyle(0xd4a574);
    graphics.fillCircle(2, 2, 2);
    graphics.generateTexture('sawdust', 4, 4);

    graphics.clear();
    graphics.fillStyle(0xffff00);
    graphics.fillCircle(3, 3, 3);
    graphics.generateTexture('spark', 6, 6);

    graphics.clear();
    graphics.fillStyle(0xffffff);
    graphics.fillCircle(4, 4, 4);
    graphics.generateTexture('dust', 8, 8);

    graphics.destroy();

    this.splinters = this.add.particles(0, 0, 'splinter', {
      speed: { min: 200, max: 450 },
      angle: { min: 200, max: 340 },
      scale: { start: 1.2, end: 0.3 },
      rotate: { start: 0, end: 360 },
      lifespan: 500,
      gravityY: 600,
      quantity: 0,
      emitting: false,
      tint: [0xdeb887, 0xd2691e, 0xc4a46b, 0x8b7355]
    });

    this.sawdust = this.add.particles(0, 0, 'sawdust', {
      speed: { min: 50, max: 150 },
      angle: { min: 180, max: 360 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 0.8, end: 0 },
      lifespan: 700,
      gravityY: 50,
      quantity: 0,
      emitting: false,
      tint: [0xdeb887, 0xd4a574, 0xc9a067]
    });

    this.sparks = this.add.particles(0, 0, 'spark', {
      speed: { min: 150, max: 350 },
      angle: { min: 0, max: 360 },
      scale: { start: 1, end: 0 },
      alpha: { start: 1, end: 0 },
      lifespan: 300,
      quantity: 0,
      emitting: false,
      tint: [0xffd700, 0xffaa00, 0xffff00, 0xffffff]
    });

    this.landingDust = this.add.particles(0, 0, 'dust', {
      speed: { min: 30, max: 80 },
      angle: { min: 160, max: 200 },
      scale: { start: 0.5, end: 1.5 },
      alpha: { start: 0.4, end: 0 },
      lifespan: 400,
      quantity: 0,
      emitting: false,
      tint: 0xd4c4a8
    });
  }

  createStreakFlame() {
    const graphics = this.add.graphics();
    graphics.fillStyle(0xff6600);
    graphics.fillCircle(4, 4, 4);
    graphics.generateTexture('flame', 8, 8);
    graphics.destroy();

    this.streakFlame = this.add.particles(80, 10, 'flame', {
      speed: { min: 20, max: 50 },
      angle: { min: 260, max: 280 },
      scale: { start: 0.6, end: 0 },
      alpha: { start: 0.8, end: 0 },
      lifespan: 400,
      frequency: 50,
      tint: [0xff6600, 0xff4400, 0xffaa00, 0xff0000],
      emitting: false
    });
    this.streakContainer.add(this.streakFlame);
  }

  createHeartsDisplay() {
    // Safely destroy existing hearts
    if (this.hearts && this.hearts.length > 0) {
      this.hearts.forEach(h => {
        if (h && h.destroy) h.destroy();
      });
    }
    this.hearts = [];

    const heartSpacing = 28;
    const totalWidth = (this.maxLives - 1) * heartSpacing;
    const startX = -totalWidth / 2; // Center the logs
    for (let i = 0; i < this.maxLives; i++) {
      const heart = this.createHeart(startX + i * heartSpacing, 0);
      heart.setAlpha(i < this.lives ? 1 : 0.3);
      this.heartsContainer.add(heart);
      this.hearts.push(heart);
    }
  }

  createHeart(x, y) {
    // Log cross-section with tree rings
    const g = this.add.graphics();
    g.setPosition(x, y);

    // Bark (outer ring)
    g.fillStyle(0x4a3728);
    g.fillCircle(0, 0, 10);

    // Wood (inner)
    g.fillStyle(0xc4a574);
    g.fillCircle(0, 0, 8);

    // Tree rings
    g.lineStyle(1, 0xa08060, 0.6);
    g.strokeCircle(0, 0, 6);
    g.strokeCircle(0, 0, 4);
    g.strokeCircle(0, 0, 2);

    // Center dot
    g.fillStyle(0x8b6914);
    g.fillCircle(0, 0, 1.5);

    // Highlight
    g.fillStyle(0xffffff, 0.3);
    g.fillCircle(-3, -3, 2);

    return g;
  }

  loseLife() {
    if (this.lives <= 0) return;
    this.lives--;
    if (this.hearts[this.lives]) {
      const heart = this.hearts[this.lives];
      this.tweens.add({
        targets: heart,
        scale: { from: 1.3, to: 0.8 },
        alpha: 0.3,
        duration: 300,
        ease: 'Back.easeIn'
      });
    }
    if (this.lives <= 0) {
      this.triggerGameOver();
    }
  }

  triggerGameOver() {
    this.gameOver = true;
    const { width, height } = this.scale;
    if (this.chopTimer) this.chopTimer.remove();
    if (this.currentLog) {
      this.tweens.killTweensOf(this.currentLog);
      this.currentLog.destroy();
      this.currentLog = null;
    }

    this.gameOverOverlay = this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0);
    this.gameOverOverlay.setDepth(200);
    this.tweens.add({ targets: this.gameOverOverlay, fillAlpha: 0.7, duration: 500 });

    this.gameOverText = this.add.text(width / 2, height / 2 - 100, 'GAME OVER', {
      fontSize: '48px', fontFamily: 'Arial Black', color: '#ff4444', stroke: '#000000', strokeThickness: 6
    }).setOrigin(0.5).setDepth(201).setScale(0);
    this.tweens.add({ targets: this.gameOverText, scale: 1, duration: 500, ease: 'Back.easeOut', delay: 200 });

    const isNewHighScore = this.checkAndUpdateHighScore();

    this.finalScoreText = this.add.text(width / 2, height / 2 - 30, 'Score: ' + this.score, {
      fontSize: '36px', fontFamily: 'Arial Black', color: '#ffffff', stroke: '#000000', strokeThickness: 4
    }).setOrigin(0.5).setDepth(201).setAlpha(0);
    this.tweens.add({ targets: this.finalScoreText, alpha: 1, duration: 300, delay: 500 });

    this.highScoreDisplay = this.add.text(width / 2, height / 2 + 20,
      isNewHighScore ? 'NEW HIGH SCORE!' : 'High Score: ' + this.highScore, {
      fontSize: isNewHighScore ? '26px' : '24px', fontFamily: 'Arial Black', color: '#ffd700', stroke: '#000000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(201).setAlpha(0);
    this.tweens.add({
      targets: this.highScoreDisplay, alpha: 1, scale: isNewHighScore ? { from: 0.5, to: 1 } : 1,
      duration: isNewHighScore ? 500 : 300, delay: 550, ease: isNewHighScore ? 'Back.easeOut' : 'Linear'
    });

    this.bestStreakText = this.add.text(width / 2, height / 2 + 55, 'Best Streak: ' + this.bestStreak, {
      fontSize: '20px', fontFamily: 'Arial Black', color: '#ffaa00', stroke: '#000000', strokeThickness: 3
    }).setOrigin(0.5).setDepth(201).setAlpha(0);
    this.tweens.add({ targets: this.bestStreakText, alpha: 1, duration: 300, delay: 650 });

    this.restartText = this.add.text(width / 2, height / 2 + 100, 'TAP TO RESTART', {
      fontSize: '28px', fontFamily: 'Arial Black', color: '#ffffff', stroke: '#000000', strokeThickness: 4
    }).setOrigin(0.5).setDepth(201).setAlpha(0);
    this.tweens.add({
      targets: this.restartText, alpha: 1, duration: 300, delay: 800,
      onComplete: () => {
        this.tweens.add({ targets: this.restartText, scale: { from: 1, to: 1.1 }, duration: 500, yoyo: true, repeat: -1 });
      }
    });

    this.playGameOverSound();
  }

  playGameOverSound() {
    if (!this.soundEnabled || !this.audioContext) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const notes = [400, 350, 300, 200];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const startTime = now + i * 0.15;
      gain.gain.setValueAtTime(0.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.3);
    });
  }

  initSounds() {
    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    this.soundEnabled = true;
    this.musicPlaying = false;
    this.musicWasPlaying = false; // Track if music was playing before app went to background

    this.input.once('pointerdown', () => {
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      if (!this.musicPlaying) {
        this.startBackgroundMusic();
      }
    });

    // Handle app going to background (pause audio) and foreground (resume audio)
    this.setupVisibilityHandling();
  }

  setupVisibilityHandling() {
    // Store bound handler so we can remove it on scene shutdown if needed
    this.visibilityHandler = () => {
      if (document.hidden) {
        // App went to background - pause all audio
        this.musicWasPlaying = this.musicPlaying && this.bgMusic?.isPlaying;
        if (this.bgMusic && this.bgMusic.isPlaying) {
          this.bgMusic.pause();
        }
        if (this.audioContext && this.audioContext.state === 'running') {
          this.audioContext.suspend();
        }
      } else {
        // App came to foreground - resume audio if it was playing
        if (this.audioContext && this.audioContext.state === 'suspended') {
          this.audioContext.resume();
        }
        if (this.musicWasPlaying && this.bgMusic) {
          this.bgMusic.resume();
        }
      }
    };

    document.addEventListener('visibilitychange', this.visibilityHandler);
  }

  startBackgroundMusic() {
    // Check if music is already playing (persists across scene restarts)
    if (this.bgMusic && this.bgMusic.isPlaying) return;
    if (this.musicPlaying) return;
    
    this.bgMusic = this.sound.add('bgm', { loop: true, volume: 0.15 });
    this.bgMusic.play();
    this.musicPlaying = true;
  }

  stopBackgroundMusic() {
    if (this.bgMusic && this.musicPlaying) {
      this.bgMusic.stop();
      this.musicPlaying = false;
    }
  }

  playChopSound(quality) {
    if (!this.soundEnabled || !this.audioContext) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const settings = {
      perfect: { freq: 180, duration: 0.15, gain: 0.4, detune: 200 },
      good: { freq: 150, duration: 0.12, gain: 0.35, detune: 100 },
      ok: { freq: 120, duration: 0.1, gain: 0.3, detune: 0 }
    };
    const s = settings[quality] || settings.ok;

    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(s.freq, now);
    osc1.frequency.exponentialRampToValueAtTime(40, now + s.duration);
    gain1.gain.setValueAtTime(s.gain, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + s.duration);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + s.duration);

    const bufferSize = ctx.sampleRate * 0.08;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
    }
    const noise = ctx.createBufferSource();
    const noiseGain = ctx.createGain();
    const noiseFilter = ctx.createBiquadFilter();
    noise.buffer = buffer;
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 2000 + s.detune;
    noiseFilter.Q.value = 1;
    noiseGain.gain.setValueAtTime(s.gain * 0.6, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noise.start(now);
  }

  playWhooshSound() {
    if (!this.soundEnabled || !this.audioContext) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const bufferSize = ctx.sampleRate * 0.15;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      const env = Math.sin((i / bufferSize) * Math.PI);
      data[i] = (Math.random() * 2 - 1) * env * 0.3;
    }
    const noise = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    noise.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(500, now);
    filter.frequency.linearRampToValueAtTime(2000, now + 0.08);
    filter.frequency.linearRampToValueAtTime(800, now + 0.15);
    filter.Q.value = 2;
    gain.gain.value = 0.2;
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
  }

  playMissSound() {
    if (!this.soundEnabled || !this.audioContext) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.2);
    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  playStreakSound(milestone) {
    if (!this.soundEnabled || !this.audioContext) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime;
    const notes = {
      5: [261, 329, 392],
      10: [329, 392, 493],
      25: [392, 493, 587],
      50: [493, 587, 698],
      100: [587, 698, 880, 1046]
    };
    const freqs = notes[milestone] || [440, 554, 659];
    freqs.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const startTime = now + i * 0.08;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.2, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.3);
    });
  }

  playUpgradeSound(tier) {
    if (!this.soundEnabled || !this.audioContext) return;
    const ctx = this.audioContext;
    const now = ctx.currentTime;

    // Different sounds for each tier
    const tierSounds = {
      1: { // Golden - rising chime
        notes: [523, 659, 784, 1047], // C5, E5, G5, C6
        type: 'sine',
        duration: 0.15,
        delay: 0.06
      },
      2: { // Flame - powerful chord with rumble
        notes: [392, 494, 587, 784], // G4, B4, D5, G5
        type: 'sawtooth',
        duration: 0.2,
        delay: 0.04
      },
      3: { // Sapphire - crystalline shimmer
        notes: [880, 1109, 1319, 1760], // A5, C#6, E6, A6
        type: 'sine',
        duration: 0.25,
        delay: 0.05
      }
    };

    const sound = tierSounds[tier] || tierSounds[1];

    // Play ascending notes
    sound.notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = sound.type;
      osc.frequency.value = freq;

      const startTime = now + i * sound.delay;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.25, startTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + sound.duration);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + sound.duration);
    });

    // Add a shimmer/sparkle effect
    const shimmerCount = tier + 2;
    for (let i = 0; i < shimmerCount; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 2000 + Math.random() * 2000;

      const startTime = now + Math.random() * 0.3;
      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.08, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.1);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.1);
    }
  }

  shakeScreen(intensity = 5, duration = 200) {
    const camera = this.cameras.main;
    camera.shake(duration, intensity / 1000);
  }

  showUpgradeFlash(color, x, y) {
    // Create radial glow flash
    const flash = this.add.graphics();
    flash.setDepth(150);

    // Draw expanding rings
    const rings = [];
    for (let i = 0; i < 3; i++) {
      const ring = this.add.graphics();
      ring.setDepth(150);
      ring.lineStyle(4 - i, color, 0.8 - i * 0.2);
      ring.strokeCircle(x, y, 20);
      rings.push(ring);

      // Animate each ring expanding outward
      this.tweens.add({
        targets: ring,
        scaleX: 3 + i,
        scaleY: 3 + i,
        alpha: 0,
        duration: 400 + i * 100,
        delay: i * 50,
        ease: 'Cubic.easeOut',
        onComplete: () => ring.destroy()
      });
    }

    // Central flash
    flash.fillStyle(color, 0.6);
    flash.fillCircle(x, y, 30);

    this.tweens.add({
      targets: flash,
      alpha: 0,
      scaleX: 2,
      scaleY: 2,
      duration: 300,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy()
    });
  }

  updateStreakDisplay() {
    this.streakText.setText('Streak: ' + this.streak);
    if (this.streak >= 5) {
      // Streak flame disabled for now (TODO: revisit effect)
      // this.streakFlame.start();
      this.tweens.add({ targets: this.streakText, scale: { from: 1.1, to: 1 }, duration: 100, ease: 'Power1' });
    } else {
      // this.streakFlame.stop();
    }
    if (this.streak >= 50) {
      this.streakText.setColor('#c090c0');
    } else if (this.streak >= 25) {
      this.streakText.setColor('#80b0b0');
    } else if (this.streak >= 10) {
      this.streakText.setColor('#d09060');
    } else if (this.streak >= 5) {
      this.streakText.setColor('#d0a070');
    } else {
      this.streakText.setColor('#e8d080');
    }
  }

  animateScoreRoll(targetScore) {
    this.tweens.addCounter({
      from: this.displayedScore,
      to: targetScore,
      duration: 300,
      ease: 'Power1',
      onUpdate: (tween) => {
        const value = Math.round(tween.getValue());
        this.scoreText.setText('Score: ' + value);
      },
      onComplete: () => { this.displayedScore = targetScore; }
    });
    this.tweens.add({ targets: this.scoreText, scale: { from: 1.15, to: 1 }, duration: 150, ease: 'Back.easeOut' });
  }

  createDetailedLog() {
    const log = this.add.container(0, 0);
    const g = this.add.graphics();
    const logWidth = 50;
    const logHeight = 65;

    g.fillStyle(0x3a2a1a);
    g.fillRoundedRect(-logWidth / 2, -logHeight / 2, logWidth, logHeight, 6);
    g.fillStyle(0x2a1a10);
    g.fillRoundedRect(-logWidth / 2, -logHeight / 2, 8, logHeight, { tl: 6, bl: 6, tr: 0, br: 0 });
    g.fillStyle(0x4a3a28);
    g.fillRoundedRect(logWidth / 2 - 8, -logHeight / 2, 8, logHeight, { tl: 0, bl: 0, tr: 6, br: 6 });

    g.lineStyle(1, 0x2a1a10, 0.5);
    for (let x = -logWidth / 2 + 8; x < logWidth / 2 - 5; x += 7) {
      g.beginPath();
      g.moveTo(x + Math.random() * 3, -logHeight / 2 + 4);
      g.lineTo(x + Math.random() * 3 - 1, logHeight / 2 - 4);
      g.strokePath();
    }

    g.fillStyle(0x8b7355);
    g.fillEllipse(0, -logHeight / 2, logWidth - 4, 18);
    g.fillStyle(0x9a8265);
    g.fillEllipse(0, -logHeight / 2, logWidth - 14, 12);

    g.lineStyle(1, 0x7a6245, 0.4);
    g.beginPath();
    g.moveTo(-8, -logHeight / 2 - 2);
    g.lineTo(6, -logHeight / 2 + 3);
    g.strokePath();
    g.beginPath();
    g.moveTo(-12, -logHeight / 2 + 2);
    g.lineTo(10, -logHeight / 2);
    g.strokePath();

    g.lineStyle(1, 0x6a5235, 0.5);
    g.beginPath();
    g.moveTo(2, -logHeight / 2 - 4);
    g.lineTo(-3, -logHeight / 2 + 5);
    g.strokePath();

    g.fillStyle(0xffffff, 0.1);
    g.fillEllipse(-5, -logHeight / 2 - 2, 12, 5);

    log.add(g);
    return log;
  }

  dropLog() {
    if (this.gameOver || this.isRestarting) return;
    const { width, height } = this.scale;
    this.instructionText.setAlpha(0);
    this.currentLog = this.add.container(width / 2, -50);
    const detailedLog = this.createDetailedLog();
    this.currentLog.add(detailedLog);
    this.logState = 'dropping';

    // Unique ID for this log to prevent stale timers from affecting it
    this.currentLogId = Date.now();
    const logId = this.currentLogId;

    // Unlock input now that a new log is active
    this.inputLocked = false;
    const targetY = height - 130;
    const choppableDelay = this.currentDropTime * 0.8;
    this.landingTime = this.time.now + this.currentDropTime;

    this.time.delayedCall(choppableDelay, () => {
      // Only change state if this timer belongs to the current log
      if (this.logState === 'dropping' && this.currentLogId === logId) {
        this.logState = 'choppable';
        // DEV: Auto-chop in god mode
        if (typeof DEV_GOD_MODE !== 'undefined' && DEV_GOD_MODE) {
          // Extra safety checks for god mode
          if (this.currentLog && !this.inputLocked && this.logState === 'choppable') {
            this.swingAxe();
            this.perfectChop();
            this.triggerParallax();
          }
        }
      }
    });

    this.tweens.add({
      targets: this.currentLog,
      y: targetY,
      duration: this.currentDropTime,
      ease: 'Quad.easeIn',
      onComplete: () => {
        if (this.logState === 'choppable' || this.logState === 'dropping') {
          this.logState = 'onBlock';
          this.landingDust.emitParticleAt(width / 2 - 30, targetY + 20, 5);
          this.landingDust.emitParticleAt(width / 2 + 30, targetY + 20, 5);
          this.tweens.add({ targets: this.currentLog, scaleY: 0.8, scaleX: 1.1, duration: 50, yoyo: true, ease: 'Power1' });
          this.chopTimer = this.time.delayedCall(300, () => {
            if (this.logState === 'onBlock') {
              this.missedChop();
            }
          });
        }
      }
    });
  }

  triggerParallax() {
    const shift = 3;
    const duration = 150;
    if (this.mountainsGraphics) {
      this.tweens.add({ targets: this.mountainsGraphics, x: -shift * 0.3, duration: duration, yoyo: true, ease: 'Sine.easeOut' });
    }
    if (this.farTrees) {
      this.tweens.add({ targets: this.farTrees, x: -shift * 0.5, duration: duration, yoyo: true, ease: 'Sine.easeOut' });
    }
    if (this.nearTrees) {
      this.tweens.add({ targets: this.nearTrees, x: -shift * 0.8, duration: duration, yoyo: true, ease: 'Sine.easeOut' });
    }
  }

  handleTap() {
    if (this.isRestarting) return;
    if (this.gameOver) {
      this.restartGame();
      return;
    }

    // Always swing axe for visual feedback on any tap
    this.swingAxe();

    // Hitbox checks - only register chop if conditions are met
    if (this.inputLocked || !this.currentLog) {
      return;
    }

    if (this.logState === 'dropping') {
      this.earlyChop();
      this.triggerParallax();
    } else if (this.logState === 'choppable' || this.logState === 'onBlock') {
      this.triggerParallax();
      // DEV: God mode bypass
      if (typeof DEV_GOD_MODE !== 'undefined' && DEV_GOD_MODE) {
        this.perfectChop();
      } else {
        const now = this.time.now;
        const timingOffset = now - this.landingTime;
        const absTiming = Math.abs(timingOffset);

        // Axe tier bonus: 5% larger timing window per tier
        const tierBonus = 1 + (this.axe.axeTier * 0.05);
        const perfectWindow = 40 * tierBonus;
        const goodWindow = 100 * tierBonus;

        if (absTiming < perfectWindow) {
          this.perfectChop();
        } else if (absTiming < goodWindow) {
          this.goodChop();
        } else {
          this.okChop();
        }
      }
    }
  }

  swingAxe() {
    // Kill any existing axe tweens to allow responsive input
    this.tweens.killTweensOf(this.axe);
    this.clearAxeTrail();
    
    this.playWhooshSound();

    this.tweens.add({
      targets: this.axe,
      angle: -45,
      duration: 80,
      ease: 'Power2.easeOut',
      onUpdate: () => this.updateAxeTrail(),
      onComplete: () => {
        this.createImpactFlash();
        this.tweens.add({
          targets: this.axe,
          angle: 25,
          duration: 150,
          ease: 'Back.easeOut',
          onComplete: () => {
            this.clearAxeTrail();
          }
        });
      }
    });
  }

  updateAxeTrail() {
    const positions = [
      { angle: this.axe.angle + 15, alpha: 0.15 },
      { angle: this.axe.angle + 30, alpha: 0.1 },
      { angle: this.axe.angle + 45, alpha: 0.05 }
    ];

    this.axeTrail.forEach((trail, i) => {
      if (i < positions.length) {
        trail.clear();
        trail.setAlpha(positions[i].alpha);
        trail.fillStyle(0x888888);
        trail.fillRect(-3, -80, 8, 75);
        trail.fillRect(-40, -95, 35, 20);
        trail.setPosition(this.axe.x, this.axe.y);
        trail.setAngle(positions[i].angle);
      }
    });
  }

  clearAxeTrail() {
    this.axeTrail.forEach(trail => {
      trail.clear();
      trail.setAlpha(0);
    });
  }

  createImpactFlash() {
    const { width, height } = this.scale;
    const flash = this.add.circle(width / 2, height - 130, 30, 0xffffff, 0.5);
    this.tweens.add({
      targets: flash,
      scale: 2,
      alpha: 0,
      duration: 150,
      onComplete: () => flash.destroy()
    });
  }

  perfectChop() {
    this.executeChop('PERFECT!', '#60ff60', 100, 'perfect');

    // Skip axe upgrades in god mode (causes conflicts with auto-chop timing)
    if (typeof DEV_GOD_MODE !== 'undefined' && DEV_GOD_MODE) return;

    if (this.streak >= 80 && this.axe.axeTier < 3) {
      this.makeAxeSapphire();
    } else if (this.streak >= 65 && this.axe.axeTier < 2) {
      this.makeAxeFlame();
    } else if (this.streak >= 40 && this.axe.axeTier < 1) {
      this.makeAxeGolden();
    }
  }

  goodChop() {
    this.executeChop('GOOD!', '#90d090', 75, 'good');

    if (this.streak >= 80 && this.axe.axeTier < 3) {
      this.makeAxeSapphire();
    } else if (this.streak >= 65 && this.axe.axeTier < 2) {
      this.makeAxeFlame();
    } else if (this.streak >= 40 && this.axe.axeTier < 1) {
      this.makeAxeGolden();
    }
  }

  okChop() {
    this.executeChop('OK', '#d0d090', 50, 'ok');

    if (this.streak >= 80 && this.axe.axeTier < 3) {
      this.makeAxeSapphire();
    } else if (this.streak >= 65 && this.axe.axeTier < 2) {
      this.makeAxeFlame();
    } else if (this.streak >= 40 && this.axe.axeTier < 1) {
      this.makeAxeGolden();
    }
  }

  executeChop(feedbackMsg, feedbackColor, basePoints, quality) {
    if (this.chopTimer) this.chopTimer.remove();
    this.logState = 'chopped';
    this.inputLocked = true; // Lock input until next log drops
    // swingAxe is now called in handleTap for immediate visual feedback

    const points = basePoints * this.multiplier;
    this.score += points;
    this.streak++;
    if (this.streak > this.bestStreak) {
      this.bestStreak = this.streak;
    }

    this.playChopSound(quality);
    this.showFeedback(feedbackMsg, feedbackColor);
    this.showPointsPopup(points);
    this.splitLog();

    const { width, height } = this.scale;
    this.splinters.emitParticleAt(width / 2, height - 130, 12);
    this.sawdust.emitParticleAt(width / 2, height - 130, 20);
    if (quality === 'perfect') {
      this.sparks.emitParticleAt(width / 2, height - 130, 8);
    }

    this.animateScoreRoll(this.score);
    this.updateStreakDisplay();
    this.updateMultiplier();
    this.updateBackgroundTheme();

    if ([5, 10, 25, 50, 100].includes(this.streak)) {
      this.playStreakSound(this.streak);
    }

    this.currentDropTime = Math.max(this.minDropTime, this.currentDropTime - 15);

    this.time.delayedCall(400, () => this.dropLog());
  }

  splitLog() {
    if (!this.currentLog) return;
    const { width, height } = this.scale;

    const leftHalf = this.createDetailedLog();
    const rightHalf = this.createDetailedLog();

    leftHalf.setPosition(width / 2 - 10, height - 130);
    rightHalf.setPosition(width / 2 + 10, height - 130);

    this.tweens.add({
      targets: leftHalf,
      x: width / 2 - 80,
      y: height + 50,
      angle: -45,
      alpha: 0,
      duration: 500,
      ease: 'Power2',
      onComplete: () => leftHalf.destroy()
    });

    this.tweens.add({
      targets: rightHalf,
      x: width / 2 + 80,
      y: height + 50,
      angle: 45,
      alpha: 0,
      duration: 500,
      ease: 'Power2',
      onComplete: () => rightHalf.destroy()
    });

    if (this.currentLog) {
      this.currentLog.destroy();
      this.currentLog = null;
    }
  }

  earlyChop() {
    // Lock input until next log drops
    this.inputLocked = true;
    this.logState = 'missed';

    // swingAxe is now called in handleTap for immediate visual feedback
    this.showFeedback('TOO EARLY!', '#ff6060');
    this.playMissSound();

    // Stop the current log and destroy it
    if (this.currentLog) {
      this.tweens.killTweensOf(this.currentLog);
      this.tweens.add({
        targets: this.currentLog,
        x: this.currentLog.x - 80,
        y: this.currentLog.y + 150,
        angle: -30,
        alpha: 0,
        duration: 400,
        onComplete: () => {
          if (this.currentLog) {
            this.currentLog.destroy();
            this.currentLog = null;
          }
        }
      });
    }

    this.breakStreak();
    this.loseLife();

    // Only drop next log if game isn't over
    if (!this.gameOver && this.lives > 0) {
      this.time.delayedCall(600, () => {
        if (!this.gameOver) {
          this.dropLog();
        }
      });
    }
  }

  missedChop() {
    // Lock input until next log drops
    this.inputLocked = true;
    this.logState = 'missed';

    this.showFeedback('MISS!', '#ff6060');
    this.playMissSound();

    if (this.currentLog) {
      this.tweens.add({
        targets: this.currentLog,
        x: this.currentLog.x + 100,
        y: this.currentLog.y + 200,
        angle: 45,
        alpha: 0,
        duration: 400,
        onComplete: () => {
          if (this.currentLog) {
            this.currentLog.destroy();
            this.currentLog = null;
          }
        }
      });
    }

    this.breakStreak();
    this.loseLife();

    // Only drop next log if game isn't over
    if (!this.gameOver && this.lives > 0) {
      this.time.delayedCall(600, () => {
        if (!this.gameOver) {
          this.dropLog();
        }
      });
    }
  }

  breakStreak() {
    this.streak = 0;
    this.multiplier = 1;
    this.currentDropTime = this.baseDropTime;
    this.updateStreakDisplay();
    this.updateMultiplier();

    this.currentTheme = '';
    this.updateBackgroundTheme();
  }

  updateMultiplier() {
    let newMultiplier = 1;
    if (this.streak >= 250) newMultiplier = 10;
    else if (this.streak >= 200) newMultiplier = 9;
    else if (this.streak >= 150) newMultiplier = 8;
    else if (this.streak >= 100) newMultiplier = 7;
    else if (this.streak >= 75) newMultiplier = 6;
    else if (this.streak >= 50) newMultiplier = 5;
    else if (this.streak >= 25) newMultiplier = 4;
    else if (this.streak >= 15) newMultiplier = 3;
    else if (this.streak >= 5) newMultiplier = 2;

    if (newMultiplier !== this.multiplier) {
      this.multiplier = newMultiplier;
      this.multiplierText.setText('x' + this.multiplier);

      this.tweens.add({
        targets: this.multiplierText,
        scale: { from: 1.5, to: 1 },
        duration: 200,
        ease: 'Back.easeOut'
      });

      if (this.multiplier > 1) {
        this.multiplierGlow.setAlpha(0.3);
        this.tweens.add({
          targets: this.multiplierGlow,
          alpha: 0,
          duration: 500
        });
      }
    }
  }

  showFeedback(text, color) {
    // Kill any existing feedback tweens to prevent overlap issues at high speed
    this.tweens.killTweensOf(this.feedbackText);
    
    // Reset position and show new feedback
    this.feedbackText.y = this.scale.height / 2;
    this.feedbackText.setText(text);
    this.feedbackText.setColor(color);
    this.feedbackText.setAlpha(1);
    this.feedbackText.setScale(0.5);

    this.tweens.add({
      targets: this.feedbackText,
      scale: 1,
      duration: 100,
      ease: 'Back.easeOut'
    });

    this.tweens.add({
      targets: this.feedbackText,
      alpha: 0,
      y: this.feedbackText.y - 30,
      duration: 400,
      delay: 200,
      onComplete: () => {
        this.feedbackText.y = this.scale.height / 2;
      }
    });
  }

  showPointsPopup(points) {
    const { width, height } = this.scale;
    const popup = this.add.text(width / 2, height - 180, '+' + points, {
      fontSize: '24px',
      fontFamily: 'Arial Black',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3
    }).setOrigin(0.5);

    this.tweens.add({
      targets: popup,
      y: height - 250,
      alpha: 0,
      duration: 800,
      ease: 'Power2',
      onComplete: () => popup.destroy()
    });
  }

  loadHighScore() {
    try {
      const saved = localStorage.getItem('choppywood_highscore');
      return saved ? parseInt(saved, 10) : 0;
    } catch (e) {
      return 0;
    }
  }

  saveHighScore(score) {
    try {
      localStorage.setItem('choppywood_highscore', score.toString());
    } catch (e) {
      // Storage not available
    }
  }

  checkAndUpdateHighScore() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      this.saveHighScore(this.highScore);
      return true;
    }
    return false;
  }

  restartGame() {
    if (this.isRestarting) return;
    this.isRestarting = true;

    // Stop any active timers
    if (this.chopTimer) {
      this.chopTimer.remove();
      this.chopTimer = null;
    }

    // Kill all tweens to prevent callbacks after restart
    this.tweens.killAll();

    // Small delay to ensure clean restart
    this.time.delayedCall(100, () => {
      this.scene.restart();
    });
  }
}
