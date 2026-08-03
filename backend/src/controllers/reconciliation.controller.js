const reconciliationService = require('../services/reconciliation.service');

function today() {
  return new Date().toISOString().slice(0, 10);
}

async function getState(req, res) {
  const { companyId } = req.user;
  const { bankAccountId } = req.params;
  const asOfDate = req.query.asOf || today();
  const state = await reconciliationService.getReconciliationState(companyId, bankAccountId, asOfDate);
  res.json(state);
}

async function complete(req, res) {
  const { companyId, sub: userId } = req.user;
  const { bankAccountId } = req.params;
  const result = await reconciliationService.completeReconciliation(companyId, userId, bankAccountId, req.body);
  res.status(201).json(result);
}

async function listHistory(req, res) {
  const { companyId } = req.user;
  const { bankAccountId } = req.params;
  const reconciliations = await reconciliationService.listReconciliations(companyId, bankAccountId);
  res.json({ reconciliations });
}

module.exports = { getState, complete, listHistory };
