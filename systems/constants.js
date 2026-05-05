(() => {
  "use strict";

  const MAX_PARTICLES = 240;
  const TILE = 32;
  const LEGACY_COLS = 30;
  const LEGACY_ROWS = 18;
  const COLS = 64;
  const ROWS = 36;
  const CANVAS_NATIVE_W = 960;
  const CANVAS_NATIVE_H = 576;
  const CANVAS_ASPECT = CANVAS_NATIVE_W / CANVAS_NATIVE_H;
  const MAX_LEVEL_TEXTS = 48;
  const MAX_LEVEL_TEXT_LEN = 40;
  const JUMP_BUFFER_MS = 158;
  const PAD_LAUNCH_MULT = 1.26;
  const JUMP_FROM_PAD_MULT = 1.42;
  const COYOTE_MS = 142;
  const AIR_RELEASE_FRIC_MUL = 0.48;
  const GROUND_TURN_ACCEL_MUL = 1.52;
  const CAM_FOLLOW_LAMBDA = 13.8;
  const MUD_MOVE_MUL = 0.2;
  const BG_PARALLAX_LINK_X = 0.58;
  const BG_PARALLAX_LINK_Y = 0.52;
  const BG_PARALLAX_SMOOTH = 15.5;

  const BUILD_LIMITS = {
    platform: 160,
    spikes: 70,
    jumppad: 40,
    hex: 18,
    lava: 24,
    speedBoost: 18,
    food: 12,
    pathBlock: 60,
    checkpoint: 1,
    mud: 10,
    betrayal: 16,
    pressureSwitch: 10,
    timedDoor: 8,
  };

  const POINTS = {
    platform: 1.0,
    spikes: 2.0,
    jumppad: 1.5,
    hex: 2.5,
    lava: 3.0,
    speedBoost: 1.5,
    food: 1.0,
    pathBlock: 0,
    checkpoint: 0.5,
    mud: 1.2,
    betrayal: 1.7,
    pressureSwitch: 1.1,
    timedDoor: 1.4,
  };

  const PHYS = {
    accel: 2480,
    maxSpeed: 298,
    friction: 1920,
    gravity: 1540,
    jumpV: 588,
    airControl: 0.9,
  };

  const GRAVITY = PHYS.gravity;
  const JUMP_VELOCITY = PHYS.jumpV;
  const MOVE_SPEED = PHYS.maxSpeed;

  const Tile = {
    empty: "empty",
    start: "start",
    goal: "goal",
    checkpoint: "checkpoint",
    platform: "platform",
    spikes: "spikes",
    jumppad: "jumppad",
    hex: "hex",
    lava: "lava",
    speedBoost: "speedBoost",
    food: "food",
    pathBlock: "pathBlock",
    mud: "mud",
    betrayal: "betrayal",
    pressureSwitch: "pressureSwitch",
    timedDoor: "timedDoor",
  };

  const KNOWN_TILE_VALUES = new Set(Object.values(Tile));

  const TileInfo = {
    empty: { name: "Eraser", hint: "Remove tiles", color: "transparent" },
    start: { name: "Start", hint: "Spawn point (required)", color: "rgba(122, 167, 255, 1)" },
    goal: { name: "Goal", hint: "Touch to win (required)", color: "rgba(251, 191, 36, 1)" },
    checkpoint: { name: "Checkpoint", hint: "Exactly one per level — touch to save respawn (required)", color: "rgba(56, 189, 248, 1)" },
    platform: { name: "Platform", hint: "Solid ground (may betray you)", color: "rgba(79, 103, 255, 1)" },
    spikes: { name: "Spikes", hint: "Kills you (may activate late)", color: "rgba(255, 77, 109, 1)" },
    jumppad: { name: "Jump Pad", hint: "Launches you (may misfire)", color: "rgba(45, 212, 191, 1)" },
    hex: { name: "Hex", hint: "Curses you (special sabotage)", color: "rgba(167, 139, 250, 1)" },
    lava: { name: "Lava", hint: "Instant death", color: "rgba(234, 88, 12, 1)" },
    speedBoost: { name: "Speed", hint: "Temporary speed boost", color: "rgba(34, 197, 94, 1)" },
    food: { name: "Food", hint: "Restore stability, reduce sabotage", color: "rgba(251, 146, 60, 1)" },
    pathBlock: { name: "Path Block", hint: "Marks intended path (for validation)", color: "rgba(150, 200, 255, 0.6)" },
    mud: { name: "Mud", hint: "5× slower move/jump; can break or shift like platforms", color: "rgba(140, 82, 58, 0.95)" },
    betrayal: { name: "Betrayal", hint: "Starts safe, mutates mid-run into hazard or sludge", color: "rgba(246, 173, 85, 0.95)" },
    pressureSwitch: { name: "Pressure Switch", hint: "Touch to instantly reroute player to its linked destination", color: "rgba(251, 113, 133, 0.95)" },
    timedDoor: { name: "Timed Door", hint: "Teleport door with short cooldown; set destination after placement", color: "rgba(45, 212, 191, 0.95)" },
  };

  const paletteOrder = [
    Tile.start,
    Tile.goal,
    Tile.checkpoint,
    Tile.platform,
    Tile.spikes,
    Tile.jumppad,
    Tile.hex,
    Tile.lava,
    Tile.mud,
    Tile.betrayal,
    Tile.pressureSwitch,
    Tile.timedDoor,
    Tile.speedBoost,
    Tile.food,
    Tile.empty,
  ];

  const TilePaletteIcon = {
    empty: "⌧",
    start: "🏁",
    goal: "⭐",
    checkpoint: "◇",
    platform: "▭",
    spikes: "▲",
    jumppad: "⌃",
    hex: "✦",
    lava: "≈",
    mud: "≋",
    betrayal: "☍",
    pressureSwitch: "⎘",
    timedDoor: "◫",
    speedBoost: "⚡",
    food: "●",
    pathBlock: "◇",
  };

  const TILE_TEXTURE_SRC = {
    platform: "assets/models/tile-platform.png",
    spikes: "assets/models/tile-spikes.png",
    jumppad: "assets/models/tile-jumppad.png",
    speedBoost: "assets/models/tile-speed.png",
    hex: "assets/models/tile-hex.png",
    food: "assets/models/tile-food.png",
    lava: "assets/models/tile-lava.png",
    mud: "assets/models/tile-mud.png",
  };

  const MUSIC_LIBRARY = [
    { id: "off", label: "Off", file: "" },
  ];

  const DRAFT_GRID_KEY = "ssb_build_draft_v1";
  const TUTORIAL_PROMPT_KEY = "ssb_tutorial_prompt_v1";
  const SABOTAGE_META_KEY = "ssb_sabotage_meta_v1";
  const SAVE_KEY = "SSB_SAVE_V2";
  const DEVICE_KEY = "SSB_DEVICE";
  const SABOTAGE_LOG_MAX = 4;
  const UNDO_MAX = 60;
  const VALIDATE_DEBOUNCE_MS = 200;

  const VIBE_LINES = [
    "Cute world. Cruel rules.",
    "You almost decoded the curse.",
    "Legend run loading...",
    "The map remembers your habits.",
    "One more run and it clicks.",
  ];
  const VIBE_WIN_LINES = ["Legendary focus.", "You bent the curse.", "You made chaos look cute."];
  const VIBE_LOSE_LINES = ["So close.", "It is learning you.", "You are almost there."];

  window.GameConstants = {
    MAX_PARTICLES, TILE, LEGACY_COLS, LEGACY_ROWS, COLS, ROWS,
    CANVAS_NATIVE_W, CANVAS_NATIVE_H, CANVAS_ASPECT,
    MAX_LEVEL_TEXTS, MAX_LEVEL_TEXT_LEN,
    JUMP_BUFFER_MS, PAD_LAUNCH_MULT, JUMP_FROM_PAD_MULT, COYOTE_MS,
    AIR_RELEASE_FRIC_MUL, GROUND_TURN_ACCEL_MUL, CAM_FOLLOW_LAMBDA,
    MUD_MOVE_MUL, BG_PARALLAX_LINK_X, BG_PARALLAX_LINK_Y, BG_PARALLAX_SMOOTH,
    BUILD_LIMITS, POINTS, PHYS,
    GRAVITY, JUMP_VELOCITY, MOVE_SPEED,
    Tile, KNOWN_TILE_VALUES, TileInfo, paletteOrder, TilePaletteIcon,
    TILE_TEXTURE_SRC, MUSIC_LIBRARY,
    DRAFT_GRID_KEY, TUTORIAL_PROMPT_KEY, SABOTAGE_META_KEY,
    SAVE_KEY, DEVICE_KEY, SABOTAGE_LOG_MAX, UNDO_MAX, VALIDATE_DEBOUNCE_MS,
    VIBE_LINES, VIBE_WIN_LINES, VIBE_LOSE_LINES,
  };
})();
