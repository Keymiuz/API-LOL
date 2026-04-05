const { analyzeTopMatchup } = require('../services/matchupAnalyzerService');

async function analyze(req, res, next) {
  try {
    const result = await analyzeTopMatchup({
      gameName: req.query.gameName,
      tagLine: req.query.tagLine,
      championA: req.query.championA,
      championB: req.query.championB,
    });

    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = { analyze };
