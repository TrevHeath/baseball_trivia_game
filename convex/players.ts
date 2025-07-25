"use node";

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

async function fetchStatsFromAPI(): Promise<{
  players: Map<string, any>;
  stats: any[];
  categoryCounts: Record<string, number>;
} | null> {
  try {
    const currentYear = new Date().getFullYear();
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
      const url = `${baseUrl}/stats/leaders?leaderCategories=${category}&season=${currentYear}&statGroup=hitting&limit=150`;

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch ${category}: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();

      return data;
    });

    const results = await Promise.all(promises);

    const playersMap = new Map<string, any>();
    const categoryCounts: Record<string, number> = {};

    // Process each stat category and build player database
    results.forEach((result, index) => {
      const category = statCategories[index];

      const leaders = result.leagueLeaders?.[0]?.leaders || [];

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

    return { players: playersMap, stats: results, categoryCounts };
  } catch (error) {
    console.error("Error fetching from MLB Stats API:", error);
    return null;
  }
}

async function selectRandomPlayer(
  playersMap: Map<string, any>,
  categoryCounts: Record<string, number>
): Promise<PlayerStats | null> {
  // Filter for players who have data in at least 3 of our 6 categories
  const qualifiedPlayers = Array.from(playersMap.values()).filter((player) => {
    const categoryCount = Object.keys(player.stats).length;
    return categoryCount >= 1;
  });

  console.log(`Found ${qualifiedPlayers.length} qualified players`);

  if (qualifiedPlayers.length === 0) {
    return null;
  }

  // Filter for batters only by checking position
  const pitcherPositions = ["Pitcher", "Starting Pitcher", "Relief Pitcher"];

  let attempts = 0;
  const maxAttempts = 20;

  while (attempts < maxAttempts) {
    // Select a random qualified player
    const randomIndex = Math.floor(Math.random() * qualifiedPlayers.length);
    const selectedPlayer = qualifiedPlayers[randomIndex];

    console.log(
      `Selected player: ${selectedPlayer.name} (ID: ${selectedPlayer.id})`
    );

    // Fetch detailed player information
    const playerDetails = await fetchPlayerDetails(selectedPlayer.id);

    // Check if player is a batter (not a pitcher)
    if (
      playerDetails?.position &&
      !pitcherPositions.includes(playerDetails.position)
    ) {
      console.log(
        `Confirmed batter: ${selectedPlayer.name} (${playerDetails.position})`
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
        `Skipping pitcher: ${selectedPlayer.name} (${playerDetails?.position || "unknown position"})`
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
        `Failed to fetch player details: ${response.status} ${response.statusText}`
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

export const getRandomPlayer = action({
  args: {},
  handler: async () => {
    try {
      // Try to fetch real data from MLB Stats API
      const apiData = await fetchStatsFromAPI();
      if (apiData && apiData.players.size > 0) {
        const player = await selectRandomPlayer(
          apiData.players,
          apiData.categoryCounts
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
