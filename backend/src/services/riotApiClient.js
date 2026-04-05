const axios = require('axios');
const env = require('../config/env');
const { RequestQueue } = require('./requestQueue');

const platformBaseUrl = `https://${env.riotPlatform}.api.riotgames.com`;
const regionBaseUrl = `https://${env.riotRegion}.api.riotgames.com`;
const queue = new RequestQueue(Math.max(Number(env.maxQueueConcurrency) || 0, 4));

const cache = new Map();
const inFlight = new Map();

const client = axios.create({
  timeout: env.requestTimeoutMs,
  headers: {
    'X-Riot-Token': env.riotApiKey,
  },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildCacheKey(config) {
  const method = String(config.method || 'GET').toUpperCase();
  const params = Object.entries(config.params || {})
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  return `${method}:${config.url}?${params}`;
}

function getCachedValue(cacheKey) {
  const cachedEntry = cache.get(cacheKey);
  if (!cachedEntry) {
    return null;
  }

  if (cachedEntry.expiresAt <= Date.now()) {
    cache.delete(cacheKey);
    return null;
  }

  return cachedEntry.value;
}

function setCachedValue(cacheKey, value, ttlMs) {
  if (!ttlMs) {
    return;
  }

  cache.set(cacheKey, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

function hasCachedResponse(config) {
  return Boolean(getCachedValue(buildCacheKey(config)));
}

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

function queuedRequest(config, { cacheTtlMs = 0 } = {}) {
  const cacheKey = buildCacheKey(config);

  if (cacheTtlMs > 0) {
    const cachedValue = getCachedValue(cacheKey);
    if (cachedValue) {
      return Promise.resolve(cachedValue);
    }
  }

  const pendingRequest = inFlight.get(cacheKey);
  if (pendingRequest) {
    return pendingRequest;
  }

  const requestPromise = queue
    .enqueue(() => requestWithBackoff(config))
    .then((data) => {
      setCachedValue(cacheKey, data, cacheTtlMs);
      return data;
    })
    .finally(() => {
      inFlight.delete(cacheKey);
    });

  inFlight.set(cacheKey, requestPromise);
  return requestPromise;
}

async function getAccountByRiotId(gameName, tagLine) {
  return queuedRequest(
    {
      method: 'GET',
      url: `${regionBaseUrl}/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(gameName)}/${encodeURIComponent(tagLine)}`,
    },
    { cacheTtlMs: 10 * 60 * 1000 },
  );
}

async function getSummonerByPuuid(puuid) {
  return queuedRequest(
    {
      method: 'GET',
      url: `${platformBaseUrl}/lol/summoner/v4/summoners/by-puuid/${puuid}`,
    },
    { cacheTtlMs: 10 * 60 * 1000 },
  );
}

async function getMatchIdsByPuuid(puuid, { start = 0, count = 60 } = {}) {
  return queuedRequest(
    {
      method: 'GET',
      url: `${regionBaseUrl}/lol/match/v5/matches/by-puuid/${puuid}/ids`,
      params: { start, count },
    },
    { cacheTtlMs: 2 * 60 * 1000 },
  );
}

async function getMatch(matchId) {
  return queuedRequest(
    {
      method: 'GET',
      url: `${regionBaseUrl}/lol/match/v5/matches/${matchId}`,
    },
    { cacheTtlMs: 30 * 60 * 1000 },
  );
}

async function getMatchTimeline(matchId) {
  return queuedRequest(
    {
      method: 'GET',
      url: `${regionBaseUrl}/lol/match/v5/matches/${matchId}/timeline`,
    },
    { cacheTtlMs: 30 * 60 * 1000 },
  );
}

module.exports = {
  getAccountByRiotId,
  getSummonerByPuuid,
  getMatchIdsByPuuid,
  getMatch,
  getMatchTimeline,
  hasCachedMatch(matchId) {
    return hasCachedResponse({
      method: 'GET',
      url: `${regionBaseUrl}/lol/match/v5/matches/${matchId}`,
    });
  },
};
