import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const applicationTables = {
  games: defineTable({
    sessionId: v.string(),
    currentRound: v.number(),
    totalScore: v.number(),
    isComplete: v.boolean(),
    completedAt: v.optional(v.number()),
    gameMode: v.optional(v.string()), // "batters" or "pitchers"
    // Removed players array - no longer needed
  }).index("by_session", ["sessionId"]),
  
  rounds: defineTable({
    gameId: v.id("games"),
    roundNumber: v.number(),
    playerId: v.string(),
    playerName: v.string(),
    playerTeam: v.optional(v.string()),
    playerStats: v.optional(v.any()), // Store all player stats for this round
    selectedCategory: v.optional(v.string()),
    actualRank: v.optional(v.number()),
    score: v.optional(v.number()),
  }).index("by_game", ["gameId"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
