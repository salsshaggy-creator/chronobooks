const quoteService = require('../services/quote.service');

async function listQuotes(req, res) {
  const { companyId } = req.user;
  const quotes = await quoteService.listQuotes(companyId);
  res.json({ quotes });
}

async function createQuote(req, res) {
  const { companyId, sub: userId } = req.user;
  const result = await quoteService.createQuote(companyId, userId, req.body);
  res.status(201).json(result);
}

async function updateStatus(req, res) {
  const { companyId } = req.user;
  const { id } = req.params;
  const result = await quoteService.updateQuoteStatus(companyId, id, req.body.status);
  res.json(result);
}

async function convert(req, res) {
  const { companyId, sub: userId } = req.user;
  const { id } = req.params;
  const result = await quoteService.convertQuote(companyId, userId, id);
  res.status(201).json(result);
}

module.exports = { listQuotes, createQuote, updateStatus, convert };
