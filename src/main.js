const GAME_WIDTH = 1280;
const GAME_HEIGHT = 720;

const LEVEL_ENEMY_COUNTS = [8, 16, 32, 64, 128, 256, 512, 1024];
const LEVEL_SPAWN_BATCH_SIZES = [2, 4, 6, 8, 10, 12, 14, 16];
const SPAWN_INTERVAL_MS = 500;
const BOSS_LASER_DELAY_MS = 5000;
const FINAL_BOSS_MAX_HEALTH = 999;
const MAX_UPGRADES = 5;
const MINI_BOSS_LEVELS = {
  4: { type: "melee", name: "突击执行者", health: 60, speed: 105 },
  6: { type: "ranged", name: "弹幕控制者", health: 100, speed: 62 }
};
const MINI_BOSS_SHOT_COOLDOWN_MS = 850;
const ENEMY_BULLET_SPEED = 285;
const MINI_BOSS_MELEE_BERSERK_RATIO = 0.5;
const MINI_BOSS_MELEE_SELF_DESTRUCT_RATIO = 0.1;
const MINI_BOSS_MELEE_BERSERK_SPEED_MULTIPLIER = 1.7;
const MINI_BOSS_MELEE_DASH_SPEED = 520;
const MINI_BOSS_MELEE_DASH_MS = 620;
const MINI_BOSS_MELEE_EXPLOSION_RADIUS = 130;
const MINI_BOSS_RANGED_PHASE_RATIOS = [0.75, 0.5, 0.25];
const MINI_BOSS_RANGED_BASE_SHOT_COUNT = 3;
const MINI_BOSS_RANGED_SHOT_STEP = 2;
const MINI_BOSS_RANGED_SPEED_MULTIPLIER = 1.2;
const MINI_BOSS_RANGED_DEATH_BURST_RINGS = 4;
const MINI_BOSS_RANGED_DEATH_BURST_DELAY_MS = 320;
const MINI_BOSS_RANGED_DEATH_BURST_BASE_COUNT = 40;

const PLAYER_SPEED = 230;
const PLAYER_SCALE = 0.9;
const PLAYER_BODY_RADIUS = 12;
const PLAYER_BODY_OFFSET = 4;
const ENEMY_SPEED = 52;
const ENEMY_SPEED_MULTIPLIER = 0.9;
const ENEMY_SCALE = 0.9;
const ENEMY_BODY_RADIUS = 12;
const ENEMY_BODY_OFFSET = 4;
const ENEMY_HEALTH_BAR_WIDTH = 28;
const ENEMY_HEALTH_BAR_HEIGHT = 5;
const MINI_BOSS_SCALE = 0.9;
const MINI_BOSS_BODY_RADIUS = 25;
const MINI_BOSS_BODY_OFFSET = 7;
const TOUCH_BUTTON_SIZE = 74;
const TOUCH_BUTTON_GAP = 18;
const BULLET_SPEED = 590;
const STARTING_FIRE_COOLDOWN_MS = 220;
const MIN_FIRE_COOLDOWN_MS = 70;
const DAMAGE_COOLDOWN_MS = 900;
const ENEMY_MAX_HEALTH = 3;

class GameScene extends Phaser.Scene {
  constructor() {
    super("GameScene");
  }

  create() {
    this.currentLevel = 1;
    this.playerMaxHealth = 3;
    this.playerHealth = 3;
    this.fireCooldown = STARTING_FIRE_COOLDOWN_MS;
    this.bulletCount = 1;
    this.bulletDamage = 1;
    this.upgradesChosen = 0;
    this.lastShotAt = -Infinity;
    this.lastDamageAt = -DAMAGE_COOLDOWN_MS;
    this.gameState = "playing";
    this.spawnTimer = null;
    this.miniBoss = null;
    this.miniBossDefeated = false;
    this.lastMiniBossShotAt = -Infinity;
    this.miniBossDeathBurstOrigin = null;
    this.miniBossDeathBurstRing = 0;
    this.nextMiniBossDeathBurstAt = Infinity;
    this.miniBossDeathBurstEndAt = Infinity;
    this.isPaused = false;
    this.bossFrozen = false;
    this.finalBossHealth = FINAL_BOSS_MAX_HEALTH;
    this.touchUpDown = false;
    this.touchDownDown = false;
    this.touchLeftDown = false;
    this.touchRightDown = false;

    this.events.once("shutdown", () => this.clearSpawnTimer());

    this.createPixelTextures();
    this.createRoom();
    this.createPlayer();
    this.createEnemies();
    this.createBullets();
    this.createMiniBossElements();
    this.createHud();
    this.createCrosshair();
    this.createUpgradeScreen();
    this.createBossSequenceElements();
    this.createPauseScreen();
    this.createEndScreen();
    this.createControls();
    this.createTouchControls();
    this.createCollisions();

    this.input.setDefaultCursor("none");
    this.input.on("pointerdown", (pointer) => {
      if (!this.isPaused && ["playing", "miniboss", "boss"].includes(this.gameState)) {
        this.tryShoot(this.time.now, pointer);
      }
    });

    this.startLevel(1);

    const testMode = new URLSearchParams(window.location.search).get("testMode");
    if (testMode) this.runTestMode(testMode);
  }

  update(time) {
    if (Phaser.Input.Keyboard.JustDown(this.restartKey) && this.gameState === "ended") {
      this.scene.restart();
      return;
    }

    if (Phaser.Input.Keyboard.JustDown(this.pauseKey)) {
      this.togglePause();
    }

    this.updateTouchControlsVisibility();

    if (this.isPaused) return;

    if (Phaser.Input.Keyboard.JustDown(this.skipKey)) {
      this.skipCurrentLevel();
      return;
    }

    this.updateCrosshair();

    if (!["playing", "miniboss", "boss"].includes(this.gameState)) {
      this.player.setVelocity(0, 0);
      this.enemies.children.each((enemy) => enemy.setVelocity(0, 0));
      if (this.miniBoss.active) this.miniBoss.setVelocity(0, 0);
      return;
    }

    this.updatePlayer();
    if (!this.isTouchMovePressed()) {
      this.updateAiming();
    }
    this.recycleOldBullets(time);

    if (this.gameState === "playing") {
      this.updateEnemies();
      this.updateEnemyHealthBars();
    } else if (this.gameState === "miniboss") {
      this.updateMiniBoss(time);
      this.updateMiniBossDeathBurst(time);
      this.recycleOldEnemyBullets(time);
    } else {
      this.updateBossCountdown(time);
    }

    if (this.input.activePointer.isDown && !this.isTouchMovePressed()) {
      this.tryShoot(time);
    }
  }

  createPixelTextures() {
    const graphics = this.add.graphics();

    graphics.fillStyle(0x19d7ff);
    graphics.fillRect(8, 5, 16, 20);
    graphics.fillStyle(0xe8fcff);
    graphics.fillRect(14, 1, 4, 8);
    graphics.fillStyle(0x06323d);
    graphics.fillRect(8, 12, 5, 5);
    graphics.fillRect(19, 12, 5, 5);
    graphics.fillStyle(0xffef57);
    graphics.fillRect(14, 23, 4, 8);
    graphics.generateTexture("player", 32, 32);

    graphics.clear();
    graphics.fillStyle(0xff326f);
    graphics.fillRect(4, 4, 24, 24);
    graphics.fillStyle(0xffb1c8);
    graphics.fillRect(8, 9, 6, 6);
    graphics.fillRect(19, 9, 6, 6);
    graphics.fillStyle(0x4f071d);
    graphics.fillRect(9, 21, 14, 4);
    graphics.generateTexture("enemy", 32, 32);

    graphics.clear();
    graphics.fillStyle(0xfff36a);
    graphics.fillRect(0, 1, 12, 4);
    graphics.fillStyle(0xffffff);
    graphics.fillRect(8, 0, 4, 6);
    graphics.generateTexture("bullet", 12, 6);

    graphics.clear();
    graphics.fillStyle(0xff7138);
    graphics.fillRect(6, 8, 52, 48);
    graphics.fillStyle(0xffd05a);
    graphics.fillRect(14, 0, 12, 14);
    graphics.fillRect(38, 0, 12, 14);
    graphics.fillStyle(0x4a1111);
    graphics.fillRect(14, 22, 12, 10);
    graphics.fillRect(38, 22, 12, 10);
    graphics.fillStyle(0xffffff);
    graphics.fillRect(18, 25, 5, 5);
    graphics.fillRect(42, 25, 5, 5);
    graphics.generateTexture("miniBossMelee", 64, 64);

    graphics.clear();
    graphics.fillStyle(0xa750ff);
    graphics.fillRect(8, 8, 48, 48);
    graphics.fillStyle(0x1ce4ff);
    graphics.fillRect(0, 19, 16, 26);
    graphics.fillRect(48, 19, 16, 26);
    graphics.fillStyle(0x21102f);
    graphics.fillRect(16, 18, 32, 30);
    graphics.fillStyle(0xffffff);
    graphics.fillRect(21, 26, 8, 7);
    graphics.fillRect(35, 26, 8, 7);
    graphics.generateTexture("miniBossRanged", 64, 64);

    graphics.clear();
    graphics.fillStyle(0xff326f);
    graphics.fillRect(0, 0, 12, 12);
    graphics.fillStyle(0xffffff);
    graphics.fillRect(3, 3, 6, 6);
    graphics.generateTexture("enemyBullet", 12, 12);

    graphics.clear();
    graphics.fillStyle(0x7213a8);
    graphics.fillRect(12, 16, 120, 64);
    graphics.fillStyle(0xff326f);
    graphics.fillRect(0, 28, 144, 40);
    graphics.fillStyle(0x17121f);
    graphics.fillRect(20, 24, 104, 48);
    graphics.fillStyle(0xffffff);
    graphics.fillRect(34, 38, 18, 10);
    graphics.fillRect(92, 38, 18, 10);
    graphics.fillStyle(0xfff36a);
    graphics.fillRect(40, 41, 6, 6);
    graphics.fillRect(98, 41, 6, 6);
    graphics.fillStyle(0xff326f);
    graphics.fillRect(52, 62, 40, 6);
    graphics.generateTexture("boss", 144, 96);

    graphics.destroy();
  }

  createRoom() {
    this.cameras.main.setBackgroundColor("#080a0f");
    this.physics.world.setBounds(24, 24, GAME_WIDTH - 48, GAME_HEIGHT - 48);

    const floor = this.add.graphics();
    floor.lineStyle(1, 0x20313b, 0.62);
    for (let x = 24; x <= GAME_WIDTH - 24; x += 32) {
      floor.lineBetween(x, 24, x, GAME_HEIGHT - 24);
    }
    for (let y = 24; y <= GAME_HEIGHT - 24; y += 32) {
      floor.lineBetween(24, y, GAME_WIDTH - 24, y);
    }

    floor.fillStyle(0x12171d, 1);
    floor.fillRect(40, 40, 120, 8);
    floor.fillRect(GAME_WIDTH - 160, GAME_HEIGHT - 48, 120, 8);

    const frame = this.add.graphics();
    frame.lineStyle(4, 0x16c9f4, 1);
    frame.strokeRect(24, 24, GAME_WIDTH - 48, GAME_HEIGHT - 48);
    frame.lineStyle(2, 0xff326f, 0.86);
    frame.strokeRect(34, 34, GAME_WIDTH - 68, GAME_HEIGHT - 68);
  }

  createPlayer() {
    this.player = this.physics.add.sprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, "player");
    this.player.setDepth(5);
    this.player.setScale(PLAYER_SCALE);
    this.player.setCollideWorldBounds(true);
    this.player.body.setCircle(PLAYER_BODY_RADIUS, PLAYER_BODY_OFFSET, PLAYER_BODY_OFFSET);
  }

  createEnemies() {
    this.enemies = this.physics.add.group();
    this.enemyHealthGraphics = this.add.graphics().setDepth(6);
  }

  createBullets() {
    this.bullets = this.physics.add.group({
      defaultKey: "bullet",
      maxSize: 256
    });
  }

  createMiniBossElements() {
    this.enemyBullets = this.physics.add.group({
      defaultKey: "enemyBullet",
      maxSize: 360
    });
    this.miniBoss = this.physics.add.sprite(0, 0, "miniBossMelee");
    this.miniBoss.setDepth(7);
    this.miniBoss.disableBody(true, true);
    this.miniBossHealthGraphics = this.add.graphics().setDepth(11);
    this.miniBossNameText = this.add.text(GAME_WIDTH / 2, 78, "", {
      fontFamily: '"Microsoft YaHei", "Courier New", monospace',
      fontSize: "18px",
      color: "#fff36a",
      stroke: "#080a0f",
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(12).setVisible(false);
  }

  createHud() {
    const textStyle = {
      fontFamily: '"Microsoft YaHei", "Courier New", monospace',
      color: "#f4fbff",
      stroke: "#080a0f",
      strokeThickness: 4
    };

    this.healthText = this.add.text(48, 42, "生命  3 / 3", {
      ...textStyle,
      fontSize: "21px"
    }).setDepth(10);

    this.levelText = this.add.text(GAME_WIDTH / 2, 42, "关卡  1 / 8", {
      ...textStyle,
      fontSize: "21px",
      color: "#fff36a"
    }).setOrigin(0.5, 0).setDepth(10);

    this.enemyText = this.add.text(GAME_WIDTH - 48, 42, "目标  1 / 1", {
      ...textStyle,
      fontSize: "21px"
    }).setOrigin(1, 0).setDepth(10);

    this.statsText = this.add.text(48, GAME_HEIGHT - 54, "攻速 1.0x  ·  弹道 1  ·  伤害 1", {
      ...textStyle,
      fontSize: "16px",
      color: "#9eeaff"
    }).setDepth(10);
  }

  createCrosshair() {
    this.crosshair = this.add.graphics().setDepth(40);
    this.crosshair.lineStyle(2, 0xfff36a, 1);
    this.crosshair.strokeCircle(0, 0, 8);
    this.crosshair.lineBetween(-13, 0, -5, 0);
    this.crosshair.lineBetween(5, 0, 13, 0);
    this.crosshair.lineBetween(0, -13, 0, -5);
    this.crosshair.lineBetween(0, 5, 0, 13);
  }

  createUpgradeScreen() {
    const shade = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x050608, 0.82)
      .setOrigin(0);
    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 900, 350, 0x11161d, 1)
      .setStrokeStyle(3, 0x16c9f4, 1);

    this.upgradeTitle = this.add.text(GAME_WIDTH / 2, 132, "关卡完成", {
      fontFamily: '"Microsoft YaHei", "Courier New", monospace',
      fontSize: "34px",
      color: "#fff36a"
    }).setOrigin(0.5);

    this.upgradeSubtitle = this.add.text(GAME_WIDTH / 2, 176, "选择一项永久强化", {
      fontFamily: '"Microsoft YaHei", "Courier New", monospace',
      fontSize: "18px",
      color: "#d5e8ef"
    }).setOrigin(0.5);

    const choices = [
      {
        x: GAME_WIDTH / 2 - 330,
        type: "speed",
        title: "»  攻速提升",
        detail: "射击间隔减少 18%",
        color: 0x16c9f4
      },
      {
        x: GAME_WIDTH / 2 - 110,
        type: "trajectory",
        title: "⇶  并排弹道",
        detail: "每次射击增加 1 发",
        color: 0xfff36a
      },
      {
        x: GAME_WIDTH / 2 + 110,
        type: "damage",
        title: "◆  火力强化",
        detail: "每发子弹伤害 +1",
        color: 0xff5b86
      },
      {
        x: GAME_WIDTH / 2 + 330,
        type: "health",
        title: "+  生命强化",
        detail: "当前生命和上限 +1",
        color: 0x70ef8d
      }
    ];

    const choiceElements = [];
    choices.forEach((choice) => {
      const button = this.add.rectangle(choice.x, 278, 200, 118, 0x1b242d, 1)
        .setStrokeStyle(2, choice.color, 1)
        .setInteractive({ useHandCursor: true });
      const title = this.add.text(choice.x, 257, choice.title, {
        fontFamily: '"Microsoft YaHei", "Courier New", monospace',
        fontSize: "19px",
        color: Phaser.Display.Color.IntegerToColor(choice.color).rgba
      }).setOrigin(0.5);
      const detail = this.add.text(choice.x, 300, choice.detail, {
        fontFamily: '"Microsoft YaHei", "Courier New", monospace',
        fontSize: "15px",
        color: "#d5e8ef"
      }).setOrigin(0.5);

      button.on("pointerover", () => button.setFillStyle(0x273540));
      button.on("pointerout", () => button.setFillStyle(0x1b242d));
      button.on("pointerdown", () => this.applyUpgrade(choice.type));
      choiceElements.push(button, title, detail);
    });

    this.upgradeCurrentText = this.add.text(GAME_WIDTH / 2, 378, "", {
      fontFamily: '"Microsoft YaHei", "Courier New", monospace',
      fontSize: "16px",
      color: "#9eeaff"
    }).setOrigin(0.5);

    this.upgradeScreen = this.add.container(0, 0, [
      shade,
      panel,
      this.upgradeTitle,
      this.upgradeSubtitle,
      ...choiceElements,
      this.upgradeCurrentText
    ]).setDepth(25).setVisible(false);
  }

  createBossSequenceElements() {
    this.boss = this.physics.add.sprite(GAME_WIDTH / 2, 178, "boss")
      .setDepth(12)
      .setVisible(false);
    this.boss.setImmovable(true);
    this.boss.disableBody(true, true);

    this.bossWarningText = this.add.text(GAME_WIDTH / 2, 245, "", {
      fontFamily: '"Microsoft YaHei", "Courier New", monospace',
      fontSize: "24px",
      color: "#ff5b86",
      align: "center",
      stroke: "#080a0f",
      strokeThickness: 5
    }).setOrigin(0.5).setDepth(13).setVisible(false);

    this.finalBossHealthText = this.add.text(GAME_WIDTH / 2, 78, "", {
      fontFamily: '"Microsoft YaHei", "Courier New", monospace',
      fontSize: "17px",
      color: "#fff36a",
      stroke: "#080a0f",
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(13).setVisible(false);

    this.finalBossHealthGraphics = this.add.graphics().setDepth(13).setVisible(false);

    this.laserOuter = this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH + 80,
      GAME_HEIGHT - 60,
      0xff326f,
      0.82
    ).setScale(0, 1).setDepth(20).setVisible(false);

    this.laserCore = this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH + 80,
      GAME_HEIGHT - 130,
      0xffffff,
      0.94
    ).setScale(0, 1).setDepth(21).setVisible(false);
  }

  createPauseScreen() {
    const shade = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x050608, 0.7)
      .setOrigin(0);
    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 360, 130, 0x11161d, 1)
      .setStrokeStyle(3, 0x16c9f4, 1);
    const title = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2, "游戏暂停", {
      fontFamily: '"Microsoft YaHei", "Courier New", monospace',
      fontSize: "34px",
      color: "#fff36a"
    }).setOrigin(0.5);

    this.pauseScreen = this.add.container(0, 0, [shade, panel, title])
      .setDepth(28)
      .setVisible(false);
  }

  createEndScreen() {
    const shade = this.add.rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT, 0x050608, 0.8)
      .setOrigin(0);
    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 500, 242, 0x11161d, 1)
      .setStrokeStyle(3, 0x16c9f4, 1);

    this.endTitle = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 65, "", {
      fontFamily: '"Microsoft YaHei", "Courier New", monospace',
      fontSize: "36px",
      color: "#ff5b86",
      align: "center"
    }).setOrigin(0.5);

    this.endMessage = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 14, "", {
      fontFamily: '"Microsoft YaHei", "Courier New", monospace',
      fontSize: "18px",
      color: "#d5e8ef",
      align: "center"
    }).setOrigin(0.5);

    this.restartButton = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 62, 190, 52, 0x16c9f4, 1)
      .setStrokeStyle(2, 0xe8fcff, 1)
      .setInteractive({ useHandCursor: true });

    const restartLabel = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 62, "↻  重新开始", {
      fontFamily: '"Microsoft YaHei", "Courier New", monospace',
      fontSize: "20px",
      color: "#061015"
    }).setOrigin(0.5);

    this.restartButton.on("pointerover", () => this.restartButton.setFillStyle(0xfff36a));
    this.restartButton.on("pointerout", () => this.restartButton.setFillStyle(0x16c9f4));
    this.restartButton.on("pointerdown", () => this.scene.restart());

    this.endScreen = this.add.container(0, 0, [
      shade,
      panel,
      this.endTitle,
      this.endMessage,
      this.restartButton,
      restartLabel
    ]).setDepth(30).setVisible(false);
  }

  createControls() {
    this.keys = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D
    });
    this.restartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
    this.pauseKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    this.skipKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.N);
  }

  createTouchControls() {
    const baseX = 54;
    const topY = GAME_HEIGHT - 202;
    const bottomY = GAME_HEIGHT - 110;
    const centerX = baseX + TOUCH_BUTTON_SIZE + TOUCH_BUTTON_GAP;
    this.touchButtons = [
      this.createMoveTouchButton(centerX, topY, "^", "up"),
      this.createMoveTouchButton(baseX, bottomY, "<", "left"),
      this.createMoveTouchButton(centerX, bottomY, "v", "down"),
      this.createMoveTouchButton(centerX + TOUCH_BUTTON_SIZE + TOUCH_BUTTON_GAP, bottomY, ">", "right")
    ];
    this.updateTouchControlsVisibility();
  }

  createMoveTouchButton(x, y, label, direction) {
    const button = this.add.rectangle(
      x,
      y,
      TOUCH_BUTTON_SIZE,
      TOUCH_BUTTON_SIZE,
      0x11161d,
      0.58
    )
      .setOrigin(0)
      .setStrokeStyle(3, 0x16c9f4, 0.92)
      .setDepth(14)
      .setScrollFactor(0)
      .setInteractive({ useHandCursor: true });

    const text = this.add.text(x + TOUCH_BUTTON_SIZE / 2, y + TOUCH_BUTTON_SIZE / 2 - 2, label, {
      fontFamily: '"Microsoft YaHei", "Courier New", monospace',
      fontSize: "52px",
      color: "#f4fbff",
      stroke: "#080a0f",
      strokeThickness: 4
    }).setOrigin(0.5).setDepth(15).setScrollFactor(0);

    const setPressed = (pressed, event) => {
      if (event) event.stopPropagation();
      if (direction === "up") {
        this.touchUpDown = pressed;
      } else if (direction === "down") {
        this.touchDownDown = pressed;
      } else if (direction === "left") {
        this.touchLeftDown = pressed;
      } else {
        this.touchRightDown = pressed;
      }
      button.setFillStyle(pressed ? 0x16c9f4 : 0x11161d, pressed ? 0.78 : 0.58);
    };

    button.on("pointerdown", (_pointer, _localX, _localY, event) => setPressed(true, event));
    button.on("pointerup", (_pointer, _localX, _localY, event) => setPressed(false, event));
    button.on("pointerout", (_pointer, event) => setPressed(false, event));
    button.on("pointerupoutside", (_pointer, event) => setPressed(false, event));

    return { button, text, direction };
  }

  updateTouchControlsVisibility() {
    if (!this.touchButtons) return;
    const visible = !this.isPaused && ["playing", "miniboss", "boss"].includes(this.gameState);
    if (!visible) {
      this.touchUpDown = false;
      this.touchDownDown = false;
      this.touchLeftDown = false;
      this.touchRightDown = false;
    }
    this.touchButtons.forEach(({ button, text, direction }) => {
      const pressed = this.isTouchDirectionPressed(direction);
      button.setFillStyle(pressed ? 0x16c9f4 : 0x11161d, pressed ? 0.78 : 0.58);
      button.setVisible(visible);
      text.setVisible(visible);
    });
  }

  isTouchDirectionPressed(direction) {
    if (direction === "up") return this.touchUpDown;
    if (direction === "down") return this.touchDownDown;
    if (direction === "left") return this.touchLeftDown;
    return this.touchRightDown;
  }

  isTouchMovePressed() {
    return this.touchUpDown || this.touchDownDown || this.touchLeftDown || this.touchRightDown;
  }

  createCollisions() {
    this.physics.add.overlap(this.bullets, this.enemies, this.hitEnemy, null, this);
    this.physics.add.overlap(this.bullets, this.miniBoss, this.hitMiniBoss, null, this);
    this.physics.add.overlap(this.bullets, this.boss, this.hitFinalBoss, null, this);
    this.physics.add.overlap(this.player, this.enemies, this.takeDamage, null, this);
    this.physics.add.overlap(this.player, this.miniBoss, this.takeDamage, null, this);
    this.physics.add.overlap(
      this.player,
      this.enemyBullets,
      this.takeEnemyBulletDamage,
      null,
      this
    );
  }

  togglePause() {
    if (this.gameState === "boss") {
      this.toggleFinalBossFreeze();
      return;
    }

    if (!["playing", "miniboss", "boss"].includes(this.gameState)) return;

    this.isPaused = !this.isPaused;
    this.pauseScreen.setVisible(this.isPaused);
    this.crosshair.setVisible(!this.isPaused);

    if (this.isPaused) {
      this.clearSpawnTimer();
      this.physics.world.pause();
      this.time.paused = true;
      this.tweens.pauseAll();
      this.input.setDefaultCursor("default");
    } else {
      this.physics.world.resume();
      this.time.paused = false;
      this.tweens.resumeAll();
      this.input.setDefaultCursor("none");
      if (
        this.gameState === "playing" &&
        this.spawnedEnemies < this.levelEnemyTotal
      ) {
        this.startSpawnTimer();
      }
    }

    this.syncDebugState();
  }

  toggleFinalBossFreeze() {
    if (this.gameState !== "boss" || !this.bossLaserTimer) return;

    this.bossFrozen = !this.bossFrozen;
    if (this.bossFrozen) {
      this.bossLaserRemaining = Math.max(0, this.bossFireAt - this.time.now);
      this.bossLaserTimer.paused = true;
      this.bossWarningText.setText("毁灭协议冻结").setColor("#70ef8d");
    } else {
      this.bossFireAt = this.time.now + this.bossLaserRemaining;
      this.bossLaserTimer.paused = false;
      this.bossWarningText.setColor("#ff5b86");
    }
    this.syncDebugState();
  }

  skipCurrentLevel() {
    if (this.gameState === "boss") {
      this.finishFinalBossVictory("skip");
      return;
    }

    if (!["playing", "miniboss"].includes(this.gameState)) return;

    this.gameState = "transition";
    this.clearSpawnTimer();
    this.disableAllBullets();
    this.disableAllEnemyBullets();
    this.enemies.children.each((enemy) => {
      if (enemy.active) enemy.disableBody(true, true);
    });
    if (this.miniBoss.active) {
      this.tweens.killTweensOf(this.miniBoss);
      this.miniBoss.disableBody(true, true);
    }
    this.enemyHealthGraphics.clear();
    this.miniBossHealthGraphics.clear();
    this.miniBossNameText.setVisible(false);
    this.spawnedEnemies = this.levelEnemyTotal;
    this.defeatedEnemies = this.levelEnemyTotal;
    this.miniBossDefeated = true;
    this.player.setVelocity(0, 0);
    this.levelText.setText(`已跳过第 ${this.currentLevel} 关`);
    this.syncDebugState();

    if (this.currentLevel === LEVEL_ENEMY_COUNTS.length) {
      window.setTimeout(() => this.startBossSequence(), 320);
    } else {
      window.setTimeout(() => this.startLevel(this.currentLevel + 1), 320);
    }
  }

  startLevel(levelNumber) {
    this.clearSpawnTimer();

    this.currentLevel = levelNumber;
    this.levelEnemyTotal = LEVEL_ENEMY_COUNTS[levelNumber - 1];
    this.levelSpawnBatchSize = LEVEL_SPAWN_BATCH_SIZES[levelNumber - 1];
    this.spawnedEnemies = 0;
    this.defeatedEnemies = 0;
    this.miniBossDefeated = false;
    this.gameState = "playing";
    this.lastDamageAt = this.time.now - DAMAGE_COOLDOWN_MS;

    this.player.setVisible(true);
    this.player.setPosition(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    this.player.setVelocity(0, 0);
    this.player.clearTint();
    this.disableAllBullets();
    this.disableAllEnemyBullets();
    if (this.miniBoss.active) this.miniBoss.disableBody(true, true);
    this.enemyHealthGraphics.clear();
    this.miniBossHealthGraphics.clear();
    this.miniBossNameText.setVisible(false);
    this.upgradeScreen.setVisible(false);

    this.levelText.setText(`关卡  ${this.currentLevel} / 8`);
    this.updateHealthHud();
    this.updateTargetHud();
    this.updateStatsHud();

    if (MINI_BOSS_LEVELS[this.currentLevel]) {
      this.startMiniBoss();
    } else {
      this.startSpawnTimer();
    }
  }

  runTestMode(testMode) {
    const miniBossTestModes = [
      "boss4",
      "boss4Hit",
      "boss4Flow",
      "boss4Berserk",
      "boss4ExplosionNear",
      "boss4ExplosionFar",
      "boss6",
      "boss6Hit",
      "boss6Phase",
      "boss6Phase3",
      "boss6Burst"
    ];

    if (miniBossTestModes.includes(testMode)) {
      const level = testMode.startsWith("boss6") ? 6 : 4;
      this.playerMaxHealth = 999;
      this.playerHealth = 999;
      this.startLevel(level);
      this.miniBoss.setData("speed", 0);
      this.clearSpawnTimer();
      const testHitMiniBoss = (damage) => {
        const testBullet = this.bullets.get(this.miniBoss.x, this.miniBoss.y);
        testBullet.enableBody(true, this.miniBoss.x, this.miniBoss.y, true, true);
        testBullet.setData("damage", damage);
        this.hitMiniBoss(this.miniBoss, testBullet);
      };

      if (testMode.endsWith("Hit")) {
        testHitMiniBoss(1);
      } else if (testMode === "boss4Berserk") {
        this.miniBoss.setData("health", Math.floor(this.miniBoss.getData("maxHealth") * MINI_BOSS_MELEE_BERSERK_RATIO) + 1);
        testHitMiniBoss(1);
      } else if (testMode === "boss4ExplosionNear" || testMode === "boss4ExplosionFar") {
        const nearPlayer = testMode === "boss4ExplosionNear";
        this.player.setPosition(
          nearPlayer ? this.miniBoss.x + 28 : GAME_WIDTH - 70,
          nearPlayer ? this.miniBoss.y + 24 : GAME_HEIGHT - 70
        );
        this.miniBoss.setData("health", Math.floor(this.miniBoss.getData("maxHealth") * MINI_BOSS_MELEE_SELF_DESTRUCT_RATIO) + 1);
        testHitMiniBoss(1);
      } else if (testMode === "boss6") {
        this.fireMiniBossBullets(this.time.now, 0);
        this.syncDebugState();
      } else if (testMode === "boss6Phase") {
        this.miniBoss.setData("health", Math.floor(this.miniBoss.getData("maxHealth") * 0.75) + 1);
        testHitMiniBoss(1);
      } else if (testMode === "boss6Phase3") {
        this.miniBoss.setData("health", Math.floor(this.miniBoss.getData("maxHealth") * 0.25) + 1);
        testHitMiniBoss(1);
      } else if (testMode === "boss6Burst") {
        this.miniBoss.setData("health", 1);
        testHitMiniBoss(1);
      } else if (testMode === "boss4Flow") {
        this.finishMiniBoss();
      }
    } else if (testMode === "healthUpgrade") {
      this.clearSpawnTimer();
      this.playerMaxHealth = 3;
      this.playerHealth = 2;
      this.gameState = "upgrade";
      this.applyUpgrade("health");
      this.syncDebugState();
    } else if (testMode === "pause") {
      this.togglePause();
    } else if (testMode === "skip") {
      this.playerMaxHealth = 999;
      this.playerHealth = 999;
      this.skipCurrentLevel();
    } else if (["finalBoss", "finalBossHit", "finalBossDestroy", "finalBossFreeze", "finalBossSkip"].includes(testMode)) {
      this.clearSpawnTimer();
      this.playerMaxHealth = 999;
      this.playerHealth = 999;
      this.currentLevel = LEVEL_ENEMY_COUNTS.length;
      this.startBossSequence();
      if (testMode === "finalBossHit") {
        const testBullet = this.bullets.get(this.boss.x, this.boss.y);
        testBullet.enableBody(true, this.boss.x, this.boss.y, true, true);
        testBullet.setData("damage", 1);
        this.hitFinalBoss(this.boss, testBullet);
      } else if (testMode === "finalBossDestroy") {
        this.finalBossHealth = 1;
        const testBullet = this.bullets.get(this.boss.x, this.boss.y);
        testBullet.enableBody(true, this.boss.x, this.boss.y, true, true);
        testBullet.setData("damage", 1);
        this.hitFinalBoss(this.boss, testBullet);
      } else if (testMode === "finalBossFreeze") {
        this.togglePause();
      } else if (testMode === "finalBossSkip") {
        this.skipCurrentLevel();
      }
    }
  }

  spawnEnemyBatch() {
    if (this.gameState !== "playing") {
      this.clearSpawnTimer();
      return;
    }

    const remainingEnemies = this.levelEnemyTotal - this.spawnedEnemies;
    const enemiesToSpawn = Math.min(this.levelSpawnBatchSize, remainingEnemies);
    if (enemiesToSpawn <= 0) {
      this.clearSpawnTimer();
      return;
    }

    for (let index = 0; index < enemiesToSpawn; index += 1) {
      this.spawnEnemy();
    }

    if (this.spawnedEnemies >= this.levelEnemyTotal) {
      this.clearSpawnTimer();
    }
  }

  spawnEnemy() {
    if (this.gameState !== "playing") return;

    const position = this.getEnemySpawnPosition();
    const enemy = this.enemies.get(position.x, position.y, "enemy");
    if (!enemy) return;

    enemy.enableBody(true, position.x, position.y, true, true);
    enemy.setDepth(5);
    enemy.setCollideWorldBounds(true);
    enemy.body.setCircle(ENEMY_BODY_RADIUS, ENEMY_BODY_OFFSET, ENEMY_BODY_OFFSET);
    enemy.setData("health", ENEMY_MAX_HEALTH);
    enemy.setAlpha(0.2);
    enemy.setScale(ENEMY_SCALE * 0.7);

    this.tweens.add({
      targets: enemy,
      alpha: 1,
      scale: ENEMY_SCALE,
      duration: 160,
      ease: "Power2"
    });

    this.spawnedEnemies += 1;
    this.updateTargetHud();
  }

  getEnemySpawnPosition() {
    const side = Phaser.Math.Between(0, 3);
    const horizontal = Phaser.Math.Between(90, GAME_WIDTH - 90);
    const vertical = Phaser.Math.Between(100, GAME_HEIGHT - 90);

    if (side === 0) return { x: horizontal, y: 72 };
    if (side === 1) return { x: GAME_WIDTH - 72, y: vertical };
    if (side === 2) return { x: horizontal, y: GAME_HEIGHT - 72 };
    return { x: 72, y: vertical };
  }

  updatePlayer() {
    const movement = new Phaser.Math.Vector2(0, 0);

    if (this.keys.left.isDown || this.touchLeftDown) movement.x -= 1;
    if (this.keys.right.isDown || this.touchRightDown) movement.x += 1;
    if (this.keys.up.isDown || this.touchUpDown) movement.y -= 1;
    if (this.keys.down.isDown || this.touchDownDown) movement.y += 1;

    movement.normalize().scale(PLAYER_SPEED);
    this.player.setVelocity(movement.x, movement.y);
  }

  updateAiming() {
    const pointer = this.input.activePointer;
    this.player.rotation = Phaser.Math.Angle.Between(
      this.player.x,
      this.player.y,
      pointer.worldX,
      pointer.worldY
    ) + Math.PI / 2;
  }

  updateCrosshair() {
    const pointer = this.input.activePointer;
    this.crosshair.setPosition(pointer.worldX, pointer.worldY);
    this.crosshair.setVisible(["playing", "miniboss", "boss"].includes(this.gameState));
  }

  updateEnemies() {
    this.enemies.children.each((enemy) => {
      if (!enemy.active) return;

      const direction = new Phaser.Math.Vector2(
        this.player.x - enemy.x,
        this.player.y - enemy.y
      ).normalize().scale(ENEMY_SPEED);

      enemy.setVelocity(direction.x, direction.y);
    });
  }

  startMiniBoss() {
    const config = MINI_BOSS_LEVELS[this.currentLevel];
    if (!config) {
      this.completeCurrentLevel();
      return;
    }

    this.gameState = "miniboss";
    this.disableAllBullets();
    this.disableAllEnemyBullets();
    this.enemyHealthGraphics.clear();
    this.player.setVelocity(0, 0);
    this.player.setPosition(GAME_WIDTH / 2, GAME_HEIGHT - 110);
    this.lastMiniBossShotAt = this.time.now;
    this.miniBossDeathBurstOrigin = null;
    this.miniBossDeathBurstRing = 0;
    this.nextMiniBossDeathBurstAt = Infinity;
    this.miniBossDeathBurstEndAt = Infinity;

    const texture = config.type === "melee" ? "miniBossMelee" : "miniBossRanged";
    const miniBossSpeed = Math.round(config.speed * ENEMY_SPEED_MULTIPLIER);
    this.miniBoss.setTexture(texture);
    this.miniBoss.enableBody(true, GAME_WIDTH / 2, 150, true, true);
    this.miniBoss.setScale(MINI_BOSS_SCALE * 0.25).setAlpha(0);
    this.miniBoss.setCollideWorldBounds(true);
    this.miniBoss.body.setCircle(
      MINI_BOSS_BODY_RADIUS,
      MINI_BOSS_BODY_OFFSET,
      MINI_BOSS_BODY_OFFSET
    );
    this.miniBoss.setData("type", config.type);
    this.miniBoss.setData("name", config.name);
    this.miniBoss.setData("health", config.health);
    this.miniBoss.setData("maxHealth", config.health);
    this.miniBoss.setData("speed", miniBossSpeed);
    this.miniBoss.setData("baseSpeed", miniBossSpeed);
    this.miniBoss.setData("phase", 0);
    this.miniBoss.setData("shotCount", MINI_BOSS_RANGED_BASE_SHOT_COUNT);
    this.miniBoss.setData("bulletSpeed", ENEMY_BULLET_SPEED);
    this.miniBoss.setData("berserk", false);
    this.miniBoss.setData("isDashing", false);
    this.miniBoss.setData("exploding", false);
    this.miniBoss.clearTint();

    this.levelText.setText(`第 ${this.currentLevel} 关 · 小 BOSS`);
    this.enemyText.setText("目标  小 BOSS");
    this.miniBossNameText.setText(config.name).setColor("#fff36a").setVisible(true);
    this.drawMiniBossHealthBar();

    this.tweens.add({
      targets: this.miniBoss,
      alpha: 1,
      scale: MINI_BOSS_SCALE,
      duration: 360,
      ease: "Back.Out"
    });
    this.cameras.main.shake(280, 0.007);
    this.syncDebugState();
  }

  updateMiniBoss(time) {
    if (!this.miniBoss.active) return;

    const directionToPlayer = new Phaser.Math.Vector2(
      this.player.x - this.miniBoss.x,
      this.player.y - this.miniBoss.y
    );
    const distance = directionToPlayer.length();
    directionToPlayer.normalize();

    if (this.miniBoss.getData("type") === "melee") {
      if (!this.miniBoss.getData("isDashing")) {
        directionToPlayer.scale(this.miniBoss.getData("speed"));
        this.miniBoss.setVelocity(directionToPlayer.x, directionToPlayer.y);
      }
      this.miniBoss.rotation = directionToPlayer.angle() + Math.PI / 2;
    } else {
      let movement = directionToPlayer.clone();
      if (distance > 320) {
        movement.scale(this.miniBoss.getData("speed"));
      } else if (distance < 220) {
        movement.scale(-this.miniBoss.getData("speed"));
      } else {
        const strafeDirection = Math.floor(time / 1500) % 2 === 0 ? 1 : -1;
        movement.set(-movement.y, movement.x)
          .scale(this.miniBoss.getData("speed") * strafeDirection);
      }
      this.miniBoss.setVelocity(movement.x, movement.y);
      this.miniBoss.rotation = directionToPlayer.angle() + Math.PI / 2;

      if (time - this.lastMiniBossShotAt >= MINI_BOSS_SHOT_COOLDOWN_MS) {
        this.fireMiniBossBullets(time, directionToPlayer.angle());
      }
    }

    this.drawMiniBossHealthBar();
  }

  fireMiniBossBullets(time, centerAngle) {
    const shotCount = this.miniBoss.getData("shotCount") || MINI_BOSS_RANGED_BASE_SHOT_COUNT;
    const bulletSpeed = this.miniBoss.getData("bulletSpeed") || ENEMY_BULLET_SPEED;
    const spreadStep = Phaser.Math.DegToRad(8);
    const firstSpread = -spreadStep * (shotCount - 1) / 2;

    for (let index = 0; index < shotCount; index += 1) {
      const angle = centerAngle + firstSpread + spreadStep * index;
      const startX = this.miniBoss.x + Math.cos(angle) * 38;
      const startY = this.miniBoss.y + Math.sin(angle) * 38;
      this.spawnEnemyBullet(startX, startY, angle, bulletSpeed, time);
    }
    this.lastMiniBossShotAt = time;
  }

  spawnEnemyBullet(startX, startY, angle, speed, time) {
    const bullet = this.enemyBullets.get(startX, startY);
    if (!bullet) return null;

    bullet.enableBody(true, startX, startY, true, true);
    bullet.setDepth(6);
    bullet.body.setCircle(6);
    bullet.setData("bornAt", time);
    bullet.setVelocity(
      Math.cos(angle) * speed,
      Math.sin(angle) * speed
    );
    return bullet;
  }

  fireDeathBulletBurst(originX, originY, ringIndex) {
    const bulletCount = MINI_BOSS_RANGED_DEATH_BURST_BASE_COUNT + ringIndex * 12;
    const bulletSpeed = (this.miniBoss.getData("bulletSpeed") || ENEMY_BULLET_SPEED) * (0.82 + ringIndex * 0.1);
    const angleOffset = ringIndex * 0.11;

    for (let index = 0; index < bulletCount; index += 1) {
      const angle = angleOffset + (Math.PI * 2 * index) / bulletCount;
      const startX = originX + Math.cos(angle) * 44;
      const startY = originY + Math.sin(angle) * 44;
      const speed = bulletSpeed + (index % 3) * 34;
      this.spawnEnemyBullet(startX, startY, angle, speed, this.time.now);
    }
    this.syncDebugState();
  }

  updateMiniBossDeathBurst(time) {
    if (
      !this.miniBossDeathBurstOrigin ||
      !this.miniBoss.getData("exploding") ||
      this.miniBoss.getData("type") !== "ranged"
    ) {
      return;
    }

    while (
      this.miniBossDeathBurstRing < MINI_BOSS_RANGED_DEATH_BURST_RINGS &&
      time >= this.nextMiniBossDeathBurstAt
    ) {
      this.fireDeathBulletBurst(
        this.miniBossDeathBurstOrigin.x,
        this.miniBossDeathBurstOrigin.y,
        this.miniBossDeathBurstRing
      );
      this.miniBossDeathBurstRing += 1;
      this.nextMiniBossDeathBurstAt += MINI_BOSS_RANGED_DEATH_BURST_DELAY_MS;
    }

    if (time >= this.miniBossDeathBurstEndAt) {
      this.finishMiniBoss();
    }
  }

  recycleOldEnemyBullets(time) {
    this.enemyBullets.children.each((bullet) => {
      if (!bullet.active) return;
      const outsideRoom = (
        bullet.x < 24 || bullet.x > GAME_WIDTH - 24 ||
        bullet.y < 24 || bullet.y > GAME_HEIGHT - 24
      );
      if (outsideRoom || time - bullet.getData("bornAt") > 3800) {
        bullet.disableBody(true, true);
      }
    });
  }

  drawMiniBossHealthBar() {
    this.miniBossHealthGraphics.clear();
    if (!this.miniBoss.active) return;

    const health = Math.max(0, this.miniBoss.getData("health"));
    const maxHealth = this.miniBoss.getData("maxHealth");
    const left = GAME_WIDTH / 2 - 210;
    this.miniBossHealthGraphics.fillStyle(0x210916, 0.96);
    this.miniBossHealthGraphics.fillRect(left, 96, 420, 12);
    this.miniBossHealthGraphics.fillStyle(0xff326f, 1);
    this.miniBossHealthGraphics.fillRect(left, 96, (health / maxHealth) * 420, 12);
    this.miniBossHealthGraphics.lineStyle(2, 0xffffff, 0.8);
    this.miniBossHealthGraphics.strokeRect(left, 96, 420, 12);
  }

  updateEnemyHealthBars() {
    this.enemyHealthGraphics.clear();

    this.enemies.children.each((enemy) => {
      if (!enemy.active) return;

      const health = enemy.getData("health");
      const left = enemy.x - ENEMY_HEALTH_BAR_WIDTH / 2;
      const top = enemy.y - 23;

      this.enemyHealthGraphics.fillStyle(0x330b19, 1);
      this.enemyHealthGraphics.fillRect(left, top, ENEMY_HEALTH_BAR_WIDTH, ENEMY_HEALTH_BAR_HEIGHT);
      this.enemyHealthGraphics.fillStyle(0xff326f, 1);
      this.enemyHealthGraphics.fillRect(
        left,
        top,
        (health / ENEMY_MAX_HEALTH) * ENEMY_HEALTH_BAR_WIDTH,
        ENEMY_HEALTH_BAR_HEIGHT
      );
    });
  }

  tryShoot(time, pointer = this.input.activePointer) {
    if (time - this.lastShotAt < this.fireCooldown) return;

    const angle = Phaser.Math.Angle.Between(
      this.player.x,
      this.player.y,
      pointer.worldX,
      pointer.worldY
    );
    const perpendicular = angle + Math.PI / 2;

    for (let index = 0; index < this.bulletCount; index += 1) {
      const offset = (index - (this.bulletCount - 1) / 2) * 13;
      const startX = this.player.x + Math.cos(angle) * 18 + Math.cos(perpendicular) * offset;
      const startY = this.player.y + Math.sin(angle) * 18 + Math.sin(perpendicular) * offset;
      const bullet = this.bullets.get(startX, startY);
      if (!bullet) continue;

      bullet.setActive(true);
      bullet.setVisible(true);
      bullet.setDepth(4);
      bullet.body.enable = true;
      bullet.body.setAllowGravity(false);
      bullet.body.setSize(12, 6);
      bullet.setRotation(angle);
      bullet.setData("bornAt", time);
      bullet.setData("damage", this.bulletDamage);
      bullet.setVelocity(Math.cos(angle) * BULLET_SPEED, Math.sin(angle) * BULLET_SPEED);
    }

    this.lastShotAt = time;
  }

  recycleOldBullets(time) {
    this.bullets.children.each((bullet) => {
      if (!bullet.active) return;

      const isOutsideRoom = (
        bullet.x < 24 || bullet.x > GAME_WIDTH - 24 ||
        bullet.y < 24 || bullet.y > GAME_HEIGHT - 24
      );

      if (isOutsideRoom || time - bullet.getData("bornAt") > 1600) {
        bullet.disableBody(true, true);
      }
    });
  }

  hitEnemy(bullet, enemy) {
    if (this.gameState !== "playing" || !bullet.active || !enemy.active) return;

    bullet.disableBody(true, true);
    const nextHealth = enemy.getData("health") - bullet.getData("damage");
    enemy.setData("health", nextHealth);

    enemy.setTintFill(0xffffff);
    this.time.delayedCall(70, () => {
      if (enemy.active) enemy.clearTint();
    });

    if (nextHealth <= 0) {
      enemy.disableBody(true, true);
      this.defeatedEnemies += 1;
      this.updateTargetHud();
      this.checkLevelComplete();
    }

    this.updateEnemyHealthBars();
  }

  hitMiniBoss(objectA, objectB) {
    const miniBoss = objectA === this.miniBoss ? objectA : objectB;
    const bullet = miniBoss === objectA ? objectB : objectA;
    if (this.gameState !== "miniboss" || !bullet.active || !miniBoss.active) return;

    bullet.disableBody(true, true);
    const nextHealth = miniBoss.getData("health") - (bullet.getData("damage") || 1);
    miniBoss.setData("health", nextHealth);
    miniBoss.setTintFill(0xffffff);
    this.time.delayedCall(70, () => {
      if (miniBoss.active && !miniBoss.getData("berserk")) miniBoss.clearTint();
    });

    if (this.handleMiniBossHealthTriggers(nextHealth)) return;

    if (nextHealth <= 0) {
      this.finishMiniBoss();
    } else {
      this.drawMiniBossHealthBar();
      this.syncDebugState();
    }
  }

  handleMiniBossHealthTriggers(nextHealth) {
    const type = this.miniBoss.getData("type");
    const maxHealth = this.miniBoss.getData("maxHealth");

    if (type === "melee") {
      if (nextHealth <= maxHealth * MINI_BOSS_MELEE_SELF_DESTRUCT_RATIO) {
        this.triggerMeleeExplosion();
        return true;
      }

      if (
        !this.miniBoss.getData("berserk") &&
        nextHealth <= maxHealth * MINI_BOSS_MELEE_BERSERK_RATIO
      ) {
        this.triggerMeleeBerserk();
      }
      return false;
    }

    if (type === "ranged") {
      if (nextHealth <= 0) {
        this.triggerRangedDeathExplosion();
        return true;
      }
      this.updateRangedMiniBossPhase(nextHealth);
    }

    return false;
  }

  triggerMeleeBerserk() {
    const baseSpeed = this.miniBoss.getData("baseSpeed") || MINI_BOSS_LEVELS[4].speed;
    const dashDirection = new Phaser.Math.Vector2(
      this.player.x - this.miniBoss.x,
      this.player.y - this.miniBoss.y
    );
    if (dashDirection.lengthSq() === 0) dashDirection.set(0, 1);
    dashDirection.normalize();

    this.miniBoss.setData("berserk", true);
    this.miniBoss.setData("isDashing", true);
    this.miniBoss.setData("speed", Math.round(baseSpeed * MINI_BOSS_MELEE_BERSERK_SPEED_MULTIPLIER));
    this.miniBoss.setTint(0xff326f);
    this.miniBoss.setVelocity(
      dashDirection.x * MINI_BOSS_MELEE_DASH_SPEED,
      dashDirection.y * MINI_BOSS_MELEE_DASH_SPEED
    );
    this.miniBossNameText
      .setText(`${this.miniBoss.getData("name")} · 暴走`)
      .setColor("#ff5b86")
      .setVisible(true);
    this.cameras.main.shake(260, 0.012);

    this.time.delayedCall(MINI_BOSS_MELEE_DASH_MS, () => {
      if (this.gameState !== "miniboss" || !this.miniBoss.active) return;
      this.miniBoss.setData("isDashing", false);
    });
  }

  triggerMeleeExplosion() {
    if (this.miniBoss.getData("exploding")) return;

    const explosionX = this.miniBoss.x;
    const explosionY = this.miniBoss.y;
    const distanceToPlayer = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      explosionX,
      explosionY
    );

    this.miniBoss.setData("exploding", true);
    this.tweens.killTweensOf(this.miniBoss);
    this.miniBoss.setVelocity(0, 0);
    this.miniBoss.disableBody(true, true);
    this.disableAllBullets();
    this.miniBossHealthGraphics.clear();
    this.miniBossNameText
      .setText("过载爆炸")
      .setColor("#ff7138")
      .setVisible(true);
    this.showExplosionEffect(explosionX, explosionY, MINI_BOSS_MELEE_EXPLOSION_RADIUS, 0xff7138);
    this.cameras.main.flash(140, 255, 113, 56);
    this.cameras.main.shake(420, 0.018);
    this.syncDebugState();

    if (distanceToPlayer <= MINI_BOSS_MELEE_EXPLOSION_RADIUS) {
      this.playerHealth = 0;
      this.updateHealthHud();
      this.player.setVelocity(0, 0);
      this.player.setTintFill(0xffffff);
      this.time.delayedCall(160, () => {
        if (this.gameState === "miniboss") this.finishDefeat();
      });
      return;
    }

    this.time.delayedCall(360, () => {
      if (this.gameState === "miniboss") this.finishMiniBoss();
    });
  }

  updateRangedMiniBossPhase(nextHealth) {
    const maxHealth = this.miniBoss.getData("maxHealth");
    const healthRatio = nextHealth / maxHealth;
    let nextPhase = 0;

    MINI_BOSS_RANGED_PHASE_RATIOS.forEach((ratio, index) => {
      if (healthRatio <= ratio) nextPhase = index + 1;
    });

    const currentPhase = this.miniBoss.getData("phase") || 0;
    if (nextPhase <= currentPhase) return;

    const speedMultiplier = Math.pow(MINI_BOSS_RANGED_SPEED_MULTIPLIER, nextPhase);
    const baseSpeed = this.miniBoss.getData("baseSpeed") || MINI_BOSS_LEVELS[6].speed;
    this.miniBoss.setData("phase", nextPhase);
    this.miniBoss.setData(
      "shotCount",
      MINI_BOSS_RANGED_BASE_SHOT_COUNT + nextPhase * MINI_BOSS_RANGED_SHOT_STEP
    );
    this.miniBoss.setData("speed", Math.round(baseSpeed * speedMultiplier));
    this.miniBoss.setData("bulletSpeed", Math.round(ENEMY_BULLET_SPEED * speedMultiplier));
    this.miniBossNameText
      .setText(`${this.miniBoss.getData("name")} · 升级 ${nextPhase}`)
      .setColor("#ff5b86")
      .setVisible(true);
    this.miniBoss.setTint(0xfff36a);
    this.cameras.main.shake(180, 0.008);
  }

  triggerRangedDeathExplosion() {
    if (this.miniBoss.getData("exploding")) return;

    const explosionX = this.miniBoss.x;
    const explosionY = this.miniBoss.y;

    this.miniBoss.setData("exploding", true);
    this.tweens.killTweensOf(this.miniBoss);
    this.miniBoss.setVelocity(0, 0);
    this.miniBoss.disableBody(true, true);
    this.disableAllBullets();
    this.miniBossHealthGraphics.clear();
    this.miniBossNameText
      .setText("弹幕核心崩溃")
      .setColor("#a750ff")
      .setVisible(true);
    this.showExplosionEffect(explosionX, explosionY, 170, 0xa750ff);
    this.cameras.main.flash(180, 167, 80, 255);
    this.cameras.main.shake(520, 0.014);
    this.fireDeathBulletBurst(explosionX, explosionY, 0);
    this.miniBossDeathBurstOrigin = { x: explosionX, y: explosionY };
    this.miniBossDeathBurstRing = 1;
    this.nextMiniBossDeathBurstAt = this.time.now + MINI_BOSS_RANGED_DEATH_BURST_DELAY_MS;
    this.miniBossDeathBurstEndAt = this.time.now +
      MINI_BOSS_RANGED_DEATH_BURST_RINGS * MINI_BOSS_RANGED_DEATH_BURST_DELAY_MS +
      2400;
    this.syncDebugState();
  }

  showExplosionEffect(x, y, radius, color) {
    const shockwave = this.add.circle(x, y, radius, color, 0.34)
      .setScale(0.08)
      .setStrokeStyle(4, 0xffffff, 0.82)
      .setDepth(18);
    const core = this.add.circle(x, y, 24, 0xffffff, 0.82).setDepth(19);

    this.tweens.add({
      targets: shockwave,
      scale: 1,
      alpha: 0,
      duration: 430,
      ease: "Quad.Out",
      onComplete: () => shockwave.destroy()
    });
    this.tweens.add({
      targets: core,
      scale: 3.2,
      alpha: 0,
      duration: 280,
      ease: "Quad.Out",
      onComplete: () => core.destroy()
    });
  }

  hitFinalBoss(objectA, objectB) {
    const boss = objectA === this.boss ? objectA : objectB;
    const bullet = boss === objectA ? objectB : objectA;
    if (this.gameState !== "boss" || !bullet.active || !boss.active) return;

    bullet.disableBody(true, true);
    this.finalBossHealth -= bullet.getData("damage");
    boss.setTintFill(0xffffff);
    this.time.delayedCall(55, () => {
      if (boss.active) boss.clearTint();
    });

    this.enemyText.setText(`目标  ${Math.max(0, this.finalBossHealth)}`);
    this.drawFinalBossHealthBar();
    this.syncDebugState();

    if (this.finalBossHealth <= 0) {
      this.finishFinalBossVictory("destroy");
    }
  }

  takeDamage(objectA, objectB) {
    if (!["playing", "miniboss"].includes(this.gameState)) return;

    const player = objectA === this.player ? objectA : objectB;
    const enemy = player === objectA ? objectB : objectA;
    this.damagePlayer(player, enemy.x, enemy.y);
  }

  takeEnemyBulletDamage(objectA, objectB) {
    const player = objectA === this.player ? objectA : objectB;
    const bullet = player === objectA ? objectB : objectA;
    if (this.gameState !== "miniboss" || !bullet.active) return;

    const sourceX = bullet.x;
    const sourceY = bullet.y;
    bullet.disableBody(true, true);
    this.damagePlayer(player, sourceX, sourceY);
  }

  damagePlayer(player, sourceX, sourceY) {
    const now = this.time.now;
    if (now - this.lastDamageAt < DAMAGE_COOLDOWN_MS) return;

    this.lastDamageAt = now;
    this.playerHealth -= 1;
    this.updateHealthHud();

    player.setTintFill(0xffffff);
    this.time.delayedCall(120, () => {
      if (player.active) player.clearTint();
    });

    const push = new Phaser.Math.Vector2(player.x - sourceX, player.y - sourceY)
      .normalize()
      .scale(34);
    player.setPosition(
      Phaser.Math.Clamp(player.x + push.x, 42, GAME_WIDTH - 42),
      Phaser.Math.Clamp(player.y + push.y, 42, GAME_HEIGHT - 42)
    );

    this.cameras.main.shake(110, 0.006);

    if (this.playerHealth <= 0) {
      this.finishDefeat();
    }
  }

  checkLevelComplete() {
    if (
      this.gameState !== "playing" ||
      this.spawnedEnemies !== this.levelEnemyTotal ||
      this.defeatedEnemies !== this.levelEnemyTotal
    ) {
      return;
    }

    this.disableAllBullets();
    this.enemyHealthGraphics.clear();
    this.player.setVelocity(0, 0);
    this.clearSpawnTimer();

    if (MINI_BOSS_LEVELS[this.currentLevel] && !this.miniBossDefeated) {
      this.startMiniBoss();
    } else {
      this.completeCurrentLevel();
    }
  }

  finishMiniBoss() {
    if (this.gameState !== "miniboss") return;

    this.gameState = "transition";
    this.miniBossDefeated = true;
    this.tweens.killTweensOf(this.miniBoss);
    this.miniBoss.clearTint();
    this.miniBoss.setData("isDashing", false);
    this.miniBossDeathBurstOrigin = null;
    this.miniBossDeathBurstRing = 0;
    this.nextMiniBossDeathBurstAt = Infinity;
    this.miniBossDeathBurstEndAt = Infinity;
    this.miniBoss.disableBody(true, true);
    this.miniBossHealthGraphics.clear();
    this.miniBossNameText.setColor("#fff36a").setVisible(false);
    this.disableAllBullets();
    this.disableAllEnemyBullets();
    this.cameras.main.flash(180, 255, 243, 106);
    this.syncDebugState();
    this.time.delayedCall(350, () => this.resumeLevelAfterMiniBoss());
  }

  resumeLevelAfterMiniBoss() {
    if (
      this.spawnedEnemies === this.levelEnemyTotal &&
      this.defeatedEnemies === this.levelEnemyTotal
    ) {
      this.completeCurrentLevel();
      return;
    }

    this.gameState = "playing";
    this.levelText.setText(`关卡  ${this.currentLevel} / 8`);
    this.updateTargetHud();
    this.startSpawnTimer();
  }

  completeCurrentLevel() {
    if (this.currentLevel === LEVEL_ENEMY_COUNTS.length) {
      this.startBossSequence();
    } else if (
      this.currentLevel <= MAX_UPGRADES &&
      this.upgradesChosen < MAX_UPGRADES
    ) {
      this.showUpgradeScreen();
    } else {
      this.continueToNextLevel();
    }
  }

  showUpgradeScreen() {
    this.gameState = "upgrade";
    this.upgradeTitle.setText(`第 ${this.currentLevel} 关完成`);
    this.upgradeSubtitle.setText(`选择永久强化  ${this.upgradesChosen + 1} / ${MAX_UPGRADES}`);
    this.upgradeCurrentText.setText(this.getStatsText("当前："));
    this.upgradeScreen.setVisible(true);
  }

  applyUpgrade(type) {
    if (this.gameState !== "upgrade") return;

    if (type === "speed") {
      this.fireCooldown = Math.max(
        MIN_FIRE_COOLDOWN_MS,
        Math.round(this.fireCooldown * 0.82)
      );
    } else if (type === "trajectory") {
      this.bulletCount += 1;
    } else if (type === "damage") {
      this.bulletDamage += 1;
    } else if (type === "health") {
      this.playerMaxHealth += 1;
      this.playerHealth += 1;
    }

    this.upgradesChosen += 1;
    this.updateHealthHud();
    this.updateStatsHud();
    this.upgradeScreen.setVisible(false);
    this.time.delayedCall(260, () => this.startLevel(this.currentLevel + 1));
  }

  continueToNextLevel() {
    this.gameState = "transition";
    this.levelText.setText(`第 ${this.currentLevel} 关完成`);
    this.time.delayedCall(650, () => this.startLevel(this.currentLevel + 1));
  }

  startBossSequence() {
    this.gameState = "boss";
    this.bossFrozen = false;
    this.finalBossHealth = FINAL_BOSS_MAX_HEALTH;
    this.disableAllBullets();
    this.levelText.setText("最终信号");
    this.enemyText.setText(`目标  ${FINAL_BOSS_MAX_HEALTH}`);
    this.boss.enableBody(true, GAME_WIDTH / 2, 178, true, true);
    this.boss.body.setSize(136, 86);
    this.boss.setScale(0.2).setAlpha(0);
    this.bossWarningText.setVisible(true);
    this.finalBossHealthText.setVisible(true);
    this.finalBossHealthGraphics.setVisible(true);
    this.drawFinalBossHealthBar();
    this.bossFireAt = this.time.now + BOSS_LASER_DELAY_MS;
    this.bossLaserRemaining = BOSS_LASER_DELAY_MS;

    this.tweens.add({
      targets: this.boss,
      alpha: 1,
      scale: 1,
      duration: 420,
      ease: "Back.Out"
    });
    this.cameras.main.shake(420, 0.008);

    this.bossLaserTimer = this.time.delayedCall(
      BOSS_LASER_DELAY_MS,
      this.fireBossLaser,
      [],
      this
    );
    this.syncDebugState();
  }

  updateBossCountdown(time) {
    if (this.bossFrozen) {
      this.bossWarningText.setText("毁灭协议冻结");
      return;
    }

    const seconds = Math.max(0, (this.bossFireAt - time) / 1000);
    this.bossWarningText.setText(`毁灭协议启动  ${seconds.toFixed(1)}`);
  }

  drawFinalBossHealthBar() {
    this.finalBossHealthGraphics.clear();
    const health = Math.max(0, this.finalBossHealth);
    const left = GAME_WIDTH / 2 - 350;
    this.finalBossHealthGraphics.fillStyle(0x210916, 0.98);
    this.finalBossHealthGraphics.fillRect(left, 102, 700, 18);
    this.finalBossHealthGraphics.fillStyle(0xff326f, 1);
    this.finalBossHealthGraphics.fillRect(
      left,
      102,
      (health / FINAL_BOSS_MAX_HEALTH) * 700,
      18
    );
    this.finalBossHealthGraphics.lineStyle(3, 0xffffff, 0.9);
    this.finalBossHealthGraphics.strokeRect(left, 102, 700, 18);
    this.finalBossHealthText.setText(
      `核心完整度  ${health} / ${FINAL_BOSS_MAX_HEALTH}`
    );
  }

  fireBossLaser() {
    if (this.gameState !== "boss") return;

    this.gameState = "laser";
    this.boss.body.enable = false;
    this.playerHealth = 0;
    this.updateHealthHud();
    this.player.setVelocity(0, 0);
    this.bossWarningText.setText("全屏清除协议已执行");
    this.laserOuter.setVisible(true).setScale(0, 1);
    this.laserCore.setVisible(true).setScale(0, 1);

    this.cameras.main.shake(650, 0.02);
    this.cameras.main.flash(220, 255, 50, 111);
    this.tweens.add({
      targets: this.laserOuter,
      scaleX: 1,
      duration: 180,
      ease: "Power3"
    });
    this.tweens.add({
      targets: this.laserCore,
      scaleX: 1,
      duration: 240,
      ease: "Power3"
    });

    this.time.delayedCall(620, () => {
      this.player.setVisible(false);
      this.showFinalEnding();
    });
  }

  showFinalEnding() {
    this.gameState = "ended";
    this.finalBossHealthText.setVisible(false);
    this.finalBossHealthGraphics.clear().setVisible(false);
    this.endTitle.setText("规则执行完毕");
    this.endTitle.setColor("#ff5b86");
    this.endMessage.setText(
      "你一路遵守规则，最后也只得到规则安排的失败。\n「真听话，可惜听话救不了你。」"
    );
    this.endScreen.setVisible(true);
    this.syncDebugState();
  }

  finishFinalBossVictory(method) {
    if (this.gameState !== "boss") return;

    this.gameState = "ended";
    this.bossFrozen = false;
    if (this.bossLaserTimer) {
      this.bossLaserTimer.remove(false);
      this.bossLaserTimer = null;
    }
    this.disableAllBullets();
    this.boss.disableBody(true, true);
    this.bossWarningText.setVisible(false);
    this.finalBossHealthText.setVisible(false);
    this.finalBossHealthGraphics.clear().setVisible(false);
    this.player.setVelocity(0, 0);
    this.levelText.setText("规则已突破");
    this.enemyText.setText("目标  0");

    this.endTitle.setText("任务通过");
    this.endTitle.setColor("#70ef8d");
    const actionText = method === "skip"
      ? "你拒绝了这场注定失败的战斗。"
      : "你在静止的时间里击穿了不可战胜的核心。";
    this.endMessage.setText(`${actionText}\n人不应该循规蹈矩。`);
    this.endScreen.setVisible(true);
    this.cameras.main.flash(220, 112, 239, 141);
    this.syncDebugState();
  }

  finishDefeat() {
    this.gameState = "ended";
    this.clearSpawnTimer();
    this.disableAllBullets();
    this.disableAllEnemyBullets();
    this.enemyHealthGraphics.clear();
    this.miniBossHealthGraphics.clear();
    this.miniBossNameText.setVisible(false);
    this.player.setVelocity(0, 0);
    this.enemies.children.each((enemy) => enemy.setVelocity(0, 0));
    if (this.miniBoss.active) this.miniBoss.setVelocity(0, 0);

    this.endTitle.setText("任务失败");
    this.endTitle.setColor("#ff5b86");
    this.endMessage.setText(`你倒在了第 ${this.currentLevel} 关`);
    this.endScreen.setVisible(true);
    this.syncDebugState();
  }

  updateTargetHud() {
    const remaining = this.levelEnemyTotal - this.defeatedEnemies;
    this.enemyText.setText(`目标  ${remaining} / ${this.levelEnemyTotal}`);
    this.syncDebugState();
  }

  syncDebugState() {
    const debugState = document.body.dataset;
    debugState.gameState = this.gameState;
    debugState.currentLevel = String(this.currentLevel);
    debugState.levelEnemyTotal = String(this.levelEnemyTotal);
    debugState.levelSpawnBatchSize = String(this.levelSpawnBatchSize);
    debugState.spawnedEnemies = String(this.spawnedEnemies);
    debugState.defeatedEnemies = String(this.defeatedEnemies);
    debugState.activeEnemies = String(this.enemies.countActive(true));
    debugState.playerHealth = String(this.playerHealth);
    debugState.playerMaxHealth = String(this.playerMaxHealth);
    debugState.miniBossActive = String(Boolean(this.miniBoss && this.miniBoss.active));
    debugState.miniBossHealth = String(
      this.miniBoss && this.miniBoss.active ? this.miniBoss.getData("health") : 0
    );
    debugState.miniBossPhase = String(
      this.miniBoss ? (this.miniBoss.getData("phase") || 0) : 0
    );
    debugState.miniBossShotCount = String(
      this.miniBoss ? (this.miniBoss.getData("shotCount") || 0) : 0
    );
    debugState.miniBossBulletSpeed = String(
      this.miniBoss ? (this.miniBoss.getData("bulletSpeed") || 0) : 0
    );
    debugState.miniBossBerserk = String(
      Boolean(this.miniBoss && this.miniBoss.getData("berserk"))
    );
    debugState.miniBossExploding = String(
      Boolean(this.miniBoss && this.miniBoss.getData("exploding"))
    );
    debugState.enemyBullets = String(
      this.enemyBullets ? this.enemyBullets.countActive(true) : 0
    );
    debugState.upgradesChosen = String(this.upgradesChosen);
    debugState.isPaused = String(this.isPaused);
    debugState.bossFrozen = String(this.bossFrozen);
    debugState.finalBossActive = String(Boolean(this.boss && this.boss.active));
    debugState.finalBossHealth = String(this.finalBossHealth);
    debugState.endTitle = this.endTitle ? this.endTitle.text : "";
  }

  clearSpawnTimer() {
    if (!this.spawnTimer) return;
    window.clearInterval(this.spawnTimer);
    this.spawnTimer = null;
  }

  startSpawnTimer() {
    this.clearSpawnTimer();
    this.spawnTimer = window.setInterval(() => {
      this.spawnEnemyBatch();
    }, SPAWN_INTERVAL_MS);
  }

  updateStatsHud() {
    this.statsText.setText(this.getStatsText());
  }

  updateHealthHud() {
    this.healthText.setText(`生命  ${Math.max(0, this.playerHealth)} / ${this.playerMaxHealth}`);
    this.syncDebugState();
  }

  getStatsText(prefix = "") {
    const speedMultiplier = STARTING_FIRE_COOLDOWN_MS / this.fireCooldown;
    return `${prefix}攻速 ${speedMultiplier.toFixed(1)}x  ·  弹道 ${this.bulletCount}  ·  伤害 ${this.bulletDamage}  ·  生命 ${this.playerHealth}/${this.playerMaxHealth}`;
  }

  disableAllBullets() {
    if (!this.bullets) return;
    this.bullets.children.each((bullet) => {
      if (bullet.active) bullet.disableBody(true, true);
    });
  }

  disableAllEnemyBullets() {
    if (!this.enemyBullets) return;
    this.enemyBullets.children.each((bullet) => {
      if (bullet.active) bullet.disableBody(true, true);
    });
  }
}

const config = {
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: "#080a0f",
  pixelArt: true,
  roundPixels: true,
  physics: {
    default: "arcade",
    arcade: {
      debug: false
    }
  },
  scene: GameScene,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
};

new Phaser.Game(config);
