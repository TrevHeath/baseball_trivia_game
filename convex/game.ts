import { v } from "convex/values";
import { query, mutation, action } from "./_generated/server";
import { api } from "./_generated/api";

export const startNewGame = action({
  args: { sessionId: v.string(), gameMode: v.optional(v.string()) },
  handler: async (ctx, args): Promise<any> => {
    const mode = args.gameMode || "batters";

    // Create the game first, then fetch the first player
    const gameId: any = await ctx.runMutation(api.game.createNewGame, {
      sessionId: args.sessionId,
      gameMode: mode,
    });

    // Fetch the first player for round 1 based on game mode
    const playerAction =
      mode === "pitchers"
        ? api.players.getRandomPitcher
        : api.players.getRandomPlayer;
    const playerResult: any = await ctx.runAction(playerAction, {
      excludedPlayerIds: [],
    });

    if (!playerResult.success || !playerResult.player) {
      throw new Error("Failed to fetch first player");
    }

    // Add the first round with the player
    await ctx.runMutation(api.game.addRoundWithPlayer, {
      gameId,
      roundNumber: 1,
      player: playerResult.player,
    });

    return gameId;
  },
});

export const createNewGame = mutation({
  args: {
    sessionId: v.string(),
    gameMode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // End any existing game for this session, but only if all 6 rounds are filled
    const existingGame = await ctx.db
      .query("games")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("isComplete"), false))
      .first();

    if (existingGame) {
      // Check if all 6 rounds are filled
      const rounds = await ctx.db
        .query("rounds")
        .withIndex("by_game", (q) => q.eq("gameId", existingGame._id))
        .collect();

      if (rounds.length >= 6) {
        await ctx.db.patch(existingGame._id, { isComplete: true });
      }
    }

    // Create new game (without players array)
    const gameId = await ctx.db.insert("games", {
      sessionId: args.sessionId,
      currentRound: 1,
      totalScore: 0,
      isComplete: false,
      gameMode: args.gameMode || "batters",
    });

    return gameId;
  },
});

export const addRoundWithPlayer = mutation({
  args: {
    gameId: v.id("games"),
    roundNumber: v.number(),
    player: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("rounds", {
      gameId: args.gameId,
      roundNumber: args.roundNumber,
      playerId: args.player.playerId,
      playerName: args.player.name,
      playerTeam: args.player.team,
      playerStats: args.player,
    });
  },
});

export const getCurrentGame = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const game = await ctx.db
      .query("games")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("isComplete"), false))
      .first();

    if (!game) {
      return {
        game: null,
        currentRound: null,
        player: null,
      };
    }

    const currentRound = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .filter((q) => q.eq(q.field("roundNumber"), game.currentRound))
      .first();

    // Get player data from the current round
    const player = currentRound ? currentRound.playerStats : null;

    return {
      game,
      currentRound,
      player,
    };
  },
});

export const selectCategory = action({
  args: {
    sessionId: v.string(),
    category: v.string(),
  },
  handler: async (ctx, args): Promise<any> => {
    // Update the current round with the selection
    const result: any = await ctx.runMutation(
      api.game.updateRoundWithSelection,
      {
        sessionId: args.sessionId,
        category: args.category,
      }
    );

    // If game is not complete, fetch next player
    if (!result.isGameComplete) {
      console.log(`Fetching new player for round ${result.nextRound}`);

      // Determine which player action to use based on game mode
      const playerAction =
        result.gameMode === "pitchers"
          ? api.players.getRandomPitcher
          : api.players.getRandomPlayer;
      const playerResult: any = await ctx.runAction(playerAction, {
        excludedPlayerIds: result.usedPlayerIds,
      });

      if (playerResult.success && playerResult.player) {
        console.log(
          `Adding new player: ${playerResult.player.name} for round ${result.nextRound}`
        );
        await ctx.runMutation(api.game.addRoundWithPlayer, {
          gameId: result.gameId,
          roundNumber: result.nextRound,
          player: playerResult.player,
        });
      }
    }

    return {
      actualRank: result.actualRank,
      newTotalScore: result.newTotalScore,
      isGameComplete: result.isGameComplete,
    };
  },
});

export const updateRoundWithSelection = mutation({
  args: {
    sessionId: v.string(),
    category: v.string(),
  },
  handler: async (ctx, args) => {
    const game = await ctx.db
      .query("games")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("isComplete"), false))
      .first();

    if (!game) throw new Error("No active game found");

    const currentRound = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .filter((q) => q.eq(q.field("roundNumber"), game.currentRound))
      .first();

    if (!currentRound) throw new Error("No current round found");

    const player = currentRound.playerStats;
    if (!player) throw new Error("Player stats not found");

    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();
    const usedPlayerIds = rounds.map((round) => round.playerId);

    // Get the rank for the selected category based on game mode
    const gameMode = game.gameMode || "batters";
    let categoryRankMap: Record<string, number>;

    if (gameMode === "pitchers") {
      categoryRankMap = {
        era: player.eraRank,
        whip: player.whipRank,
        strikeouts: player.strikeoutsRank,
        "strikeouts-per-9": player.strikeoutsPer9Rank,
        "innings-pitched": player.inningsPitchedRank,
        avg: player.avgRank, // opponents batting average
      };
    } else {
      categoryRankMap = {
        "batting-average": player.battingAverageRank,
        "home-runs": player.homeRunsRank,
        ops: player.opsRank,
        obp: player.obpRank,
        "stolen-bases": player.stolenBasesRank,
        rbis: player.rbisRank,
      };
    }

    const actualRank = categoryRankMap[args.category];
    if (!actualRank) throw new Error("Invalid category");

    // Update the round with selection and score
    await ctx.db.patch(currentRound._id, {
      selectedCategory: args.category,
      actualRank,
      score: actualRank,
    });

    // Update game total score
    const newTotalScore = game.totalScore + actualRank;

    if (game.currentRound >= 6) {
      // Game complete
      await ctx.db.patch(game._id, {
        totalScore: newTotalScore,
        isComplete: true,
        completedAt: Date.now(),
      });
      return {
        actualRank,
        newTotalScore,
        isGameComplete: true,
        gameId: game._id,
        nextRound: 0,
        gameMode,
        usedPlayerIds,
      };
    } else {
      // Prepare for next round
      const nextRound = game.currentRound + 1;
      await ctx.db.patch(game._id, {
        currentRound: nextRound,
        totalScore: newTotalScore,
      });

      return {
        actualRank,
        newTotalScore,
        isGameComplete: false,
        gameId: game._id,
        nextRound,
        gameMode,
        usedPlayerIds,
      };
    }
  },
});

export const getUsedCategories = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const game = await ctx.db
      .query("games")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("isComplete"), false))
      .first();

    if (!game) return [];

    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .collect();

    return rounds
      .filter((round) => round.selectedCategory)
      .map((round) => round.selectedCategory);
  },
});

export const getGameHistory = query({
  args: { sessionId: v.string() },
  handler: async (ctx, args) => {
    const completedGame = await ctx.db
      .query("games")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("isComplete"), true))
      .order("desc")
      .first();

    if (!completedGame) return null;

    const rounds = await ctx.db
      .query("rounds")
      .withIndex("by_game", (q) => q.eq("gameId", completedGame._id))
      .collect();

    return {
      game: completedGame,
      rounds: rounds.sort((a, b) => a.roundNumber - b.roundNumber),
    };
  },
});

export const getAllGameHistory = query({
  args: { sessionId: v.string(), gameMode: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let completedGames = ctx.db
      .query("games")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("isComplete"), true));

    if (args.gameMode === "pitchers") {
      // For pitchers, only include games explicitly marked as pitchers
      completedGames = completedGames.filter((q) =>
        q.eq(q.field("gameMode"), "pitchers")
      );
    } else if (args.gameMode === "batters") {
      // For batters, include both "batters" and undefined (backwards compatibility)
      completedGames = completedGames.filter((q) =>
        q.or(
          q.eq(q.field("gameMode"), "batters"),
          q.eq(q.field("gameMode"), undefined)
        )
      );
    }

    const cgs = await completedGames.order("desc").collect();

    return cgs;
  },
});

export const getHighScores = query({
  args: { gameMode: v.optional(v.string()) },
  handler: async (ctx, args) => {
    // Get current time in PST/PDT
    const now = new Date();

    // PST is UTC-8, PDT is UTC-7. We'll use a simple approach to determine DST
    // DST in US typically runs from 2nd Sunday in March to 1st Sunday in November
    const year = now.getUTCFullYear();

    // Find 2nd Sunday in March
    const firstSundayMarch = new Date(year, 2, 1);
    firstSundayMarch.setDate(1 + ((7 - firstSundayMarch.getDay()) % 7));
    const secondSundayMarch = new Date(firstSundayMarch);
    secondSundayMarch.setDate(firstSundayMarch.getDate() + 7);

    // Find 1st Sunday in November
    const firstSundayNov = new Date(year, 10, 1);
    firstSundayNov.setDate(1 + ((7 - firstSundayNov.getDay()) % 7));

    // Determine if we're in DST (PDT = UTC-7) or PST (UTC-8)
    const isDST = now >= secondSundayMarch && now < firstSundayNov;
    const pstOffset = isDST ? -7 : -8; // hours from UTC

    // Get current time in PST/PDT
    const pstNow = new Date(now.getTime() + pstOffset * 60 * 60 * 1000);

    // Get start of today in PST (midnight PST)
    const startOfTodayPST = new Date(
      pstNow.getFullYear(),
      pstNow.getMonth(),
      pstNow.getDate()
    );
    // Convert back to UTC timestamp for database comparison
    const startOfTodayUTC =
      startOfTodayPST.getTime() - pstOffset * 60 * 60 * 1000;

    // Get start of 7 days ago in PST (midnight PST)
    const startOfSevenDaysAgoPST = new Date(startOfTodayPST);
    startOfSevenDaysAgoPST.setDate(startOfSevenDaysAgoPST.getDate() - 7);
    // Convert back to UTC timestamp for database comparison
    const startOfSevenDaysAgoUTC =
      startOfSevenDaysAgoPST.getTime() - pstOffset * 60 * 60 * 1000;

    // Get all completed games, optionally filtered by game mode
    let gamesQuery = ctx.db
      .query("games")
      .filter((q) => q.eq(q.field("isComplete"), true))
      .filter((q) => q.neq(q.field("completedAt"), undefined));

    // Filter by game mode if specified
    if (args.gameMode === "pitchers") {
      // For pitchers, only include games explicitly marked as pitchers
      gamesQuery = gamesQuery.filter((q) =>
        q.eq(q.field("gameMode"), "pitchers")
      );
    } else if (args.gameMode === "batters") {
      // For batters, include both "batters" and undefined (backwards compatibility)
      gamesQuery = gamesQuery.filter((q) =>
        q.or(
          q.eq(q.field("gameMode"), "batters"),
          q.eq(q.field("gameMode"), undefined)
        )
      );
    }
    // If args.gameMode is undefined, include all games (no additional filter)

    const allCompletedGames = await gamesQuery.collect();

    // Filter for today's games (since midnight PST)
    const todayGames = allCompletedGames.filter(
      (game) => game.completedAt && game.completedAt >= startOfTodayUTC
    );

    // Filter for last 7 days (since midnight PST 7 days ago)
    const weekGames = allCompletedGames.filter(
      (game) => game.completedAt && game.completedAt >= startOfSevenDaysAgoUTC
    );

    // Find best (lowest) scores
    const todayBestScore =
      todayGames.length > 0
        ? Math.min(...todayGames.map((game) => game.totalScore))
        : null;

    const weekBestScore =
      weekGames.length > 0
        ? Math.min(...weekGames.map((game) => game.totalScore))
        : null;

    return {
      todayBestScore,
      weekBestScore,
      todayGamesCount: todayGames.length,
      weekGamesCount: weekGames.length,
    };
  },
});
