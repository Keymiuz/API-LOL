const riotApi = require('./riotApiClient');
const { HttpError } = require('../utils/httpError');

const TOP_LANE_MIN_X = 9000;
const TOP_LANE_MIN_Y = 9000;

function normalizeChampion(name) {
  return String(name || '').trim().toLowerCase();
}

function isTopLanePosition(position) {
  if (!position || typeof position.x !== 'number' || typeof position.y !== 'number') {
    return false;
  }
  return position.x >= TOP_LANE_MIN_X && position.y >= TOP_LANE_MIN_Y;
}

function getParticipantFrames(timelineInfo, minuteMark) {
  const frame = timelineInfo.frames.find((f) => Math.floor((f.timestamp || 0) / 60000) >= minuteMark);
  return frame?.participantFrames || null;
}

function findPlayerAndEnemyTopParticipants(matchInfo, puuid, championA, championB) {
  const participants = matchInfo?.participants || [];

  const player = participants.find((p) => p.puuid === puuid && p.teamPosition === 'TOP');
  if (!player) return null;

  const enemyTop = participants.find(
    (p) =>
      p.teamPosition === 'TOP' &&
      p.teamId !== player.teamId &&
      [normalizeChampion(championA), normalizeChampion(championB)].includes(normalizeChampion(p.championName)),
  );

  if (!enemyTop) return null;

  return { player, enemyTop };
}

function computeLaneDiffsFromTimeline(timelineInfo, playerParticipantId, enemyParticipantId) {
  /**
   * Esta função faz parsing frame-a-frame do Match-Timeline-V5.
   *
   * 1) Busca os snapshots de participantFrames próximos do minuto 10 e 15.
   * 2) Para cada snapshot, captura total de gold, minions farmados e XP acumulado.
   * 3) Calcula diferença absoluta jogador - oponente para representar vantagem/desvantagem na lane.
   */
  const at10 = getParticipantFrames(timelineInfo, 10);
  const at15 = getParticipantFrames(timelineInfo, 15);

  const mapDiff = (frames) => {
    if (!frames) return null;

    const playerFrame = frames[playerParticipantId];
    const enemyFrame = frames[enemyParticipantId];

    if (!playerFrame || !enemyFrame) return null;

    const playerCs = (playerFrame.minionsKilled || 0) + (playerFrame.jungleMinionsKilled || 0);
    const enemyCs = (enemyFrame.minionsKilled || 0) + (enemyFrame.jungleMinionsKilled || 0);

    return {
      goldDiff: (playerFrame.totalGold || 0) - (enemyFrame.totalGold || 0),
      csDiff: playerCs - enemyCs,
      xpDiff: (playerFrame.xp || 0) - (enemyFrame.xp || 0),
    };
  };

  return {
    min10: mapDiff(at10),
    min15: mapDiff(at15),
  };
}

function computeEarlyGankProbability(timelineInfo, player, enemyTop, participants) {
  /**
   * Algoritmo de agressividade de gank inimigo para Top nos primeiros 10 minutos:
   *
   * - Itera cada frame do timeline até 10:00 (600000ms).
   * - Filtra eventos CHAMPION_KILL.
   * - Para cada kill, verifica se a posição do evento pertence à zona de Top.
   * - Em seguida, identifica se o jungler inimigo foi killer ou assistente no evento.
   * - A probabilidade é calculada como (#eventos com presença do jungler inimigo em top) / (#eventos de kill em top).
   *
   * Observação: usamos também participantes com role JUNGLE ou teamPosition JUNGLE para robustez em filas diferentes.
   */
  const enemyJungler = participants.find(
    (p) => p.teamId !== player.teamId && (p.teamPosition === 'JUNGLE' || p.individualPosition === 'JUNGLE' || p.role === 'JUNGLE'),
  );

  if (!enemyJungler) {
    return { probability: 0, topKillEvents: 0, junglePresenceEvents: 0 };
  }

  let topKillEvents = 0;
  let junglePresenceEvents = 0;

  for (const frame of timelineInfo.frames || []) {
    if ((frame.timestamp || 0) > 600000) {
      break;
    }

    for (const event of frame.events || []) {
      if (event.type !== 'CHAMPION_KILL') continue;
      if (!isTopLanePosition(event.position)) continue;

      const victimId = event.victimId;
      if (![player.participantId, enemyTop.participantId].includes(victimId)) {
        continue;
      }

      topKillEvents += 1;

      const killerIsEnemyJungler = event.killerId === enemyJungler.participantId;
      const assistIncludesEnemyJungler = (event.assistingParticipantIds || []).includes(enemyJungler.participantId);

      if (killerIsEnemyJungler || assistIncludesEnemyJungler) {
        junglePresenceEvents += 1;
      }
    }
  }

  return {
    probability: topKillEvents === 0 ? 0 : junglePresenceEvents / topKillEvents,
    topKillEvents,
    junglePresenceEvents,
  };
}

async function analyzeTopMatchup({ gameName, tagLine, championA, championB }) {
  const normalizedChampionA = normalizeChampion(championA);
  const normalizedChampionB = normalizeChampion(championB);

  if (!gameName || !tagLine || !normalizedChampionA || !normalizedChampionB) {
    throw new HttpError(400, 'Missing required params: gameName, tagLine, championA, championB');
  }

  try {
    const account = await riotApi.getSummonerByName(gameName, tagLine);
    const summoner = await riotApi.getSummonerByPuuid(account.puuid);
    const candidateMatchIds = await riotApi.getMatchIdsByPuuid(account.puuid, 80);

    const analyzedMatches = [];

    for (const matchId of candidateMatchIds) {
      if (analyzedMatches.length >= 20) break;

      const match = await riotApi.getMatch(matchId);
      const info = match.info;

      if (info.gameMode !== 'CLASSIC') continue;

      const matchup = findPlayerAndEnemyTopParticipants(info, account.puuid, normalizedChampionA, normalizedChampionB);
      if (!matchup) continue;

      const playerChampion = normalizeChampion(matchup.player.championName);
      const enemyChampion = normalizeChampion(matchup.enemyTop.championName);

      const exactMatchup =
        (playerChampion === normalizedChampionA && enemyChampion === normalizedChampionB) ||
        (playerChampion === normalizedChampionB && enemyChampion === normalizedChampionA);

      if (!exactMatchup) continue;

      const timeline = await riotApi.getMatchTimeline(matchId);
      const timelineInfo = timeline.info;

      const laneDiffs = computeLaneDiffsFromTimeline(
        timelineInfo,
        matchup.player.participantId,
        matchup.enemyTop.participantId,
      );
      const gankData = computeEarlyGankProbability(timelineInfo, matchup.player, matchup.enemyTop, info.participants);

      analyzedMatches.push({
        matchId,
        gameCreation: info.gameCreation,
        gameDuration: info.gameDuration,
        playerChampion: matchup.player.championName,
        enemyChampion: matchup.enemyTop.championName,
        didWin: Boolean(matchup.player.win),
        laneDiffs,
        gankProbability: gankData.probability,
        gankContext: {
          topKillEvents: gankData.topKillEvents,
          enemyJunglePresenceEvents: gankData.junglePresenceEvents,
        },
      });
    }

    const total = analyzedMatches.length;
    const wins = analyzedMatches.filter((m) => m.didWin).length;

    return {
      summoner: {
        name: summoner.name,
        puuid: account.puuid,
      },
      filters: {
        championA,
        championB,
      },
      sampledMatches: total,
      winRate: total === 0 ? 0 : wins / total,
      matches: analyzedMatches,
    };
  } catch (error) {
    if (error?.response?.status === 429) {
      throw new HttpError(429, 'Rate limit da Riot API atingido. Requisição enfileirada/backoff aplicado.');
    }

    throw new HttpError(
      error?.response?.status || 500,
      'Erro ao analisar matchup.',
      error?.response?.data || error.message,
    );
  }
}

module.exports = { analyzeTopMatchup };
