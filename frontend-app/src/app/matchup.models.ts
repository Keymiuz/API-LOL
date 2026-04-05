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

export interface MatchBuild {
  items: number[];
  trinket: number | null;
}

export interface MatchRunes {
  primaryStyleId: number | null;
  secondaryStyleId: number | null;
  keystoneId: number | null;
  primaryPerkIds: number[];
  secondaryPerkIds: number[];
  statPerks: {
    defense?: number;
    flex?: number;
    offense?: number;
  } | null;
}

export interface MatchCombatSummary {
  kills: number;
  deaths: number;
  assists: number;
  kda: string;
  totalCs: number;
  goldEarned: number;
  damageToChampions: number;
  damageTaken: number;
  visionScore: number;
  champLevel: number;
}

export interface MatchupMatch {
  matchId: string;
  gameCreation: number;
  gameDuration: number;
  queueId: number;
  playerChampion: string;
  enemyChampion: string;
  didWin: boolean;
  laneDiffs: MatchLaneDiffs;
  gankProbability: number;
  gankContext: MatchGankContext;
  build: MatchBuild;
  runes: MatchRunes;
  combat: MatchCombatSummary;
}

export interface MatchupSummaryResponse {
  summoner: {
    gameName: string;
    tagLine: string;
    puuid: string;
    summonerLevel: number;
    profileIconId: number;
  };
  filters: {
    championA: string;
    championB: string;
  };
  sampledMatches: number;
  winRate: number;
  matches: MatchupMatch[];
  meta: {
    targetMatchCount: number;
    scannedMatches: number;
    networkMatchFetches: number;
    hitNetworkBudget: boolean;
    loadedTimelines: number;
    durationMs: number;
  };
}
