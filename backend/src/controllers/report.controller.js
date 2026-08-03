const { profitAndLoss, balanceSheet, trialBalance, costCentreBreakdown } = require('../services/report.service');

function defaultFromDate() {
  const d = new Date();
  return `${d.getFullYear()}-01-01`;
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

async function getProfitAndLoss(req, res) {
  const { companyId } = req.user;
  const from = req.query.from || defaultFromDate();
  const to = req.query.to || today();
  res.json(await profitAndLoss(companyId, from, to));
}

async function getBalanceSheet(req, res) {
  const { companyId } = req.user;
  const asOf = req.query.asOf || today();
  res.json(await balanceSheet(companyId, asOf));
}

async function getTrialBalance(req, res) {
  const { companyId } = req.user;
  const asOf = req.query.asOf || today();
  res.json(await trialBalance(companyId, asOf));
}

async function getCostCentreBreakdown(req, res) {
  const { companyId } = req.user;
  const from = req.query.from || defaultFromDate();
  const to = req.query.to || today();
  res.json(await costCentreBreakdown(companyId, from, to));
}

module.exports = { getProfitAndLoss, getBalanceSheet, getTrialBalance, getCostCentreBreakdown };
