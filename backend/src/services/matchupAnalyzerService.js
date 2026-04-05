const riotApi = require('./riotApiClient');
const { HttpError } = require('../utils/httpError');

const TARGET_MATCH_COUNT = 20;
const MATCH_PAGE_SIZE = 25;
const MAX_MATCHES_TO_SCAN = 250;
const MAX_UNCACHED_MATCH_FETCHES_PER_ANALYSIS = 80;
const FAST_RETURN_SCAN_LIMIT = 50;
const TEN_MINUTES_MS = 10 * 60 * 1000;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const EARLY_GAME_CUTOFF_MS = TEN_MINUTES_MS;
const GANK_PROXIMITY_RADIUS = 3500;
const ANALYSIS_CACHE_TTL_MS = 60 * 1000;

const analysisCache = new Map();

function normalizeChampion(name) {
  return String(name || '').trim().toLowerCase();
}

function normalizeGameDuration(gameDuration) {
  if (typeof gameDuration !== 'number') {
    return 0;
  }

  return gameDuration > 100000 ? Math.round(gameDuration / 1000) : gameDuration;
}

function getAnalysisCacheKey({ gameName, tagLine, championA, championB }) {
  return [gameName, tagLine, championA, championB].map((value) => String(value || '').trim().toLowerCase()).join(':');
}

function getCachedAnalysis(cacheKey) {
  const cachedEntry = analysisCache.get(cacheKey);
  if (!cachedEntry) {
    return null;
  }

  if (cachedEntry.expiresAt <= Date.now()) {
    analysisCache.delete(cacheKey);
    return null;
  }

  return cachedEntry.value;
}

function setCachedAnalysis(cacheKey, value) {
  analysisCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + ANALYSIS_CACHE_TTL_MS,
  });
}

function isTopLaneParticipant(participant) {
  return [participant?.teamPosition, participant?.individualPosition, participant?.lane].some(
    (value) => String(value || '').toUpperCase() === 'TOP',
  );
}

function isJungleParticipant(participant) {
  return [participant?.teamPosition, participant?.individualPosition, participant?.lane, participant?.role].some(
    (value) => String(value || '').toUpperCase() === 'JUNGLE',
  );
}

function isEligibleMatch(matchInfo) {
  return Boolean(matchInfo && matchInfo.mapId === 11 && matchInfo.gameMode === 'CLASSIC');
}

function getFrameAtOrAfterTimestamp(timelineInfo, targetTimestampMs) {
  const frames = timelineInfo?.frames || [];
  return frames.find((frame) => Number(frame?.timestamp || 0) >= targetTimestampMs) || null;
}

function getParticipantFrame(frame, participantId) {
  if (!frame?.participantFrames) {
    return null;
  }

  return frame.participantFrames[String(participantId)] || frame.participantFrames[participantId] || null;
}

function buildLaneSnapshot(frame, playerParticipantId, enemyParticipantId) {
  if (!frame) {
    return null;
  }

  const playerFrame = getParticipantFrame(frame, playerParticipantId);
  const enemyFrame = getParticipantFrame(frame, enemyParticipantId);

  if (!playerFrame || !enemyFrame) {
    return null;
  }

  const playerCs = Number(playerFrame.minionsKilled || 0) + Number(playerFrame.jungleMinionsKilled || 0);
  const enemyCs = Number(enemyFrame.minionsKilled || 0) + Number(enemyFrame.jungleMinionsKilled || 0);

  return {
    goldDiff: Number(playerFrame.totalGold || 0) - Number(enemyFrame.totalGold || 0),
    csDiff: playerCs - enemyCs,
    xpDiff: Number(playerFrame.xp || 0) - Number(enemyFrame.xp || 0),
  };
}

function computeLaneDiffsFromTimeline(timelineInfo, playerParticipantId, enemyParticipantId) {
  const frameAt10 = getFrameAtOrAfterTimestamp(timelineInfo, TEN_MINUTES_MS);
  const frameAt15 = getFrameAtOrAfterTimestamp(timelineInfo, FIFTEEN_MINUTES_MS);

  return {
    min10: buildLaneSnapshot(frameAt10, playerParticipantId, enemyParticipantId),
    min15: buildLaneSnapshot(frameAt15, playerParticipantId, enemyParticipantId),
  };
}

function getDistanceBetweenPositions(leftPosition, rightPosition) {
  if (!leftPosition || !rightPosition) {
    return Number.POSITIVE_INFINITY;
  }

  const deltaX = Number(leftPosition.x || 0) - Number(rightPosition.x || 0);
  const deltaY = Number(leftPosition.y || 0) - Number(rightPosition.y || 0);

  return Math.sqrt(deltaX * deltaX + deltaY * deltaY);
}

function eventInvolvesTopMatchup(event, playerParticipantId, enemyTopParticipantId) {
  const involvedParticipantIds = [
    event?.killerId,
    event?.victimId,
    ...(event?.assistingParticipantIds || []),
  ].filter((participantId) => Number.isInteger(participantId));

  return (
    involvedParticipantIds.includes(playerParticipantId) || involvedParticipantIds.includes(enemyTopParticipantId)
  );
}

function junglerWasNearTopFight(frame, event, enemyJunglerParticipantId, playerParticipantId, enemyTopParticipantId) {
  const enemyJunglerFrame = getParticipantFrame(frame, enemyJunglerParticipantId);
  const playerFrame = getParticipantFrame(frame, playerParticipantId);
  const enemyTopFrame = getParticipantFrame(frame, enemyTopParticipantId);

  const junglerPosition = enemyJunglerFrame?.position || null;
  const playerPosition = playerFrame?.position || null;
  const enemyTopPosition = enemyTopFrame?.position || null;

  const junglerInKill = event.killerId === enemyJunglerParticipantId;
  const junglerInAssist = (event.assistingParticipantIds || []).includes(enemyJunglerParticipantId);

  const distanceToPlayer = getDistanceBetweenPositions(junglerPosition, playerPosition);
  const distanceToEnemyTop = getDistanceBetweenPositions(junglerPosition, enemyTopPosition);
  const distanceToEvent = getDistanceBetweenPositions(junglerPosition, event.position || null);

  return (
    junglerInKill ||
    junglerInAssist ||
    distanceToPlayer <= GANK_PROXIMITY_RADIUS ||
    distanceToEnemyTop <= GANK_PROXIMITY_RADIUS ||
    distanceToEvent <= GANK_PROXIMITY_RADIUS
  );
}

function computeEarlyGankProbability(timelineInfo, player, enemyTop, participants) {
  const enemyJungler = participants.find(
    (participant) => participant.teamId !== player.teamId && isJungleParticipant(participant),
  );

  if (!enemyJungler) {
    return {
      probabilityPercent: 0,
      topKillEvents: 0,
      junglePresenceEvents: 0,
    };
  }

  let topKillEvents = 0;
  let junglePresenceEvents = 0;

  for (const frame of timelineInfo?.frames || []) {
    if (Number(frame?.timestamp || 0) > EARLY_GAME_CUTOFF_MS) {
      break;
    }

    for (const event of frame?.events || []) {
      if (event?.type !== 'CHAMPION_KILL') {
        continue;
      }

      if (!eventInvolvesTopMatchup(event, player.participantId, enemyTop.participantId)) {
        continue;
      }

      topKillEvents += 1;

      if (
        junglerWasNearTopFight(frame, event, enemyJungler.participantId, player.participantId, enemyTop.participantId)
      ) {
        junglePresenceEvents += 1;
      }
    }
  }

  return {
    probabilityPercent:
      topKillEvents === 0 ? 0 : Number((((junglePresenceEvents / topKillEvents) * 100).toFixed(2))),
    topKillEvents,
    junglePresenceEvents,
  };
}

function extractBuild(participant) {
  const items = [];

  for (let slot = 0; slot <= 5; slot += 1) {
    const itemId = Number(participant[`item${slot}`] || 0);
    if (itemId > 0) {
      items.push(itemId);
    }
  }

  return {
    items,
    trinket: Number(participant.item6 || 0) || null,
  };
}

function extractRunes(participant) {
  const styles = participant?.perks?.styles || [];
  const primaryStyle = styles.find((style) => style.description === 'primaryStyle') || styles[0] || null;
  const secondaryStyle = styles.find((style) => style.description === 'subStyle') || styles[1] || null;

  return {
    primaryStyleId: primaryStyle?.style || null,
    secondaryStyleId: secondaryStyle?.style || null,
    keystoneId: primaryStyle?.selections?.[0]?.perk || null,
    primaryPerkIds: (primaryStyle?.selections || []).map((selection) => selection.perk),
    secondaryPerkIds: (secondaryStyle?.selections || []).map((selection) => selection.perk),
    statPerks: participant?.perks?.statPerks || null,
  };
}

function extractCombatSummary(participant) {
  const totalCs = Number(participant.totalMinionsKilled || 0) + Number(participant.neutralMinionsKilled || 0);

  return {
    kills: Number(participant.kills || 0),
    deaths: Number(participant.deaths || 0),
    assists: Number(participant.assists || 0),
    kda: `${Number(participant.kills || 0)}/${Number(participant.deaths || 0)}/${Number(participant.assists || 0)}`,
    totalCs,
    goldEarned: Number(participant.goldEarned || 0),
    damageToChampions: Number(participant.totalDamageDealtToChampions || 0),
    damageTaken: Number(participant.totalDamageTaken || 0),
    visionScore: Number(participant.visionScore || 0),
    champLevel: Number(participant.champLevel || 0),
  };
}

function findExactTopMatchupParticipants(matchInfo, puuid, championA, championB) {
  const participants = matchInfo?.participants || [];

  const player = participants.find(
    (participant) => participant.puuid === puuid && isTopLaneParticipant(participant),
  );

  if (!player || normalizeChampion(player.championName) !== championA) {
    return null;
  }

  const enemyTop = participants.find(
    (participant) =>
      participant.teamId !== player.teamId &&
      isTopLaneParticipant(participant) &&
      normalizeChampion(participant.championName) === championB,
  );

  if (!enemyTop) {
    return null;
  }

  return { player, enemyTop };
}

async function collectExactTopMatchups({ puuid, championA, championB, limit = TARGET_MATCH_COUNT }) {
  const exactMatchups = [];
  let scannedMatches = 0;
  let networkMatchFetches = 0;
  let start = 0;
  let hitNetworkBudget = false;

  while (exactMatchups.length < limit && scannedMatches < MAX_MATCHES_TO_SCAN && !hitNetworkBudget) {
    const remainingScanBudget = MAX_MATCHES_TO_SCAN - scannedMatches;
    const pageSize = Math.min(MATCH_PAGE_SIZE, remainingScanBudget);

    const matchIds = await riotApi.getMatchIdsByPuuid(puuid, { start, count: pageSize });
    if (matchIds.length === 0) {
      break;
    }

    start += matchIds.length;

    const pageMatchIds = [];

    for (const matchId of matchIds) {
      const isCachedMatch = riotApi.hasCachedMatch(matchId);
      if (!isCachedMatch && networkMatchFetches >= MAX_UNCACHED_MATCH_FETCHES_PER_ANALYSIS) {
        hitNetworkBudget = true;
        break;
      }

      if (!isCachedMatch) {
        networkMatchFetches += 1;
      }

      pageMatchIds.push(matchId);
    }

    if (pageMatchIds.length === 0) {
      break;
    }

    scannedMatches += pageMatchIds.length;

    const matchResponses = await Promise.allSettled(pageMatchIds.map((matchId) => riotApi.getMatch(matchId)));

    for (let index = 0; index < matchResponses.length; index += 1) {
      const matchResponse = matchResponses[index];

      if (matchResponse.status !== 'fulfilled') {
        continue;
      }

      const matchId = pageMatchIds[index];
      const matchInfo = matchResponse.value?.info;

      if (!isEligibleMatch(matchInfo)) {
        continue;
      }

      const matchup = findExactTopMatchupParticipants(matchInfo, puuid, championA, championB);
      if (!matchup) {
        continue;
      }

      exactMatchups.push({
        matchId,
        matchInfo,
        matchup,
      });

      if (exactMatchups.length >= limit) {
        break;
      }
    }

    if (exactMatchups.length > 0 && scannedMatches >= FAST_RETURN_SCAN_LIMIT) {
      break;
    }
  }

  return {
    exactMatchups,
    scannedMatches,
    networkMatchFetches,
    hitNetworkBudget,
  };
}

async function buildAnalyzedMatch(matchId, matchInfo, matchup) {
  const timeline = await riotApi.getMatchTimeline(matchId);
  const timelineInfo = timeline?.info || {};

  const laneDiffs = computeLaneDiffsFromTimeline(
    timelineInfo,
    matchup.player.participantId,
    matchup.enemyTop.participantId,
  );

  const gankData = computeEarlyGankProbability(timelineInfo, matchup.player, matchup.enemyTop, matchInfo.participants);

  return {
    matchId,
    gameCreation: matchInfo.gameCreation,
    gameDuration: normalizeGameDuration(matchInfo.gameDuration),
    queueId: matchInfo.queueId,
    playerChampion: matchup.player.championName,
    enemyChampion: matchup.enemyTop.championName,
    didWin: Boolean(matchup.player.win),
    laneDiffs,
    gankProbability: gankData.probabilityPercent,
    gankContext: {
      topKillEvents: gankData.topKillEvents,
      enemyJunglePresenceEvents: gankData.junglePresenceEvents,
    },
    build: extractBuild(matchup.player),
    runes: extractRunes(matchup.player),
    combat: extractCombatSummary(matchup.player),
  };
}

async function analyzeTopMatchup({ gameName, tagLine, championA, championB }) {
  const normalizedChampionA = normalizeChampion(championA);
  const normalizedChampionB = normalizeChampion(championB);

  if (!gameName || !tagLine || !normalizedChampionA || !normalizedChampionB) {
    throw new HttpError(400, 'Missing required params: gameName, tagLine, championA, championB');
  }

  const cacheKey = getAnalysisCacheKey({ gameName, tagLine, championA, championB });
  const cachedAnalysis = getCachedAnalysis(cacheKey);
  if (cachedAnalysis) {
    return cachedAnalysis;
  }

  const startedAt = Date.now();

  try {
    const account = await riotApi.getAccountByRiotId(gameName, tagLine);
    const summoner = await riotApi.getSummonerByPuuid(account.puuid);
    const { exactMatchups, scannedMatches, networkMatchFetches, hitNetworkBudget } = await collectExactTopMatchups({
      puuid: account.puuid,
      championA: normalizedChampionA,
      championB: normalizedChampionB,
    });

    const timelineResponses = await Promise.allSettled(
      exactMatchups.map((match) => buildAnalyzedMatch(match.matchId, match.matchInfo, match.matchup)),
    );

    const analyzedMatches = timelineResponses
      .flatMap((response) => (response.status === 'fulfilled' ? [response.value] : []))
      .sort((leftMatch, rightMatch) => Number(rightMatch.gameCreation || 0) - Number(leftMatch.gameCreation || 0));

    const totalMatches = analyzedMatches.length;
    const totalWins = analyzedMatches.filter((match) => match.didWin).length;

    const response = {
      summoner: {
        gameName: account.gameName || gameName,
        tagLine: account.tagLine || tagLine,
        puuid: account.puuid,
        summonerLevel: Number(summoner?.summonerLevel || 0),
        profileIconId: Number(summoner?.profileIconId || 0),
      },
      filters: {
        championA,
        championB,
      },
      sampledMatches: totalMatches,
      winRate: totalMatches === 0 ? 0 : Number((((totalWins / totalMatches) * 100).toFixed(2))),
      matches: analyzedMatches,
      meta: {
        targetMatchCount: TARGET_MATCH_COUNT,
        scannedMatches,
        networkMatchFetches,
        hitNetworkBudget,
        loadedTimelines: analyzedMatches.length,
        durationMs: Date.now() - startedAt,
      },
    };

    setCachedAnalysis(cacheKey, response);
    return response;
  } catch (error) {
    if (error?.response?.status === 429) {
      throw new HttpError(429, 'Rate limit da Riot API hit. Backoff and queue handling were applied.');
    }

    throw new HttpError(
      error?.response?.status || 500,
      'Erro ao analisar matchup.',
      error?.response?.data || error.message,
    );
  }
}

module.exports = { analyzeTopMatchup };
