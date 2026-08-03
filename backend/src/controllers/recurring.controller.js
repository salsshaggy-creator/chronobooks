const recurringService = require('../services/recurring.service');

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function listRecurring(req, res) {
  const { companyId } = req.user;
  const recurringTransactions = await recurringService.listRecurring(companyId);
  res.json({ recurringTransactions });
}

async function createRecurring(req, res) {
  const { companyId, sub: userId } = req.user;
  const result = await recurringService.createRecurring(companyId, userId, req.body);
  res.status(201).json(result);
}

async function updateRecurring(req, res) {
  const { companyId } = req.user;
  const { id } = req.params;
  const result = await recurringService.updateRecurring(companyId, id, req.body);
  res.json(result);
}

async function runDue(req, res) {
  const { companyId, sub: userId } = req.user;
  const asOfDate = req.body?.asOfDate || today();
  const result = await recurringService.runDue(companyId, userId, asOfDate);
  res.json(result);
}

async function listRuns(req, res) {
  const { companyId } = req.user;
  const { id } = req.params;
  const runs = await recurringService.listRuns(companyId, id);
  res.json({ runs });
}

module.exports = { listRecurring, createRecurring, updateRecurring, runDue, listRuns };
