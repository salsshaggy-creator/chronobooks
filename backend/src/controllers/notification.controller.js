const notificationService = require('../services/notification.service');
const { httpError } = require('../services/approval.service');

async function list(req, res) {
  const { companyId, sub: userId, role } = req.user;
  const result = await notificationService.listNotifications(companyId, userId, role);
  res.json(result);
}

async function dismiss(req, res) {
  const { companyId, sub: userId } = req.user;
  const { key } = req.params;
  if (!key) throw httpError(400, 'A notification key is required.');
  const result = await notificationService.dismiss(companyId, userId, key);
  res.json(result);
}

async function dismissAll(req, res) {
  const { companyId, sub: userId, role } = req.user;
  const result = await notificationService.dismissAll(companyId, userId, role);
  res.json(result);
}

module.exports = { list, dismiss, dismissAll };
