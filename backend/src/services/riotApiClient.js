const axios = require('axios');
const env = require('../config/env');
const { RequestQueue } = require('./requestQueue');

const platformBaseUrl = `https://${env.riotPlatform}.api.riotgames.com`;
const regionBaseUrl = `https://${env.riotRegion}.api.riotgames.com`;

const queue = new RequestQueue(env.maxQueueConcurrency);

const client = axios.create({
  timeout: env.requestTimeoutMs,
  headers: {
    'X-Riot-Token': env.riotApiKey,
  },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function computeBackoffMs(attempt, retryAfterHeader) {
  if (retryAfterHeader) {
    const retryAfterSeconds = Number(retryAfterHeader);
    if (!Number.isNaN(retryAfterSeconds)) {
      return retryAfterSeconds * 1000;
    }
  }

  const jitter = Math.floor(Math.random() * 200);
  return env.baseBackoffMs * Math.pow(2, attempt) + jitter;
}

async function requestWithBackoff(config, attempt = 0) {
  try {
    const response = await client.request(config);
    return response.data;
  } catch (error) {
    const status = error?.response?.status;
    const retryAfterHeader = error?.response?.headers?.['retry-after'];

    if (status === 429 && attempt < env.maxRetries) {
      const backoffMs = computeBackoffMs(attempt, retryAfterHeader);
      await sleep(backoffMs);
      return requestWithBackoff(config, attempt + 1);
    }

    throw error;
  }
}

function queuedRequest(config) {
  return queue.enqueue(() => requestWithBackoff(config));
}

async function getSummonerByName(gameName, tagLine) {
  return queuedRequest({
    method: 'GET',
    url: `${regionBaseUrl}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
  });
}

async function getSummonerByPuuid(puuid) {
  return queuedRequest({
    method: 'GET',
    url: `${platformBaseUrl}/lol/summoner/v4/summoners/by-puuid/${puuid}`,
  });
}

async function getMatchIdsByPuuid(puuid, count = 60) {
  return queuedRequest({
    method: 'GET',
    url: `${regionBaseUrl}/lol/match/v5/matches/by-puuid/${puuid}/ids`,
    params: { start: 0, count },
  });
}

async function getMatch(matchId) {
  return queuedRequest({
    method: 'GET',
    url: `${regionBaseUrl}/lol/match/v5/matches/${matchId}`,
  });
}

async function getMatchTimeline(matchId) {
  return queuedRequest({
    method: 'GET',
    url: `${regionBaseUrl}/lol/match/v5/matches/${matchId}/timeline`,
  });
}

module.exports = {
  getSummonerByName,
  getSummonerByPuuid,
  getMatchIdsByPuuid,
  getMatch,
  getMatchTimeline,
};
