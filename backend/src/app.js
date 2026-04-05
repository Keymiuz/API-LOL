const express = require('express');
const matchupRoutes = require('./routes/matchupRoutes');
const { HttpError } = require('./utils/httpError');

const app = express();

app.use(express.json());
app.use('/api/matchup', matchupRoutes);

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.use((error, _req, res, _next) => {
  if (error instanceof HttpError) {
    return res.status(error.statusCode).json({
      message: error.message,
      details: error.details,
    });
  }

  return res.status(500).json({
    message: 'Internal server error',
    details: error.message,
  });
});

module.exports = app;
