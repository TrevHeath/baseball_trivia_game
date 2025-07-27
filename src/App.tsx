import { useQuery, useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { useState, useEffect } from "react";
import { Toaster, toast } from "sonner";

const BATTER_CATEGORIES = [
  {
    id: "batting-average",
    name: "Batting Average",
    description: "Highest batting average",
  },
  { id: "home-runs", name: "Home Runs", description: "Most home runs" },
  { id: "ops", name: "OPS", description: "Highest On-base plus slugging" },
  { id: "obp", name: "OBP", description: "Highest On-base percentage" },
  {
    id: "stolen-bases",
    name: "Stolen Bases",
    description: "Most stolen bases",
  },
  { id: "rbis", name: "RBIs", description: "Most Runs Batted In" },
];

const PITCHER_CATEGORIES = [
  { id: "era", name: "ERA", description: "Lowest Earned Run Average" },
  {
    id: "whip",
    name: "WHIP",
    description: "Walks and Hits per Inning Pitched",
  },
  { id: "strikeouts", name: "Strikeouts", description: "Most strikeouts" },
  {
    id: "strikeouts-per-9",
    name: "K/9",
    description: "Strikeouts per 9 innings pitched",
  },
  {
    id: "innings-pitched",
    name: "Innings Pitched",
    description: "Most innings pitched",
  },
  {
    id: "avg",
    name: "Opp AVG",
    description: "Lowest opponents batting average",
  },
];

export default function App() {
  const [sessionId] = useState(() => {
    // Check if sessionId exists in localStorage
    const existingSessionId = localStorage.getItem(
      "baseball-trivia-session-id"
    );
    if (existingSessionId) {
      return existingSessionId;
    }

    // Create new sessionId and store it
    const newSessionId = `session-${Date.now()}-${Math.random()}`;
    localStorage.setItem("baseball-trivia-session-id", newSessionId);
    return newSessionId;
  });
  const [showResult, setShowResult] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [showGameEndModal, setShowGameEndModal] = useState(false);
  const [lastShownGameId, setLastShownGameId] = useState<string | null>(() => {
    return localStorage.getItem("last-shown-game-id");
  });
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [gameMode, setGameMode] = useState<"batters" | "pitchers">("batters");

  // Get current categories based on game mode
  const CATEGORIES = getCategoriesByGameMode(gameMode);

  const currentGame = useQuery(api.game.getCurrentGame, { sessionId });

  useEffect(() => {
    if (currentGame?.game?.gameMode && !currentGame.game.isComplete)
      setGameMode(currentGame?.game?.gameMode as "batters" | "pitchers"); // Default to "batters" if not set
  }, [currentGame]);

  const gameHistory = useQuery(api.game.getGameHistory, { sessionId });
  const allGameHistory = useQuery(api.game.getAllGameHistory, {
    sessionId,
    gameMode: gameHistory?.game?.gameMode,
  });
  const usedCategories = useQuery(api.game.getUsedCategories, { sessionId });
  // Get high scores for the specific game mode of the completed game
  const completedGameMode = gameHistory?.game?.gameMode || "batters";
  const highScores = useQuery(api.game.getHighScores, {
    gameMode: completedGameMode,
  });
  const startNewGame = useAction(api.game.startNewGame);
  const selectCategory = useAction(api.game.selectCategory);

  // Calculate best score from all games
  const bestScore =
    allGameHistory && allGameHistory.length > 0
      ? Math.min(...allGameHistory.map((game: any) => game.totalScore))
      : null;

  // Check for game completion and show modal
  useEffect(() => {
    if (
      gameHistory?.game?.isComplete &&
      gameHistory.game.totalScore !== undefined &&
      gameHistory.game._id !== lastShownGameId
    ) {
      // Show modal after a short delay
      setTimeout(() => {
        setShowGameEndModal(true);
        setLastShownGameId(gameHistory.game._id);
        localStorage.setItem("last-shown-game-id", gameHistory.game._id);
      }, 100);
    }
  }, [
    gameHistory?.game?.isComplete,
    gameHistory?.game?.totalScore,
    gameHistory?.game?._id,
    lastShownGameId,
  ]);

  const handleStartGame = () => {
    setShowResult(false);
    setLastResult(null);
    setShowGameEndModal(false);
    void startNewGame({ sessionId, gameMode });
  };

  const handleCategorySelect = async (categoryId: string) => {
    if (!currentGame?.game || showResult) return;

    try {
      const result = await selectCategory({ sessionId, category: categoryId });
      setLastResult(result);
      setShowResult(true);

      // Show toast feedback based on performance
      if (currentGame.player) {
        const currentGameMode = currentGame.game?.gameMode || "batters";
        const bestCategory = findBestCategory(
          currentGame.player,
          currentGameMode
        );
        const actualRank = result.actualRank;

        const selectedCategoryName =
          CATEGORIES.find((c) => c.id === categoryId)?.name || categoryId;

        if (actualRank === 1) {
          toast.success(`🏆 Perfect! They are #1 in ${selectedCategoryName}!`, {
            duration: 3000,
          });
        } else if (actualRank <= 10) {
          toast.success(
            `🎯 Great choice! #${actualRank} in ${selectedCategoryName}`,
            {
              duration: 3000,
            }
          );
        } else if (categoryId === bestCategory.category) {
          toast.success(
            `👏 You found their best category! #${actualRank} in ${selectedCategoryName}`,
            {
              duration: 3000,
            }
          );
        } else {
          toast.info(
            `Their best stat was ${bestCategory.name} (#${bestCategory.rank}). You chose ${selectedCategoryName} (#${actualRank})`,
            {
              duration: 4000,
            }
          );
        }
      }

      // Auto-advance after showing result
      setTimeout(() => {
        setShowResult(false);
        // Keep lastResult so the badge persists between rounds
        // Force a reactive update by invalidating the query
        // The new player should already be in the database from the selectCategory action
      }, 100);
    } catch (error) {
      console.error("Error selecting category:", error);
    }
  };

  const getScoreColor = (score: number) => {
    if (score <= 100) return "text-green-600";
    if (score <= 200) return "text-yellow-600";
    if (score <= 300) return "text-orange-600";
    return "text-red-600";
  };

  const getScoreDescription = (score: number) => {
    if (score <= 100) return "Hall of fame!";
    if (score <= 200) return "All-star!";
    if (score <= 300) return "Ball player";
    return "Prospect";
  };

  const findBestCategory = (player: any, playerGameMode?: string) => {
    // Determine if this is a pitcher or batter based on the player's stats or game mode
    const isPitcher =
      playerGameMode === "pitchers" ||
      (player.eraRank !== undefined && player.whipRank !== undefined);

    let categoryRanks: Record<string, number>;
    let defaultCategory: string;
    let categories: typeof BATTER_CATEGORIES;

    if (isPitcher) {
      categoryRanks = {
        era: player.eraRank,
        whip: player.whipRank,
        strikeouts: player.strikeoutsRank,
        "strikeouts-per-9": player.strikeoutsPer9Rank,
        "innings-pitched": player.inningsPitchedRank,
        avg: player.avgRank,
      };
      defaultCategory = "era";
      categories = PITCHER_CATEGORIES;
    } else {
      categoryRanks = {
        "batting-average": player.battingAverageRank,
        "home-runs": player.homeRunsRank,
        ops: player.opsRank,
        obp: player.obpRank,
        "stolen-bases": player.stolenBasesRank,
        rbis: player.rbisRank,
      };
      defaultCategory = "batting-average";
      categories = BATTER_CATEGORIES;
    }

    let bestCategory = defaultCategory;
    let bestRank = categoryRanks[defaultCategory];

    for (const [category, rank] of Object.entries(categoryRanks)) {
      if (rank && rank < bestRank) {
        bestRank = rank;
        bestCategory = category;
      }
    }

    return {
      category: bestCategory,
      rank: bestRank,
      name: categories.find((c) => c.id === bestCategory)?.name || bestCategory,
    };
  };

  // Get used categories is now handled by the query

  if (currentGame === undefined) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-100 via-blue-100 to-purple-100 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-emerald-200 border-t-emerald-600 mx-auto mb-4 shadow-lg"></div>
          <p className="text-gray-700 text-lg font-medium animate-pulse">
            Loading your baseball adventure...
          </p>
        </div>
        <Toaster
          position="top-right"
          richColors
          closeButton
          theme="light"
          toastOptions={{
            style: {
              fontSize: "16px",
              padding: "16px 20px",
              minHeight: "64px",
            },
          }}
        />
      </div>
    );
  }

  // usedCategories is now from the query above

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-100 via-blue-100 to-purple-100 p-4">
      {/* nav */}
      <button
        onClick={() => setShowRulesModal(true)}
        className=" bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-bold py-2 px-4 rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105 text-sm fixed bottom-4 right-4 z-50"
      >
        📖 Rules
      </button>
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="relative text-center my-8 animate-fade-in">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-600 via-blue-600 to-purple-600 bg-clip-text text-transparent mb-2 animate-bounce-subtle">
            Basebally Challenge
          </h1>
          <p className="text-gray-700 text-lg font-medium">
            How well do you know the game?
          </p>
        </div>

        {/* Game not started */}
        {!currentGame?.game && (
          <div className="text-center animate-slide-up">
            {/* Game Mode Selector */}
            <div className="bg-white rounded-xl shadow-xl p-6 mb-6 border-2 border-blue-200">
              <h2 className="text-2xl font-bold text-blue-600 mb-4">
                Choose Your Game Mode
              </h2>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => setGameMode("batters")}
                  className={`py-3 px-6 rounded-lg font-bold transition-all duration-300 ${
                    gameMode === "batters"
                      ? "bg-gradient-to-r from-emerald-500 to-blue-600 text-white shadow-lg scale-105"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  🏏 Batters
                </button>
                <button
                  onClick={() => setGameMode("pitchers")}
                  className={`py-3 px-6 rounded-lg font-bold transition-all duration-300 ${
                    gameMode === "pitchers"
                      ? "bg-gradient-to-r from-emerald-500 to-blue-600 text-white shadow-lg scale-105"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  ⚾ Pitchers
                </button>
              </div>
              <div className="flex justify-center mt-6">
                <button
                  onClick={handleStartGame}
                  className="bg-gradient-to-r from-emerald-500 to-blue-600 hover:from-emerald-600 hover:to-blue-700 text-white font-bold py-4 px-10 rounded-xl transition-all duration-300 shadow-xl hover:shadow-2xl transform hover:scale-105 animate-pulse-slow"
                >
                  🚀 Start New Game
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full animate-slide-up">
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-t-2xl">
                <div className="flex justify-between items-center">
                  <h2 className="text-3xl font-bold">📖 How to Play</h2>
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-6">
                <div className="text-left space-y-4 text-gray-700">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                    <h3 className="font-bold text-emerald-600 mb-2">
                      🎯 Objective
                    </h3>
                    <p>
                      You'll see 6 random MLB players, one at a time. For each
                      player, choose the category where you think they rank{" "}
                      <strong>highest</strong> (closest to #1).
                    </p>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-bold text-blue-600 mb-2">
                      🎮 Game Rules
                    </h3>
                    <ul className="space-y-2">
                      <li>
                        • Each category can only be selected once per game
                      </li>
                      <li>
                        • Your score is the sum of their actual ranks in your
                        chosen categories
                      </li>
                      <li>
                        • Lower scores are better - a perfect game scores just 6
                        points!
                      </li>
                      <li>• Using MLB stats from the current season!</li>
                      <li>
                        • Players not qualified for a category will be ranked
                        last in that category.
                      </li>
                    </ul>
                  </div>

                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <h3 className="font-bold text-purple-600 mb-4">
                      📊 Categories (
                      {gameMode === "pitchers" ? "Pitchers" : "Batters"})
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {CATEGORIES.map((category) => (
                        <div className="flex flex-col" key={category.id}>
                          <strong>{category.name}</strong>
                          {category.description}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h3 className="font-bold text-yellow-600 mb-2">
                      🏆 Scoring
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        •{" "}
                        <span className="text-green-600 font-bold">
                          1-100 points:
                        </span>{" "}
                        Hall of fame!
                      </div>
                      <div>
                        •{" "}
                        <span className="text-yellow-600 font-bold">
                          100-200 points:
                        </span>{" "}
                        All star!
                      </div>
                      <div>
                        •{" "}
                        <span className="text-orange-600 font-bold">
                          200-300 points:
                        </span>{" "}
                        Ball Player
                      </div>
                      <div>
                        •{" "}
                        <span className="text-red-600 font-bold">
                          300+ points:
                        </span>{" "}
                        Prospect
                      </div>
                    </div>
                  </div>
                </div>

                {/* Close Button */}
              </div>
            </div>
          </div>
        )}
        {currentGame?.game &&
          !currentGame.game.isComplete &&
          !currentGame.player && (
            <div className="text-center animate-fade-in">
              <div className="bg-white rounded-xl shadow-xl p-8 mb-6 border-2 border-blue-200">
                <h2 className="text-3xl font-bold text-blue-600 mb-4">
                  Batter steps to the plate...
                </h2>
                <p className="text-gray-700">
                  Please wait while we fetch your player...
                </p>
              </div>
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 border-t-blue-600 mx-auto mb-4 shadow-lg"></div>
            </div>
          )}
        {/* Active game */}
        {currentGame?.game &&
          !currentGame.game.isComplete &&
          currentGame.player && (
            <div className="space-y-6">
              {/* Progress and Score */}
              <div className="bg-white rounded-xl shadow-xl p-6 border-2 border-blue-200 animate-slide-in">
                <div className="flex justify-between items-center mb-4">
                  <div className="flex flex-1 flex-wrap justify-end items-center gap-3 w-full">
                    <div className="flex-1 text-md font-bold text-blue-600 bg-gradient-to-r from-blue-50 to-purple-50 px-4 py-2 rounded-full border-2 border-blue-200">
                      Score:{" "}
                      <span className="text-purple-600">
                        {currentGame.game.totalScore}
                      </span>
                    </div>
                    {lastResult && (
                      <div className="flex-1 text-md font-bold text-emerald-600 bg-gradient-to-r from-emerald-50 to-purple-50 px-4 py-2 rounded-full border-2 border-emerald-200">
                        Last: #{lastResult.actualRank}
                      </div>
                    )}
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4 shadow-inner">
                  <div
                    className="bg-gradient-to-r from-emerald-500 to-blue-600 h-4 rounded-full transition-all duration-700 ease-out shadow-lg text-white text-center text-xs"
                    style={{
                      width: `${(currentGame.game.currentRound / 6) * 100}%`,
                    }}
                  >
                    Round {currentGame.game.currentRound} of 6
                  </div>
                </div>
              </div>

              {/* Player Card */}
              <div
                key={`${currentGame.player.playerId}-${currentGame.game.currentRound}`}
                className="bg-gradient-to-br from-emerald-50 via-blue-50 to-purple-50 rounded-2xl shadow-2xl p-8 border-4 border-gradient-to-r from-emerald-200 to-purple-200 transform hover:scale-105 transition-all duration-500 animate-slide-up"
              >
                {/* Baseball Card Header */}

                <div className="flex items-center justify-between mb-4">
                  <div className="text-left">
                    <h2 className="text-4xl font-bold bg-gradient-to-r from-emerald-600 to-blue-600 bg-clip-text text-transparent mb-1 animate-fade-in">
                      {currentGame.player.name}
                    </h2>
                    <div className="flex-column items-center gap-4 text-lg">
                      <div className="flex items-center gap-4 text-lg">
                        {/* <span className="bg-blue-600 text-white px-3 py-1 rounded-full font-semibold">
                          {currentGame.player.team}
                        </span> */}
                        {currentGame.player.position && (
                          <span className="text-gray-600">
                            {currentGame.player.position}
                          </span>
                        )}
                        <span className="text-gray-600">
                          #{currentGame.player.number || "Unknown"}
                        </span>
                      </div>
                      {/* <div className="flex items-center gap-1 text-lg flex-wrap">
                          {currentGame.player.height && (
                            <span className="text-gray-600">
                              {currentGame.player.height}
                            </span>
                          )}
                          {currentGame.player.weight && (
                            <span className="text-gray-600">
                              {currentGame.player.weight}
                            </span>
                          )}
                          {currentGame.player.birthDate && (
                            <span className="text-gray-600">
                              {currentGame.player.birthDate}
                            </span>
                          )}
                        </div> */}
                    </div>
                  </div>
                  <div className="text-8xl animate-bounce-slow">⚾</div>
                </div>
              </div>

              {/* Result Display */}
              {showResult && lastResult && (
                <div className="bg-white rounded-lg shadow-lg p-6 text-center border-l-4 border-blue-500">
                  <h3 className="text-xl font-semibold mb-2">Result</h3>
                  <p className="text-lg mb-2">
                    Actual rank:{" "}
                    <span className="font-bold text-blue-600">
                      #{lastResult.actualRank}
                    </span>
                  </p>
                  <p className="text-gray-600">
                    {lastResult.isGameComplete
                      ? "Game complete!"
                      : "Next player coming up..."}
                  </p>
                </div>
              )}

              {/* Category Selection */}
              {!showResult && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-stagger-in">
                  {CATEGORIES.map((category, index) => {
                    const isUsed =
                      usedCategories?.includes(category.id) || false;
                    return (
                      <button
                        key={category.id}
                        onClick={() => {
                          if (!isUsed) {
                            void handleCategorySelect(category.id);
                          }
                        }}
                        disabled={isUsed}
                        className={`border-3 rounded-xl p-6 text-left transition-all duration-300 shadow-lg transform hover:scale-105 animate-delay-${index} ${
                          isUsed
                            ? "bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed opacity-60"
                            : "bg-gradient-to-br from-white to-blue-50 hover:from-emerald-50 hover:to-purple-50 border-blue-200 hover:border-emerald-400 hover:shadow-xl"
                        }`}
                        style={{
                          animationDelay: `${index * 0.1}s`,
                        }}
                      >
                        <h4
                          className={`font-bold text-xl mb-3 ${isUsed ? "text-gray-400" : "text-emerald-600"}`}
                        >
                          {category.name}
                        </h4>
                        <p
                          className={`text-sm ${isUsed ? "text-gray-400" : "text-gray-700"}`}
                        >
                          {category.description}
                        </p>
                        {isUsed && (
                          <p className="text-xs mt-3 font-bold text-red-500 bg-red-50 px-2 py-1 rounded-full">
                            ✓ Already selected
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

        {/* Game Complete - Simple display when modal is not shown */}
        {currentGame.game?.isComplete && gameHistory && !showGameEndModal && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-lg p-8 text-center">
              <h2 className="text-3xl font-bold mb-4">Final score!</h2>
              <div className="text-6xl font-bold mb-4">
                <span className={getScoreColor(gameHistory.game.totalScore)}>
                  {gameHistory.game.totalScore}
                </span>
              </div>
              <p className="text-xl mb-2">
                {getScoreDescription(gameHistory.game.totalScore)}
              </p>
              <p className="text-gray-600 mb-6">
                Perfect score is 6 • Lower is better
              </p>

              {/* Game Mode Selector for Next Game */}
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6 max-w-md mx-auto">
                <h3 className="font-semibold text-gray-800 mb-3 text-center">
                  Next Game Mode
                </h3>
                <div className="flex gap-3 justify-center">
                  <button
                    onClick={() => setGameMode("batters")}
                    className={`py-2 px-4 rounded-lg font-bold transition-all duration-300 text-sm ${
                      gameMode === "batters"
                        ? "bg-gradient-to-r from-emerald-500 to-blue-600 text-white shadow-lg scale-105"
                        : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
                    }`}
                  >
                    🏏 Batters
                  </button>
                  <button
                    onClick={() => setGameMode("pitchers")}
                    className={`py-2 px-4 rounded-lg font-bold transition-all duration-300 text-sm ${
                      gameMode === "pitchers"
                        ? "bg-gradient-to-r from-emerald-500 to-blue-600 text-white shadow-lg scale-105"
                        : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
                    }`}
                  >
                    ⚾ Pitchers
                  </button>
                </div>
              </div>

              <button
                onClick={handleStartGame}
                className="bg-gradient-to-r from-emerald-500 to-blue-600 hover:from-emerald-600 hover:to-blue-700 text-white font-bold py-4 px-10 rounded-xl transition-all duration-300 shadow-xl hover:shadow-2xl transform hover:scale-105"
              >
                🎮 Play Again (
                {gameMode === "pitchers" ? "Pitchers" : "Batters"})
              </button>
            </div>
          </div>
        )}

        {/* Game End Modal */}
        {showGameEndModal && gameHistory && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto relative">
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-blue-600 to-green-600 text-white p-6 rounded-t-2xl">
                <h2 className="text-3xl font-bold text-center mb-2">
                  🎉 Final score!
                </h2>
                <div className="text-center">
                  <div className="text-5xl font-bold mb-2">
                    {gameHistory.game.totalScore}
                  </div>
                  <p className="text-xl opacity-90">
                    {getScoreDescription(gameHistory.game.totalScore)}
                  </p>
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-6">
                {/* High Score Section */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center justify-between">
                    <div className="flex gap-2">
                      <h3 className="font-semibold text-yellow-800">
                        🏆 Your Best Score
                      </h3>
                      <p className="text-yellow-700">
                        {bestScore !== null ? `${bestScore}` : "First game!"}
                      </p>
                    </div>
                    {gameHistory.game.totalScore < (bestScore || Infinity) && (
                      <div className="text-yellow-600 font-bold">
                        🆕 NEW RECORD!
                      </div>
                    )}
                  </div>
                </div>

                {/* Global High Scores Section */}
                {highScores && (
                  <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-4 mb-6">
                    <h3 className="font-semibold text-purple-800 mb-3">
                      🌟 Global High Scores (
                      {completedGameMode === "pitchers"
                        ? "Pitchers"
                        : "Batters"}
                      )
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-white rounded-lg p-3 border border-purple-100">
                        <div className="text-center">
                          <div className="text-sm text-purple-600 font-medium">
                            Today's Best
                          </div>
                          <div className="text-2xl font-bold text-purple-800">
                            {highScores.todayBestScore !== null
                              ? highScores.todayBestScore
                              : "—"}
                          </div>
                          <div className="text-xs text-purple-500">
                            {highScores.todayGamesCount} game
                            {highScores.todayGamesCount !== 1 ? "s" : ""} played
                          </div>
                        </div>
                      </div>
                      <div className="bg-white rounded-lg p-3 border border-purple-100">
                        <div className="text-center">
                          <div className="text-sm text-purple-600 font-medium">
                            Week's Best
                          </div>
                          <div className="text-2xl font-bold text-purple-800">
                            {highScores.weekBestScore !== null
                              ? highScores.weekBestScore
                              : "—"}
                          </div>
                          <div className="text-xs text-purple-500">
                            {highScores.weekGamesCount} game
                            {highScores.weekGamesCount !== 1 ? "s" : ""} played
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Achievement badges */}
                    <div className="mt-3 flex flex-wrap gap-2 justify-center">
                      {gameHistory.game.totalScore ===
                        highScores.todayBestScore &&
                        highScores.todayBestScore !== null && (
                          <div className="bg-gradient-to-r from-yellow-400 to-orange-500 text-white px-3 py-1 rounded-full text-xs font-bold animate-pulse">
                            🥇 TODAY'S CHAMPION!
                          </div>
                        )}
                      {gameHistory.game.totalScore ===
                        highScores.weekBestScore &&
                        highScores.weekBestScore !== null && (
                          <div className="bg-gradient-to-r from-purple-500 to-pink-600 text-white px-3 py-1 rounded-full text-xs font-bold animate-pulse">
                            👑 WEEKLY CHAMPION!
                          </div>
                        )}
                    </div>
                  </div>
                )}
                {/* Stats Summary */}
                <div className="bg-blue-50 rounded-lg p-4 mb-6">
                  <h3 className="font-semibold text-blue-800 mb-2">
                    Game Stats
                  </h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-blue-600">Perfect Picks:</span>
                      <span className="font-semibold ml-2">
                        {gameHistory.rounds.filter((r) => r.score === 1).length}
                      </span>
                    </div>
                    <div>
                      <span className="text-blue-600">Top 10 Picks:</span>
                      <span className="font-semibold ml-2">
                        {
                          gameHistory.rounds.filter(
                            (r) => r.score && r.score <= 10
                          ).length
                        }
                      </span>
                    </div>
                    <div>
                      <span className="text-blue-600">Average:</span>
                      <span className="font-semibold ml-2">
                        #{Math.round(gameHistory.game.totalScore / 6)}
                      </span>
                    </div>
                    <div>
                      <span className="text-blue-600">Total Score:</span>
                      <span className="font-semibold ml-2">
                        {gameHistory.game.totalScore}
                      </span>
                    </div>
                  </div>
                </div>
                {/* Game Mode Selector for Next Game */}
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
                  <h3 className="font-semibold text-gray-800 mb-3 text-center">
                    Next Game Mode
                  </h3>
                  <div className="flex gap-3 justify-center">
                    <button
                      onClick={() => setGameMode("batters")}
                      className={`py-2 px-4 rounded-lg font-bold transition-all duration-300 text-sm ${
                        gameMode === "batters"
                          ? "bg-gradient-to-r from-emerald-500 to-blue-600 text-white shadow-lg scale-105"
                          : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
                      }`}
                    >
                      🏏 Batters
                    </button>
                    <button
                      onClick={() => setGameMode("pitchers")}
                      className={`py-2 px-4 rounded-lg font-bold transition-all duration-300 text-sm ${
                        gameMode === "pitchers"
                          ? "bg-gradient-to-r from-emerald-500 to-blue-600 text-white shadow-lg scale-105"
                          : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
                      }`}
                    >
                      ⚾ Pitchers
                    </button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3  bottom-4 left-0 right-0">
                  <button
                    onClick={handleStartGame}
                    className="flex-1 bg-gradient-to-r from-emerald-500 to-blue-600 hover:from-emerald-600 hover:to-blue-700 text-white font-bold py-4 px-8 my-5 rounded-xl transition-all duration-300 shadow-xl hover:shadow-2xl transform hover:scale-105"
                  >
                    🎮 Play Again (
                    {gameMode === "pitchers" ? "Pitchers" : "Batters"})
                  </button>
                </div>
                {/* Round Summary */}
                <div className="mb-6">
                  <h3 className="text-xl font-semibold mb-4">Round by Round</h3>
                  <div className="space-y-3">
                    {gameHistory.rounds.map((round, index) => (
                      <div
                        key={round._id}
                        className="flex justify-between items-center p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-semibold text-sm">
                            {index + 1}
                          </div>
                          <div>
                            <span className="font-medium">
                              {round.playerName}
                            </span>
                            {round.selectedCategory && (
                              <div className="text-sm text-gray-600">
                                {
                                  getCategoriesByGameMode(
                                    gameHistory.game.gameMode
                                  ).find((c) => c.id === round.selectedCategory)
                                    ?.name
                                }
                              </div>
                            )}
                          </div>
                        </div>
                        <div
                          className={`font-bold text-lg ${round.score && round.score <= 10 ? "text-green-600" : round.score && round.score <= 25 ? "text-yellow-600" : "text-red-600"}`}
                        >
                          {round.score ? `#${round.score}` : "-"}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Buy Me a Beer Button in Modal */}
                <div className="text-center mt-4 pt-4 border-t border-gray-200">
                  <a
                    href="https://buymeacoffee.com/trevheath7w"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-4 rounded-full shadow-lg transition-colors text-sm"
                  >
                    🍺 Buy me a beer
                  </a>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Rules Modal */}
        {showRulesModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto relative animate-slide-up">
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-6 rounded-t-2xl">
                <div className="flex justify-between items-center">
                  <h2 className="text-3xl font-bold">📖 How to Play</h2>
                  <button
                    onClick={() => setShowRulesModal(false)}
                    className="text-white hover:text-gray-200 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-white hover:bg-opacity-20 transition-all"
                  >
                    ×
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="p-6">
                <div className="text-left space-y-4 text-gray-700">
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                    <h3 className="font-bold text-emerald-600 mb-2">
                      🎯 Objective
                    </h3>
                    <p>
                      You'll see 6 random MLB players, one at a time. For each
                      player, choose the category where you think they rank{" "}
                      <strong>highest</strong> (closest to #1).
                    </p>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-bold text-blue-600 mb-2">
                      🎮 Game Rules
                    </h3>
                    <ul className="space-y-2">
                      <li>
                        • Each category can only be selected once per game
                      </li>
                      <li>
                        • Your score is the sum of their actual ranks in your
                        chosen categories
                      </li>
                      <li>
                        • Lower scores are better - a perfect game scores just 6
                        points!
                      </li>
                      <li>• Using MLB stats from the current season!</li>
                      <li>
                        • Players not qualified for a category will be ranked
                        last in that category.
                      </li>
                    </ul>
                  </div>

                  <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                    <h3 className="font-bold text-purple-600 mb-4">
                      📊 Categories (
                      {gameMode === "pitchers" ? "Pitchers" : "Batters"})
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {CATEGORIES.map((category) => (
                        <div className="flex flex-col" key={category.id}>
                          <strong>{category.name}</strong>
                          {category.description}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <h3 className="font-bold text-yellow-600 mb-2">
                      🏆 Scoring
                    </h3>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        •{" "}
                        <span className="text-green-600 font-bold">
                          1-100 points:
                        </span>{" "}
                        Hall of fame!
                      </div>
                      <div>
                        •{" "}
                        <span className="text-yellow-600 font-bold">
                          100-200 points:
                        </span>{" "}
                        All star!
                      </div>
                      <div>
                        •{" "}
                        <span className="text-orange-600 font-bold">
                          200-300 points:
                        </span>{" "}
                        Ball Player
                      </div>
                      <div>
                        •{" "}
                        <span className="text-red-600 font-bold">
                          300+ points:
                        </span>{" "}
                        Prospect
                      </div>
                    </div>
                  </div>
                </div>

                {/* Close Button */}
                <div className="flex justify-center mt-6">
                  <button
                    onClick={() => setShowRulesModal(false)}
                    className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 text-white font-bold py-3 px-8 rounded-xl transition-all duration-300 shadow-lg hover:shadow-xl transform hover:scale-105"
                  >
                    Got it! 🚀
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <Toaster
        position="top-right"
        richColors
        closeButton
        theme="light"
        toastOptions={{
          style: {
            fontSize: "16px",
            padding: "16px 20px",
            minHeight: "64px",
          },
        }}
      />

      {/* Buy Me a Beer Button */}
      <div className="text-center mt-8">
        <a
          href="https://buymeacoffee.com/trevheath7w"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-white font-semibold py-2 px-4 rounded-full shadow-lg transition-colors text-sm"
        >
          🍺 Buy me a beer
        </a>
      </div>
    </div>
  );
}

function getCategoriesByGameMode(gameMode: string | undefined) {
  return gameMode === "pitchers" ? PITCHER_CATEGORIES : BATTER_CATEGORIES;
}
