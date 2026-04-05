export interface AnalyzeMatchupRequest {
  gameName: string;
  tagLine: string;
  championA: string;
  championB: string;
}

export interface LaneDiffSnapshot {
  goldDiff: number;
  csDiff: number;
  xpDiff: number;
}

export interface MatchLaneDiffs {
  min10: LaneDiffSnapshot | null;
  min15: LaneDiffSnapshot | null;
}

export interface MatchGankContext {
  topKillEvents: number;
  enemyJunglePresenceEvents: number;
}

export interface MatchupMatch {
  matchId: string;
  gameCreation: number;
  gameDuration: number;
  playerChampion: string;
  enemyChampion: string;
  didWin: boolean;
  laneDiffs: MatchLaneDiffs;
  gankProbability: number;
  gankContext: MatchGankContext;
}

export interface MatchupSummaryResponse {
  summoner: {
    name: string;
    puuid: string;
  };
  filters: {
    championA: string;
    championB: string;
  };
  sampledMatches: number;
  winRate: number;
  matches: MatchupMatch[];
}
