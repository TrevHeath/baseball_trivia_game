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
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [gameMode, setGameMode] = useState<"batters" | "pitchers">("batters");

  // Get current categories based on game mode
  const CATEGORIES = getCategoriesByGameMode(gameMode);

  const currentGame = useQuery(api.game.getCurrentGame, { sessionId });

  useEffect(() => {
    if (currentGame?.game?.gameMode && !currentGame.game.isComplete)
      setGameMode(currentGame?.game?.gameMode as "batters" | "pitchers"); // Default to "batters" if not set
  }, [currentGame]);

  useEffect(() => {
    const handleHelpShortcut = (event: KeyboardEvent) => {
      if (event.key === "F1") {
        event.preventDefault();
        setShowRulesModal(true);
      }
      if (event.key === "F2") {
        event.preventDefault();
        setShowLeaderboard(true);
      }
    };

    window.addEventListener("keydown", handleHelpShortcut);
    return () => window.removeEventListener("keydown", handleHelpShortcut);
  }, []);

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
  const previousScores = allGameHistory?.filter(
    (game: any) => game._id !== gameHistory?.game?._id
  );
  const previousBestScore =
    previousScores && previousScores.length > 0
      ? Math.min(...previousScores.map((game: any) => game.totalScore))
      : null;
  const isNewPersonalBest =
    gameHistory?.game?.totalScore !== undefined &&
    (previousBestScore === null ||
      gameHistory.game.totalScore < previousBestScore);

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
      <div className="retro-app min-h-screen flex items-center justify-center p-4">
        <div className="boot-screen text-center">
          <div className="pixel-ball mx-auto mb-5">⚾</div>
          <p className="terminal-line text-lg font-medium">
            LOADING MLB DATABASE<span className="blink-cursor">_</span>
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

  if (showLeaderboard) {
    return (
      <LeaderboardPage
        sessionId={sessionId}
        initialGameMode={gameMode}
        onClose={() => setShowLeaderboard(false)}
      />
    );
  }

  // usedCategories is now from the query above

  return (
    <div className="retro-app min-h-screen p-3 md:p-6">
      {/* nav */}
      <button
        onClick={() => setShowLeaderboard(true)}
        className="retro-fab font-bold py-2 px-4 text-sm fixed bottom-4 left-4 z-50"
      >
        [F2] VIEW LEADERBOARD
      </button>
      <button
        onClick={() => setShowRulesModal(true)}
        className="retro-fab font-bold py-2 px-4 text-sm fixed bottom-4 right-4 z-50"
      >
        [F1] HELP
      </button>
      <div className="crt-shell max-w-4xl mx-auto">
        <div className="system-bar">
          <span>BASEBALL OS / 1987 EDITION</span>
          <span className="system-status">● ONLINE</span>
        </div>
        {/* Header */}
        <div className="retro-header relative text-center my-8 animate-fade-in">
          <div className="header-icon" aria-hidden="true">⚾</div>
          <p className="command-prompt">C:\GAMES\MLB&gt; RUN TRIVIA.EXE</p>
          <h1 className="text-3xl md:text-5xl font-bold mb-3">
            BASEBALL.EXE
          </h1>
          <p className="text-lg font-medium">
            &gt; HOW WELL DO YOU KNOW THE GAME?<span className="blink-cursor">_</span>
          </p>
        </div>

        {/* Game not started */}
        {!currentGame?.game && (
          <div className="text-center animate-slide-up">
            {/* Game Mode Selector */}
            <div className="retro-window p-6 mb-6">
              <div className="window-titlebar mb-6">
                <span>GAME_CONFIG.SYS</span>
                <span className="window-controls">_ □ ×</span>
              </div>
              <h2 className="text-xl font-bold mb-5">
                SELECT PLAYER DATABASE:
              </h2>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={() => setGameMode("batters")}
                  className={`retro-choice py-3 px-6 font-bold ${
                    gameMode === "batters"
                      ? "is-active"
                      : ""
                  }`}
                >
                  [1] BATTERS
                </button>
                <button
                  onClick={() => setGameMode("pitchers")}
                  className={`retro-choice py-3 px-6 font-bold ${
                    gameMode === "pitchers"
                      ? "is-active"
                      : ""
                  }`}
                >
                  [2] PITCHERS
                </button>
              </div>
              <div className="flex justify-center mt-6">
                <button
                  onClick={handleStartGame}
                  className="retro-primary font-bold py-4 px-10"
                >
                  ▶ BOOT NEW GAME
                </button>
              </div>
            </div>

            <div className="retro-window w-full animate-slide-up">
              {/* Modal Header */}
              <div className="window-titlebar">
                <div className="flex justify-between items-center">
                  <h2 className="text-base font-bold">README.TXT — HOW TO PLAY</h2>
                  <span className="window-controls">_ □ ×</span>
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
              <div className="retro-window p-8 mb-6">
                <h2 className="text-2xl font-bold mb-4">
                  ACCESSING PLAYER RECORD...
                </h2>
                <p>
                  QUERY IN PROGRESS<span className="blink-cursor">_</span>
                </p>
              </div>
              <div className="pixel-ball mx-auto mb-4">⚾</div>
            </div>
          )}
        {/* Active game */}
        {currentGame?.game &&
          !currentGame.game.isComplete &&
          currentGame.player && (
            <div className="space-y-6">
              {/* Progress and Score */}
              <div className="retro-window status-window p-6 animate-slide-in">
                <div className="window-titlebar mb-4">SESSION STATUS</div>
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
                <div className="retro-progress w-full h-5">
                  <div
                    className="retro-progress-fill h-full transition-all duration-700 ease-out"
                    style={{
                      width: `${(currentGame.game.currentRound / 6) * 100}%`,
                    }}
                  />
                  <span className="retro-progress-label text-xs">
                    Round {currentGame.game.currentRound} of 6
                  </span>
                </div>
              </div>

              {/* Player Card */}
              <div
                key={`${currentGame.player.playerId}-${currentGame.game.currentRound}`}
                className="retro-window player-terminal p-6 md:p-8 animate-slide-up"
              >
                <div className="window-titlebar mb-6">PLAYER_CARD.DAT</div>
                {/* Baseball Card Header */}

                <div className="flex items-center justify-between mb-4">
                  <div className="text-left">
                    <h2 className="text-3xl md:text-4xl font-bold mb-3 animate-fade-in">
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
                  <div className="player-icon text-6xl md:text-8xl">⚾</div>
                </div>
              </div>

              {/* Result Display */}
              {showResult && lastResult && (
                <div className="retro-window result-window p-6 text-center">
                  <h3 className="text-xl font-semibold mb-2">&gt; RESULT.LOG</h3>
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
                <div>
                  <div className="selection-prompt mb-5">
                    <span className="selection-prompt-label">YOUR TURN</span>
                    <div>
                      <h3>CHOOSE THIS PLAYER'S BEST STAT</h3>
                      <p>
                        Select the category where you think they rank closest
                        to #1. Each category can only be used once.
                      </p>
                    </div>
                  </div>
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
                          className={`category-key p-6 text-left animate-delay-${index} ${
                            isUsed
                              ? "is-used cursor-not-allowed"
                              : ""
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
                    className={`retro-choice py-2 px-4 font-bold text-sm ${gameMode === "batters" ? "is-active" : ""}`}
                  >
                    🏏 Batters
                  </button>
                  <button
                    onClick={() => setGameMode("pitchers")}
                    className={`retro-choice py-2 px-4 font-bold text-sm ${gameMode === "pitchers" ? "is-active" : ""}`}
                  >
                    ⚾ Pitchers
                  </button>
                </div>
              </div>

              <button
                onClick={handleStartGame}
                className="retro-primary font-bold py-4 px-10"
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
            <div className="final-modal bg-white max-w-2xl w-full max-h-[90vh] overflow-y-auto relative">
              {/* Modal Header */}
              <div className="final-modal-header text-white p-6">
                <p className="final-eyebrow text-center mb-3">
                  GAME SESSION COMPLETE
                </p>
                <h2 className="text-xl font-bold text-center mb-2">
                  FINAL SCORE
                </h2>
                <div className="text-center">
                  <div className="final-score-value font-bold mb-2">
                    {gameHistory.game.totalScore}
                  </div>
                  <p className="final-score-rating text-xl mb-2">
                    {getScoreDescription(gameHistory.game.totalScore)}
                  </p>
                  <p className="text-xs opacity-90">
                    LOWER IS BETTER • PERFECT SCORE: 6
                  </p>
                </div>
              </div>

              {/* Modal Content */}
              <div className="final-modal-content p-6">
                <section className="final-section mb-6">
                  <div className="section-heading mb-4">
                    <span>01</span>
                    <h3>YOUR PERFORMANCE</h3>
                  </div>
                  {isNewPersonalBest && (
                    <div className="new-record-banner mb-4">
                      ★ NEW PERSONAL RECORD ★
                    </div>
                  )}
                  <div className="performance-grid grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="metric-tile">
                      <span>PERSONAL BEST</span>
                      <strong>{bestScore !== null ? bestScore : "NEW"}</strong>
                    </div>
                    <div className="metric-tile">
                      <span>PERFECT PICKS</span>
                      <strong>
                        {gameHistory.rounds.filter((r) => r.score === 1).length}
                      </strong>
                    </div>
                    <div className="metric-tile">
                      <span>TOP 10 PICKS</span>
                      <strong>
                        {
                          gameHistory.rounds.filter(
                            (r) => r.score && r.score <= 10
                          ).length
                        }
                      </strong>
                    </div>
                    <div className="metric-tile">
                      <span>AVG. RANK</span>
                      <strong>
                        #{Math.round(gameHistory.game.totalScore / 6)}
                      </strong>
                    </div>
                  </div>
                </section>

                <section className="next-game-panel mb-6">
                  <div className="section-heading mb-4">
                    <span>02</span>
                    <h3>PLAY ANOTHER GAME</h3>
                  </div>
                  <p className="next-game-hint mb-3">
                    SELECT A PLAYER DATABASE, THEN START:
                  </p>
                  <div className="flex gap-3 mb-4">
                    <button
                      onClick={() => setGameMode("batters")}
                      className={`retro-choice flex-1 py-2 px-3 font-bold text-sm ${gameMode === "batters" ? "is-active" : ""}`}
                    >
                      🏏 BATTERS
                    </button>
                    <button
                      onClick={() => setGameMode("pitchers")}
                      className={`retro-choice flex-1 py-2 px-3 font-bold text-sm ${gameMode === "pitchers" ? "is-active" : ""}`}
                    >
                      ⚾ PITCHERS
                    </button>
                  </div>
                  <button
                    onClick={handleStartGame}
                    className="retro-primary w-full font-bold py-4 px-6"
                  >
                    ▶ START {gameMode === "pitchers" ? "PITCHERS" : "BATTERS"} GAME
                  </button>
                </section>

                {/* Global High Scores Section */}
                {highScores && (
                  <section className="final-section leaderboard-panel mb-6">
                    <div className="section-heading mb-4">
                      <span>03</span>
                      <h3>
                        GLOBAL LEADERBOARD / {completedGameMode === "pitchers"
                          ? "PITCHERS"
                          : "BATTERS"}
                      </h3>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="leaderboard-tile">
                        <div className="text-sm font-medium">TODAY'S BEST</div>
                        <strong>
                          {highScores.todayBestScore !== null
                            ? highScores.todayBestScore
                            : "—"}
                        </strong>
                        <div className="text-xs">
                          {highScores.todayGamesCount} GAME
                          {highScores.todayGamesCount !== 1 ? "S" : ""} PLAYED
                        </div>
                      </div>
                      <div className="leaderboard-tile">
                        <div className="text-sm font-medium">WEEK'S BEST</div>
                        <strong>
                          {highScores.weekBestScore !== null
                            ? highScores.weekBestScore
                            : "—"}
                        </strong>
                        <div className="text-xs">
                          {highScores.weekGamesCount} GAME
                          {highScores.weekGamesCount !== 1 ? "S" : ""} PLAYED
                        </div>
                      </div>
                    </div>

                    {/* Achievement badges */}
                    <div className="mt-3 flex flex-wrap gap-2 justify-center">
                      {gameHistory.game.totalScore ===
                        highScores.todayBestScore &&
                        highScores.todayBestScore !== null && (
                          <div className="champion-badge champion-today px-3 py-2 text-xs font-bold">
                            🥇 TODAY'S CHAMPION!
                          </div>
                        )}
                      {gameHistory.game.totalScore ===
                        highScores.weekBestScore &&
                        highScores.weekBestScore !== null && (
                          <div className="champion-badge champion-weekly px-3 py-2 text-xs font-bold">
                            👑 WEEKLY CHAMPION!
                          </div>
                        )}
                    </div>
                    <button
                      onClick={() => {
                        setGameMode(completedGameMode as "batters" | "pitchers");
                        setShowGameEndModal(false);
                        setShowLeaderboard(true);
                      }}
                      className="retro-primary w-full mt-4 font-bold py-3 px-4"
                    >
                      ▶ VIEW FULL LEADERBOARD
                    </button>
                  </section>
                )}
                {/* Round Summary */}
                <details className="round-details mb-6">
                  <summary>04 / VIEW ROUND-BY-ROUND RESULTS</summary>
                  <div className="round-list space-y-2 pt-4">
                    {gameHistory.rounds.map((round, index) => (
                      <div
                        key={round._id}
                        className="round-row flex justify-between items-center p-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="round-number w-8 h-8 flex items-center justify-center font-semibold text-sm">
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
                          className={`round-rank font-bold text-lg ${round.score && round.score <= 10 ? "text-green-600" : round.score && round.score <= 25 ? "text-yellow-600" : "text-red-600"}`}
                        >
                          {round.score ? `#${round.score}` : "-"}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>

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
                    className="retro-primary font-bold py-3 px-8"
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

type LeaderboardPeriod = "daily" | "weekly" | "allTime";

function LeaderboardPage({
  sessionId,
  initialGameMode,
  onClose,
}: {
  sessionId: string;
  initialGameMode: "batters" | "pitchers";
  onClose: () => void;
}) {
  const [gameMode, setGameMode] = useState(initialGameMode);
  const [period, setPeriod] = useState<LeaderboardPeriod>("daily");
  const leaderboard = useQuery(api.game.getLeaderboard, { sessionId, gameMode });
  const board = leaderboard?.[period];

  return (
    <div className="retro-app min-h-screen p-3 md:p-6">
      <div className="crt-shell leaderboard-shell max-w-5xl mx-auto">
        <div className="system-bar">
          <span>BASEBALL OS / HIGH SCORES</span>
          <span className="system-status">● LIVE</span>
        </div>

        <header className="leaderboard-header text-center my-8">
          <p className="command-prompt">C:\GAMES\MLB&gt; TYPE SCORES.DAT</p>
          <h1>HIGH SCORES</h1>
          <p>★ LOWER SCORES RULE THE DIAMOND ★</p>
        </header>

        <div className="leaderboard-controls retro-window p-4 mb-5">
          <div className="window-titlebar mb-4">
            <span>LEADERBOARD_CONFIG.SYS</span>
            <span className="window-controls">_ □ ×</span>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex gap-2">
              {(["daily", "weekly", "allTime"] as LeaderboardPeriod[]).map(
                (value) => (
                  <button
                    key={value}
                    onClick={() => setPeriod(value)}
                    className={`retro-choice flex-1 py-2 px-2 font-bold ${period === value ? "is-active" : ""}`}
                  >
                    {value === "allTime" ? "ALL TIME" : value.toUpperCase()}
                  </button>
                )
              )}
            </div>
            <div className="flex gap-2">
              {(["batters", "pitchers"] as const).map((value) => (
                <button
                  key={value}
                  onClick={() => setGameMode(value)}
                  className={`retro-choice flex-1 py-2 px-2 font-bold ${gameMode === value ? "is-active" : ""}`}
                >
                  {value.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>

        <section className="arcade-board retro-window">
          <div className="window-titlebar">
            <span>
              {period === "allTime" ? "ALL TIME" : period.toUpperCase()} / {gameMode.toUpperCase()}
            </span>
            <span>{board ? `${board.gamesPlayed} GAMES` : "READING..."}</span>
          </div>
          <div className="arcade-column-head grid grid-cols-[3rem_1fr_5rem] md:grid-cols-[4rem_1fr_8rem_6rem] gap-2 px-4 py-3">
            <span>RANK</span>
            <span>PLAYER</span>
            <span className="hidden md:block">DATE</span>
            <span className="text-right">SCORE</span>
          </div>

          {!board && <div className="leaderboard-empty">LOADING SCORES<span className="blink-cursor">_</span></div>}
          {board?.entries.length === 0 && (
            <div className="leaderboard-empty">NO SCORES YET — BE THE FIRST!</div>
          )}
          <div className="score-list">
            {board?.entries.map((entry: any) => (
              <details className={`score-entry ${entry.isCurrentPlayer ? "is-you" : ""}`} key={entry.gameId}>
                <summary className="grid grid-cols-[3rem_1fr_5rem] md:grid-cols-[4rem_1fr_8rem_6rem] gap-2 items-center px-4 py-4">
                  <strong>{String(entry.rank).padStart(2, "0")}</strong>
                  <span>{entry.isCurrentPlayer ? `${entry.playerCode} (YOU)` : entry.playerCode}</span>
                  <time className="hidden md:block">
                    {entry.completedAt
                      ? new Date(entry.completedAt).toLocaleDateString(undefined, {
                          month: "short",
                          day: "numeric",
                          year: "2-digit",
                        })
                      : "LEGACY"}
                  </time>
                  <strong className="score-value text-right">{entry.totalScore}</strong>
                </summary>
                <div className="pick-log">
                  <div className="pick-log-title">PICK LOG / CLICK SCORE ROW TO CLOSE</div>
                  {entry.picks.map((pick: any) => {
                    const category = getCategoriesByGameMode(gameMode).find(
                      (item) => item.id === pick.selectedCategory
                    );
                    return (
                      <div className="pick-row" key={`${entry.gameId}-${pick.roundNumber}`}>
                        <span>{String(pick.roundNumber).padStart(2, "0")}</span>
                        <strong>{pick.playerName}</strong>
                        <span>{category?.name ?? pick.selectedCategory ?? "NO PICK"}</span>
                        <strong>{pick.actualRank ? `#${pick.actualRank}` : "—"}</strong>
                      </div>
                    );
                  })}
                </div>
              </details>
            ))}
          </div>
        </section>

        <div className="flex justify-center mt-6">
          <button onClick={onClose} className="retro-primary font-bold py-3 px-8">
            ◀ RETURN TO GAME
          </button>
        </div>
      </div>
    </div>
  );
}
