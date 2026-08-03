const { getDashboardSummary } = require('../services/dashboard.service');

async function summary(req, res) {
  const { companyId } = req.user;
  const data = await getDashboardSummary(companyId);
  res.json(data);
}

module.exports = { summary };
