import { useQuery, useAction } from "convex/react";
import { api } from "../convex/_generated/api";
import { useState, useEffect } from "react";
import { Toaster, toast } from "sonner";

const CATEGORIES = [
  {
    id: "batting-average",
    name: "Batting Average",
    description: "Highest batting average",
  },
  { id: "home-runs", name: "Home Runs", description: "Most home runs" },
  { id: "ops", name: "OPS", description: "Highest OPS" },
  { id: "obp", name: "OBP", description: "Highest obp" },
  {
    id: "stolen-bases",
    name: "Stolen Bases",
    description: "Most stolen bases",
  },
  { id: "rbis", name: "RBIs", description: "Most RBIs" },
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

  const currentGame = useQuery(api.game.getCurrentGame, { sessionId });

  const gameHistory = useQuery(api.game.getGameHistory, { sessionId });
  const allGameHistory = useQuery(api.game.getAllGameHistory, { sessionId });
  const usedCategories = useQuery(api.game.getUsedCategories, { sessionId });
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
      gameHistory.game.totalScore !== undefined
    ) {
      // Show modal after a short delay
      setTimeout(() => {
        setShowGameEndModal(true);
      }, 100);
    }
  }, [gameHistory?.game?.isComplete, gameHistory?.game?.totalScore]);

  const handleStartGame = async () => {
    setShowResult(false);
    setLastResult(null);
    setShowGameEndModal(false);
    await startNewGame({ sessionId });
  };

  const handleCategorySelect = async (categoryId: string) => {
    if (!currentGame?.game || showResult) return;

    try {
      const result = await selectCategory({ sessionId, category: categoryId });
      setLastResult(result);
      setShowResult(true);

      // Show toast feedback based on performance
      if (currentGame.player) {
        const bestCategory = findBestCategory(currentGame.player);
        const actualRank = result.actualRank;
        const selectedCategoryName =
          CATEGORIES.find((c) => c.id === categoryId)?.name || categoryId;

        if (actualRank === 1) {
          toast.success(
            `🏆 Perfect! ${selectedCategoryName} is their #1 stat!`,
            {
              duration: 3000,
            }
          );
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
    if (score <= 12) return "text-green-600";
    if (score <= 24) return "text-yellow-600";
    if (score <= 36) return "text-orange-600";
    return "text-red-600";
  };

  const getScoreDescription = (score: number) => {
    if (score <= 12) return "Excellent!";
    if (score <= 24) return "Good job!";
    if (score <= 36) return "Not bad!";
    return "Keep trying!";
  };

  const findBestCategory = (player: any) => {
    const categoryRanks = {
      "batting-average": player.battingAverageRank,
      "home-runs": player.homeRunsRank,
      ops: player.opsRank,
      obp: player.obpRank,
      "stolen-bases": player.stolenBasesRank,
      rbis: player.rbisRank,
    };

    let bestCategory = "batting-average";
    let bestRank = categoryRanks["batting-average"];

    for (const [category, rank] of Object.entries(categoryRanks)) {
      if (rank < bestRank) {
        bestRank = rank;
        bestCategory = category;
      }
    }

    return {
      category: bestCategory,
      rank: bestRank,
      name: CATEGORIES.find((c) => c.id === bestCategory)?.name || bestCategory,
    };
  };

  // Get used categories is now handled by the query

  if (currentGame === undefined) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading game...</p>
        </div>
        <Toaster />
      </div>
    );
  }

  // usedCategories is now from the query above

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-green-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            ⚾ Basebally Stats Challenge
          </h1>
          <p className="text-gray-600">
            Guess which category each player ranks highest in!
          </p>
        </div>

        {/* Game not started */}
        {!currentGame?.game && (
          <div className="text-center">
            <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
              <h2 className="text-2xl font-semibold mb-4">How to Play</h2>
              <div className="text-left max-w-2xl mx-auto space-y-3 text-gray-700">
                <p>• You'll see 6 random MLB players, one at a time</p>
                <p>
                  • For each player, choose the category where you think they
                  rank <strong>highest</strong> (closest to #1)
                </p>
                <p>• Each category can only be selected once per game</p>
                <p>
                  • Your score is the sum of their actual ranks in your chosen
                  categories
                </p>
                <p>
                  • Lower scores are better - a perfect game scores just 6
                  points!
                </p>
                <p className="text-sm text-blue-600 font-medium">
                  • Using MLB stats from the current season!
                </p>
              </div>
            </div>
            <button
              onClick={handleStartGame}
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors shadow-lg"
            >
              Start New Game
            </button>
          </div>
        )}

        {/* Active game */}
        {currentGame?.game &&
          !currentGame.game.isComplete &&
          currentGame.player && (
            <div className="space-y-6">
              {/* Progress and Score */}
              <div className="bg-white rounded-lg shadow-lg p-6">
                <div className="flex justify-between items-center mb-4">
                  <div className="text-sm text-gray-600">
                    Round {currentGame.game.currentRound} of 6
                  </div>
                  <div className="flex flex-1 flex-wrap justify-end items-center gap-3">
                    <div className="text-sm text-gray-600 bg-blue-50 px-3 py-1 rounded-full">
                      Total Score:{" "}
                      <span className="font-semibold">
                        {currentGame.game.totalScore}
                      </span>
                    </div>
                    {lastResult && (
                      <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium border border-green-200">
                        Last Choice: #{lastResult.actualRank}
                      </div>
                    )}
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${(currentGame.game.currentRound / 6) * 100}%`,
                    }}
                  ></div>
                </div>
              </div>

              {/* Player Card */}
              <div
                key={`${currentGame.player.playerId}-${currentGame.game.currentRound}`}
                className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl shadow-xl p-8 border-2 border-blue-200"
              >
                {/* Baseball Card Header */}
                <div className="bg-white rounded-lg p-6 mb-6 shadow-md">
                  <div className="flex items-center justify-between mb-4">
                    <div className="text-left">
                      <h2 className="text-3xl font-bold text-gray-800 mb-1">
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
                    <div className="text-6xl">⚾</div>
                  </div>
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {CATEGORIES.map((category) => {
                    const isUsed =
                      usedCategories?.includes(category.id) || false;
                    return (
                      <button
                        key={category.id}
                        onClick={() =>
                          !isUsed && handleCategorySelect(category.id)
                        }
                        disabled={isUsed}
                        className={`border-2 rounded-lg p-6 text-left transition-all duration-200 shadow-sm ${
                          isUsed
                            ? "bg-gray-100 border-gray-300 text-gray-400 cursor-not-allowed"
                            : "bg-white hover:bg-blue-50 border-gray-200 hover:border-blue-300 hover:shadow-md"
                        }`}
                      >
                        <h4 className="font-semibold text-lg mb-2">
                          {category.name}
                        </h4>
                        <p className="text-sm">{category.description}</p>
                        {isUsed && (
                          <p className="text-xs mt-2 font-medium">
                            Already selected
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
              <h2 className="text-3xl font-bold mb-4">Game Complete!</h2>
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
              <button
                onClick={handleStartGame}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-8 rounded-lg transition-colors shadow-lg"
              >
                Play Again
              </button>
            </div>
          </div>
        )}

        {/* Game End Modal */}
        {showGameEndModal && gameHistory && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="bg-gradient-to-r from-blue-600 to-green-600 text-white p-6 rounded-t-2xl">
                <h2 className="text-3xl font-bold text-center mb-2">
                  🎉 Game Complete!
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
                    <div className="flex">
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
                                  CATEGORIES.find(
                                    (c) => c.id === round.selectedCategory
                                  )?.name
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

                {/* Action Buttons */}
                <div className="flex gap-3">
                  <button
                    onClick={handleStartGame}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-colors"
                  >
                    🎮 Play Again
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <Toaster />
    </div>
  );
}
