const dotenv = require('dotenv');

dotenv.config();

const required = ['RIOT_API_KEY', 'RIOT_REGION', 'RIOT_PLATFORM'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required env var: ${key}`);
  }
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  nodeEnv: process.env.NODE_ENV || 'development',
  riotApiKey: process.env.RIOT_API_KEY,
  riotRegion: process.env.RIOT_REGION,
  riotPlatform: process.env.RIOT_PLATFORM,
  requestTimeoutMs: Number(process.env.REQUEST_TIMEOUT_MS || 12000),
  maxRetries: Number(process.env.MAX_RETRIES || 5),
  baseBackoffMs: Number(process.env.BASE_BACKOFF_MS || 750),
  maxQueueConcurrency: Number(process.env.MAX_QUEUE_CONCURRENCY || 2),
};
