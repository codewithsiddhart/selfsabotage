const { config } = require("../config");

/**
 * Server-authoritative round flow: start → timer → end → next or finish.
 * Gameplay simulation stays in memory; DB writes happen only on match end (outside this class).
 */
class GameSession {
  /**
   * @param {object} opts
   * @param {string} opts.roomId
   * @param {string} opts.roomCode
   * @param {number} opts.totalRounds
   * @param {number} opts.roundDurationMs
   * @param {() => void} opts.onBroadcastState
   * @param {(roundResult: object) => void} opts.onRoundEnd
   * @param {(summary: object) => void} opts.onGameEnd
   */
  constructor(opts) {
    this.roomId = opts.roomId;
    this.roomCode = opts.roomCode;
    this.totalRounds = opts.totalRounds;
    this.roundDurationMs = opts.roundDurationMs;
    this.onBroadcastState = opts.onBroadcastState;
    this.onRoundEnd = opts.onRoundEnd;
    this.onGameEnd = opts.onGameEnd;

    this.currentRound = 0;
    /** @type {ReturnType<typeof setTimeout> | null} */
    this.roundTimer = null;
    this.roundStartedAt = 0;
    this.roundEndsAt = 0;
    this.ended = false;
  }

  clearTimer() {
    if (this.roundTimer) {
      clearTimeout(this.roundTimer);
      this.roundTimer = null;
    }
  }

  /**
   * @param {Map<string, import("./PlayerState").PlayerRecord>} players
   */
  start(players) {
    this.clearTimer();
    this.currentRound = 1;
    this.ended = false;
    this._beginRound(players);
  }

  /**
   * Award survival points for the round (authoritative).
   * @param {Map<string, import("./PlayerState").PlayerRecord>} players
   */
  applyRoundScoring(players) {
    const pts = config.game.baseRoundSurvivalPoints;
    for (const p of players.values()) {
      p.score += pts;
    }
  }

  /**
   * @param {Map<string, import("./PlayerState").PlayerRecord>} players
   */
  _beginRound(players) {
    this.roundStartedAt = Date.now();
    this.roundEndsAt = this.roundStartedAt + this.roundDurationMs;

    this.onBroadcastState({
      type: "round:started",
      roomId: this.roomId,
      roomCode: this.roomCode,
      round: this.currentRound,
      totalRounds: this.totalRounds,
      startedAt: this.roundStartedAt,
      endsAt: this.roundEndsAt,
      durationMs: this.roundDurationMs,
    });

    this.roundTimer = setTimeout(() => this._endRound(players), this.roundDurationMs);
  }

  /**
   * @param {Map<string, import("./PlayerState").PlayerRecord>} players
   */
  _endRound(players) {
    if (this.ended) return;
    this.clearTimer();

    this.applyRoundScoring(players);

    const roundResult = {
      roomId: this.roomId,
      roomCode: this.roomCode,
      round: this.currentRound,
      totalRounds: this.totalRounds,
      scores: Object.fromEntries(
        Array.from(players.entries()).map(([id, pl]) => [id, { displayName: pl.displayName, score: pl.score }])
      ),
    };

    this.onRoundEnd(roundResult);

    if (this.currentRound >= this.totalRounds) {
      this._finishGame(players);
      return;
    }

    this.currentRound += 1;
    this._beginRound(players);
  }

  /**
   * @param {Map<string, import("./PlayerState").PlayerRecord>} players
   */
  _finishGame(players) {
    this.ended = true;
    this.clearTimer();

    let best = -Infinity;
    const leaders = [];
    for (const pl of players.values()) {
      if (pl.score > best) {
        best = pl.score;
        leaders.length = 0;
        leaders.push(pl.socketId);
      } else if (pl.score === best) {
        leaders.push(pl.socketId);
      }
    }

    const summary = {
      roomId: this.roomId,
      roomCode: this.roomCode,
      winnerSocketIds: leaders,
      finalScores: Array.from(players.values()).map((p) => ({
        socketId: p.socketId,
        displayName: p.displayName,
        userId: p.userId,
        score: p.score,
      })),
    };

    this.onGameEnd(summary);
  }

  dispose() {
    this.ended = true;
    this.clearTimer();
  }
}

module.exports = { GameSession };
