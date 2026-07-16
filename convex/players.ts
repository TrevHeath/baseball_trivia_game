"use node";

import { v } from "convex/values";
import { action } from "./_generated/server";

// Using direct MLB Stats API calls for better reliability and control

interface StatLeader {
  person: {
    id: number;
    fullName: string;
    currentTeam?: {
      abbreviation: string;
    };
  };
  value: string;
  rank: number;
}

interface PlayerStats {
  playerId: string;
  name: string;
  position: string;
  weight: number;
  height: string;
  birthDate: string;
  number: string;
  team: string;
  battingAverage: number;
  homeRuns: number;
  ops: number;
  obp: number;
  stolenBases: number;
  rbis: number;
  battingAverageRank: number;
  homeRunsRank: number;
  opsRank: number;
  obpRank: number;
  stolenBasesRank: number;
  rbisRank: number;
}

interface PitcherStats {
  playerId: string;
  name: string;
  position: string;
  weight: number;
  height: string;
  birthDate: string;
  number: string;
  team: string;
  era: number;
  whip: number;
  strikeouts: number;
  strikeoutsPer9: number;
  inningsPitched: number;
  avg: number; // opponents batting average
  eraRank: number;
  whipRank: number;
  strikeoutsRank: number;
  strikeoutsPer9Rank: number;
  inningsPitchedRank: number;
  avgRank: number;
}

async function fetchStatsFromAPI(seasonYear: number): Promise<{
  players: Map<string, any>;
  stats: any[];
  categoryCounts: Record<string, number>;
} | null> {
  try {
    const baseUrl = "https://statsapi.mlb.com/api/v1";

    // Fetch stat leaders for all our categories
    const statCategories = [
      "avg", // batting average
      "homeRuns", // home runs
      "ops", // OPS
      "obp", // obp
      "stolenBases", // stolen bases
      "rbi", // RBIs
    ];

    const promises = statCategories.map(async (category) => {
      // Use improved query with playerPool and sportId for better results
      const url = `${baseUrl}/stats/leaders?leaderCategories=${category}&season=${seasonYear}&statGroup=hitting&limit=100&sportId=1&playerPool=QUALIFIED`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch ${category}: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      let allLeaders = data.leagueLeaders?.[0]?.leaders || [];

      // Always try pagination if we got a substantial number of results (likely means more exist)
      if (allLeaders.length >= 50) {
        console.log(
          `[BATTERS] ${category}: Got ${allLeaders.length} results, trying pagination...`,
        );
        let offset = 100;
        let hasMore = true;

        while (hasMore && offset < 500) {
          // Safety limit
          const paginatedUrl = `${baseUrl}/stats/leaders?leaderCategories=${category}&season=${seasonYear}&statGroup=hitting&limit=100&offset=${offset}&sportId=1&playerPool=QUALIFIED`;
          const paginatedResponse = await fetch(paginatedUrl);

          if (paginatedResponse.ok) {
            const paginatedData = await paginatedResponse.json();
            const moreLeaders = paginatedData.leagueLeaders?.[0]?.leaders || [];

            if (moreLeaders.length > 0) {
              allLeaders = [...allLeaders, ...moreLeaders];
              offset += 100;
              console.log(
                `[BATTERS] ${category}: Added ${moreLeaders.length} more, total: ${allLeaders.length}`,
              );
            } else {
              hasMore = false;
            }
          } else {
            hasMore = false;
          }
        }
      }

      // Reconstruct the data structure with all leaders
      return {
        ...data,
        leagueLeaders: [
          {
            ...data.leagueLeaders[0],
            leaders: allLeaders,
          },
        ],
      };
    });

    const results = await Promise.all(promises);

    const playersMap = new Map<string, any>();
    const categoryCounts: Record<string, number> = {};

    // Process each stat category and build player database
    results.forEach((result, index) => {
      const category = statCategories[index];

      const leaders = result.leagueLeaders?.[0]?.leaders || [];
      console.log(`[BATTERS] ${category}: ${leaders.length} leaders found`);
      // Track the total number of qualified players for this category
      categoryCounts[category] = leaders.length;

      leaders.forEach((leader: StatLeader, rankIndex: number) => {
        const playerId = leader.person.id.toString();
        const rank = rankIndex + 1;

        if (!playersMap.has(playerId)) {
          playersMap.set(playerId, {
            id: playerId,
            name: leader.person.fullName,
            team: leader.person.currentTeam?.abbreviation || "UNK",
            stats: {},
            ranks: {},
          });
        }

        const player = playersMap.get(playerId);
        player.stats[category] = parseFloat(leader.value);
        player.ranks[category] = rank;
      });
    });
    console.log("[BATTERS] Final category counts:", categoryCounts);
    console.log(`[BATTERS] Total unique players found: ${playersMap.size}`);
    return { players: playersMap, stats: results, categoryCounts };
  } catch (error) {
    console.error("Error fetching from MLB Stats API:", error);
    return null;
  }
}

async function selectRandomPlayer(
  playersMap: Map<string, any>,
  categoryCounts: Record<string, number>,
  excludedPlayerIds: Set<string>,
): Promise<PlayerStats | null> {
  const qualifiedPlayers = Array.from(playersMap.values()).filter((player) => {
    const categoryCount = Object.keys(player.stats).length;
    return categoryCount >= 1 && !excludedPlayerIds.has(player.id);
  });

  console.log(
    `Found ${qualifiedPlayers.length} qualified batters (with 3+ stats)`,
  );

  if (qualifiedPlayers.length === 0) {
    return null;
  }

  // Since we're using playerPool=QUALIFIED and statGroup=hitting, most should be batters
  // But let's still verify to be safe
  const pitcherPositions = ["Pitcher", "Starting Pitcher", "Relief Pitcher"];

  let attempts = 0;
  const maxAttempts = 10; // Reduced since API filtering should be better

  while (attempts < maxAttempts) {
    // Select a random qualified player
    const randomIndex = Math.floor(Math.random() * qualifiedPlayers.length);
    const selectedPlayer = qualifiedPlayers[randomIndex];

    console.log(
      `Selected batter candidate: ${selectedPlayer.name} (ID: ${selectedPlayer.id})`,
    );

    // Fetch detailed player information
    const playerDetails = await fetchPlayerDetails(selectedPlayer.id);

    // Check if player is a batter (not a pitcher)
    if (
      !playerDetails?.position ||
      !pitcherPositions.includes(playerDetails.position)
    ) {
      console.log(
        `Confirmed batter: ${selectedPlayer.name} (${playerDetails?.position || "Unknown"})`,
      );
      // Convert to our expected format with fallback values for missing stats
      return {
        playerId: selectedPlayer.id,
        name: selectedPlayer.name,
        position: playerDetails?.position || "Unknown",
        height: playerDetails?.height || "Unknown",
        weight: playerDetails?.weight || 0,
        birthDate: playerDetails?.birthDate || "Unknown",
        number: playerDetails?.number || "Unknown",
        team: playerDetails?.team || selectedPlayer.team || "MLB",
        battingAverage: selectedPlayer.stats.avg || 0.25,
        homeRuns: selectedPlayer.stats.homeRuns || 10,
        ops: selectedPlayer.stats.ops || 0.75,
        obp: selectedPlayer.stats.obp || 100,
        stolenBases: selectedPlayer.stats.stolenBases || 5,
        rbis: selectedPlayer.stats.rbi || 50,
        battingAverageRank: selectedPlayer.ranks.avg || categoryCounts.avg + 1,
        homeRunsRank:
          selectedPlayer.ranks.homeRuns || categoryCounts.homeRuns + 1,
        opsRank: selectedPlayer.ranks.ops || categoryCounts.ops + 1,
        obpRank: selectedPlayer.ranks.obp || categoryCounts.obp + 1,
        stolenBasesRank:
          selectedPlayer.ranks.stolenBases || categoryCounts.stolenBases + 1,
        rbisRank: selectedPlayer.ranks.rbi || categoryCounts.rbi + 1,
      };
    } else {
      console.log(
        `Skipping pitcher: ${selectedPlayer.name} (${playerDetails?.position || "unknown position"})`,
      );
    }

    attempts++;
  }

  console.log(`Failed to find a batter after ${maxAttempts} attempts`);
  return null;
}

async function fetchPlayerDetails(playerId: string): Promise<{
  team: string;
  position?: string;
  height?: string;
  weight?: number;
  birthDate?: string;
  number?: string;
} | null> {
  try {
    // Use direct fetch to get player details
    const url = `https://statsapi.mlb.com/api/v1/people/${playerId}`;

    console.log(`Fetching player details from: ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch player details: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();

    if (data.people?.[0]) {
      const player = data.people[0];
      const teamName =
        player.currentTeam?.name || player.currentTeam?.abbreviation || "MLB";
      const position =
        player.primaryPosition?.name || player.primaryPosition?.abbreviation;

      return {
        team: teamName,
        position: position,
        height: player.height || "Unknown",
        weight: player.weight || 0,
        birthDate: player.birthDate || "Unknown",
        number: player.primaryNumber || "Unknown",
      };
    }

    return null;
  } catch (error) {
    console.error(`Error fetching player details for ${playerId}:`, error);
    return null;
  }
}

async function fetchPitchingStatsFromAPI(seasonYear: number): Promise<{
  players: Map<string, any>;
  stats: any[];
  categoryCounts: Record<string, number>;
} | null> {
  try {
    const baseUrl = "https://statsapi.mlb.com/api/v1";

    // Fetch stat leaders for all pitcher categories
    const statCategories = [
      "era", // earned run average
      "whip", // walks + hits per inning pitched
      "strikeouts", // strikeouts
      "strikeoutsPer9Inn", // strikeouts per 9 innings
      "inningsPitched", // innings pitched
      "avg", // opponents batting average
    ];

    const promises = statCategories.map(async (category) => {
      // Use improved query with playerPool and sportId for better results
      const url = `${baseUrl}/stats/leaders?leaderCategories=${category}&season=${seasonYear}&statGroup=pitching&limit=100&sportId=1&playerPool=QUALIFIED`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch ${category}: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();
      let allLeaders = data.leagueLeaders?.[0]?.leaders || [];

      // Always try pagination if we got a substantial number of results (likely means more exist)
      if (allLeaders.length >= 50) {
        console.log(
          `[PITCHERS] ${category}: Got ${allLeaders.length} results, trying pagination...`,
        );
        let offset = 100;
        let hasMore = true;

        while (hasMore && offset < 500) {
          // Safety limit
          const paginatedUrl = `${baseUrl}/stats/leaders?leaderCategories=${category}&season=${seasonYear}&statGroup=pitching&limit=100&offset=${offset}&sportId=1&playerPool=QUALIFIED`;
          const paginatedResponse = await fetch(paginatedUrl);

          if (paginatedResponse.ok) {
            const paginatedData = await paginatedResponse.json();
            const moreLeaders = paginatedData.leagueLeaders?.[0]?.leaders || [];

            if (moreLeaders.length > 0) {
              allLeaders = [...allLeaders, ...moreLeaders];
              offset += 100;
              console.log(
                `[PITCHERS] ${category}: Added ${moreLeaders.length} more, total: ${allLeaders.length}`,
              );
            } else {
              hasMore = false;
            }
          } else {
            hasMore = false;
          }
        }
      }

      // Reconstruct the data structure with all leaders
      return {
        ...data,
        leagueLeaders: [
          {
            ...data.leagueLeaders[0],
            leaders: allLeaders,
          },
        ],
      };
    });

    const results = await Promise.all(promises);

    const playersMap = new Map<string, any>();
    const categoryCounts: Record<string, number> = {};

    // Process each stat category and build pitcher database
    results.forEach((result, index) => {
      const category = statCategories[index];
      const leaders = result.leagueLeaders?.[0]?.leaders || [];
      console.log(`[PITCHERS] ${category}: ${leaders.length} leaders found`);
      // Track the total number of qualified pitchers for this category
      categoryCounts[category] = leaders.length;

      leaders.forEach((leader: StatLeader, rankIndex: number) => {
        const playerId = leader.person.id.toString();
        const rank = rankIndex + 1;

        if (!playersMap.has(playerId)) {
          playersMap.set(playerId, {
            id: playerId,
            name: leader.person.fullName,
            team: leader.person.currentTeam?.abbreviation || "UNK",
            stats: {},
            ranks: {},
          });
        }

        const player = playersMap.get(playerId);
        player.stats[category] = parseFloat(leader.value);
        player.ranks[category] = rank;
      });
    });

    console.log("[PITCHERS] Final category counts:", categoryCounts);
    console.log(`[PITCHERS] Total unique pitchers found: ${playersMap.size}`);
    return { players: playersMap, stats: results, categoryCounts };
  } catch (error) {
    console.error("Error fetching pitcher stats from MLB Stats API:", error);
    return null;
  }
}

async function selectRandomPitcher(
  playersMap: Map<string, any>,
  categoryCounts: Record<string, number>,
  excludedPlayerIds: Set<string>,
): Promise<PitcherStats | null> {
  const qualifiedPlayers = Array.from(playersMap.values()).filter((player) => {
    const categoryCount = Object.keys(player.stats).length;
    return categoryCount >= 3 && !excludedPlayerIds.has(player.id); // Require at least 3 stats for better quality
  });

  console.log(
    `Found ${qualifiedPlayers.length} qualified pitchers (with 3+ stats)`,
  );

  if (qualifiedPlayers.length === 0) {
    return null;
  }

  // Since we're using playerPool=QUALIFIED and statGroup=pitching, most should be pitchers
  // But let's still verify to be safe
  const pitcherPositions = ["Pitcher", "Starting Pitcher", "Relief Pitcher"];

  let attempts = 0;
  const maxAttempts = 10; // Reduced since API filtering should be better

  while (attempts < maxAttempts) {
    // Select a random qualified pitcher
    const randomIndex = Math.floor(Math.random() * qualifiedPlayers.length);
    const selectedPlayer = qualifiedPlayers[randomIndex];

    console.log(
      `Selected pitcher candidate: ${selectedPlayer.name} (ID: ${selectedPlayer.id})`,
    );

    // Fetch detailed player information
    const playerDetails = await fetchPlayerDetails(selectedPlayer.id);

    // Check if player is a pitcher (or unknown position for pitching stats)
    if (
      !playerDetails?.position ||
      pitcherPositions.includes(playerDetails.position)
    ) {
      console.log(
        `Confirmed pitcher: ${selectedPlayer.name} (${playerDetails?.position || "Pitcher"})`,
      );

      // Convert to our expected format with fallback values for missing stats
      return {
        playerId: selectedPlayer.id,
        name: selectedPlayer.name,
        position: playerDetails?.position || "Pitcher",
        height: playerDetails?.height || "Unknown",
        weight: playerDetails?.weight || 0,
        birthDate: playerDetails?.birthDate || "Unknown",
        number: playerDetails?.number || "Unknown",
        team: playerDetails?.team || selectedPlayer.team || "MLB",
        era: selectedPlayer.stats.era || 4.5,
        whip: selectedPlayer.stats.whip || 1.3,
        strikeouts: selectedPlayer.stats.strikeouts || 100,
        strikeoutsPer9: selectedPlayer.stats.strikeoutsPer9Inn || 8.0,
        inningsPitched: selectedPlayer.stats.inningsPitched || 100.0,
        avg: selectedPlayer.stats.avg || 0.25, // opponents batting average
        eraRank: selectedPlayer.ranks.era || categoryCounts.era + 1,
        whipRank: selectedPlayer.ranks.whip || categoryCounts.whip + 1,
        strikeoutsRank:
          selectedPlayer.ranks.strikeouts || categoryCounts.strikeouts + 1,
        strikeoutsPer9Rank:
          selectedPlayer.ranks.strikeoutsPer9Inn ||
          categoryCounts.strikeoutsPer9Inn + 1,
        inningsPitchedRank:
          selectedPlayer.ranks.inningsPitched ||
          categoryCounts.inningsPitched + 1,
        avgRank: selectedPlayer.ranks.avg || categoryCounts.avg + 1,
      };
    } else {
      console.log(
        `Skipping non-pitcher: ${selectedPlayer.name} (${playerDetails?.position || "unknown position"})`,
      );
    }

    attempts++;
  }

  console.log(`Failed to find a pitcher after ${maxAttempts} attempts`);
  return null;
}

export const getRandomPlayer = action({
  args: {
    excludedPlayerIds: v.optional(v.array(v.string())),
    seasonYear: v.optional(v.number()),
  },
  handler: async (_, args) => {
    try {
      // Try to fetch real data from MLB Stats API
      const apiData = await fetchStatsFromAPI(
        args.seasonYear ?? new Date().getFullYear(),
      );
      if (apiData && apiData.players.size > 0) {
        const player = await selectRandomPlayer(
          apiData.players,
          apiData.categoryCounts,
          new Set(args.excludedPlayerIds ?? []),
        );
        if (player) {
          console.log(`Selected player: ${player.name} (${player.team})`);
          return { success: true, player };
        }
      }

      // Fallback to example player if API fails or no qualified players
      console.log("Falling back to example player");
      return [];
    } catch (error: any) {
      console.error("MLB API error:", error);
      // Return random example player as fallback
      return [];
    }
  },
});

export const getRandomPitcher = action({
  args: {
    excludedPlayerIds: v.optional(v.array(v.string())),
    seasonYear: v.optional(v.number()),
  },
  handler: async (_, args) => {
    try {
      // Try to fetch real data from MLB Stats API
      const apiData = await fetchPitchingStatsFromAPI(
        args.seasonYear ?? new Date().getFullYear(),
      );
      if (apiData && apiData.players.size > 0) {
        const pitcher = await selectRandomPitcher(
          apiData.players,
          apiData.categoryCounts,
          new Set(args.excludedPlayerIds ?? []),
        );
        if (pitcher) {
          console.log(`Selected pitcher: ${pitcher.name} (${pitcher.team})`);
          return { success: true, player: pitcher };
        }
      }

      // Fallback to example pitcher if API fails or no qualified players
      console.log("Falling back to example pitcher");
      return [];
    } catch (error: any) {
      console.error("MLB Pitching API error:", error);
      // Return random example pitcher as fallback
      return [];
    }
  },
});
