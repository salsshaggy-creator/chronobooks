const BASE_URL = import.meta.env.VITE_API_URL || '/api';

let accessToken = null;

export function setAccessToken(token) {
  accessToken = token;
  if (token) sessionStorage.setItem('cb_token', token);
  else sessionStorage.removeItem('cb_token');
}

export function loadAccessToken() {
  accessToken = sessionStorage.getItem('cb_token');
  return accessToken;
}

async function request(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...options.headers,
    },
    credentials: 'include',
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || `Request failed (${res.status})`);
    if (body.code) err.code = body.code;
    err.status = res.status;
    throw err;
  }
  return body;
}

// Uploads/downloads bypass the JSON `request()` wrapper -- a multipart body must not get
// a `Content-Type: application/json` header (the browser needs to set its own boundary),
// and a download response is a binary blob, not JSON.
async function uploadFile(entityType, entityId, file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('entityType', entityType);
  formData.append('entityId', entityId);
  const res = await fetch(`${BASE_URL}/documents`, {
    method: 'POST',
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    body: formData,
    credentials: 'include',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Upload failed (${res.status})`);
  return body;
}

async function downloadFile(id, fileName) {
  const res = await fetch(`${BASE_URL}/documents/${id}/download`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  login: (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  listMyCompanies: () => request('/auth/companies'),
  switchCompany: (companyId) => request('/auth/switch-company', { method: 'POST', body: JSON.stringify({ companyId }) }),
  changePassword: (currentPassword, newPassword) => request('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  register: (fullName, email, password) => request('/auth/register', { method: 'POST', body: JSON.stringify({ fullName, email, password }) }),
  verifyEmail: (token) => request('/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) }),
  completeSetup: (payload) => request('/auth/complete-setup', { method: 'POST', body: JSON.stringify(payload) }),
  requestPasswordReset: (email) => request('/auth/request-password-reset', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token, newPassword) => request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, newPassword }) }),
  dashboardSummary: () => request('/dashboard/summary'),
  listExpenses: () => request('/expenses'),
  createExpense: (payload) => request('/expenses', { method: 'POST', body: JSON.stringify(payload) }),
  listCustomers: () => request('/customers'),
  createCustomer: (payload) => request('/customers', { method: 'POST', body: JSON.stringify(payload) }),
  listInvoices: () => request('/invoices'),
  createInvoice: (payload) => request('/invoices', { method: 'POST', body: JSON.stringify(payload) }),
  createReceipt: (payload) => request('/receipts', { method: 'POST', body: JSON.stringify(payload) }),
  listSuppliers: () => request('/suppliers'),
  createSupplier: (payload) => request('/suppliers', { method: 'POST', body: JSON.stringify(payload) }),
  listBills: () => request('/bills'),
  createBill: (payload) => request('/bills', { method: 'POST', body: JSON.stringify(payload) }),
  createSupplierPayment: (payload) => request('/supplier-payments', { method: 'POST', body: JSON.stringify(payload) }),
  profitAndLoss: (from, to) => request(`/reports/profit-and-loss?from=${from}&to=${to}`),
  balanceSheet: (asOf) => request(`/reports/balance-sheet?asOf=${asOf}`),
  trialBalance: (asOf) => request(`/reports/trial-balance?asOf=${asOf}`),
  costCentreBreakdown: (from, to) => request(`/reports/cost-centres?from=${from}&to=${to}`),
  getCompany: () => request('/company'),
  updateCompany: (payload) => request('/company', { method: 'PUT', body: JSON.stringify(payload) }),
  listUsers: () => request('/users'),
  listBankAccounts: () => request('/bank-accounts'),
  createBankAccount: (payload) => request('/bank-accounts', { method: 'POST', body: JSON.stringify(payload) }),
  bankDeposit: (payload) => request('/bank-accounts/deposit', { method: 'POST', body: JSON.stringify(payload) }),
  bankWithdraw: (payload) => request('/bank-accounts/withdraw', { method: 'POST', body: JSON.stringify(payload) }),
  bankTransfer: (payload) => request('/bank-accounts/transfer', { method: 'POST', body: JSON.stringify(payload) }),
  bankCharge: (payload) => request('/bank-accounts/charge', { method: 'POST', body: JSON.stringify(payload) }),
  bankInterest: (payload) => request('/bank-accounts/interest', { method: 'POST', body: JSON.stringify(payload) }),
  listBankTransactions: () => request('/bank-accounts/transactions'),
  listAvailablePayrollRuns: () => request('/payroll/available-runs'),
  listPayrollImports: () => request('/payroll/imports'),
  importPayrollRun: (runId) => request(`/payroll/import/${runId}`, { method: 'POST' }),
  listChartOfAccounts: () => request('/accounting/accounts'),
  getLedger: (accountId) => request(`/accounting/ledger/${accountId}`),
  listJournalEntries: () => request('/accounting/journal-entries'),
  getJournalEntry: (entryId) => request(`/accounting/journal-entries/${entryId}`),
  createManualJournalEntry: (payload) => request('/accounting/journal-entries', { method: 'POST', body: JSON.stringify(payload) }),
  createAccount: (payload) => request('/accounting/accounts', { method: 'POST', body: JSON.stringify(payload) }),
  updateAccount: (accountId, payload) => request(`/accounting/accounts/${accountId}`, { method: 'PUT', body: JSON.stringify(payload) }),

  listRoles: () => request('/roles'),
  createUser: (payload) => request('/users', { method: 'POST', body: JSON.stringify(payload) }),
  updateUser: (userId, payload) => request(`/users/${userId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  resetUserPassword: (userId, newPassword) => request(`/users/${userId}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword }) }),
  setUserActive: (userId, isActive) => request(`/users/${userId}/active`, { method: 'PUT', body: JSON.stringify({ isActive }) }),

  listBranches: () => request('/branches'),
  createBranch: (payload) => request('/branches', { method: 'POST', body: JSON.stringify(payload) }),
  listDepartments: () => request('/departments'),
  createDepartment: (payload) => request('/departments', { method: 'POST', body: JSON.stringify(payload) }),

  listPermissions: () => request('/permissions'),
  getRolePermissions: (roleId) => request(`/roles/${roleId}/permissions`),
  setRolePermissions: (roleId, permissionIds) => request(`/roles/${roleId}/permissions`, { method: 'PUT', body: JSON.stringify({ permissionIds }) }),

  listSystemCompanies: () => request('/system/companies'),
  createSystemCompany: (payload) => request('/system/companies', { method: 'POST', body: JSON.stringify(payload) }),
  deleteSystemCompany: (companyId, confirmName) => request(`/system/companies/${companyId}`, { method: 'DELETE', body: JSON.stringify({ confirmName }) }),

  getLicense: () => request('/license'),
  listPricingTiers: () => request('/license/pricing-tiers'),
  listPricingAddons: () => request('/license/pricing-addons'),
  updatePricingTier: (tierId, payload) => request(`/license/pricing-tiers/${tierId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  updatePricingAddon: (addonId, payload) => request(`/license/pricing-addons/${addonId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  getCompanyLicense: (companyId) => request(`/license/company/${companyId}`),
  generateLicense: (payload) => request('/license/generate', { method: 'POST', body: JSON.stringify(payload) }),
  requestUpgrade: (tierId) => request('/license/request-upgrade', { method: 'POST', body: JSON.stringify({ tierId }) }),
  listUpgradeRequests: () => request('/license/upgrade-requests'),

  listCurrencies: () => request('/parameters/currencies'),
  updateCurrency: (code, payload) => request(`/parameters/currencies/${code}`, { method: 'PUT', body: JSON.stringify(payload) }),
  listExchangeRates: () => request('/parameters/exchange-rates'),
  createExchangeRate: (payload) => request('/parameters/exchange-rates', { method: 'POST', body: JSON.stringify(payload) }),
  listTaxCodes: () => request('/parameters/tax-codes'),
  createTaxCode: (payload) => request('/parameters/tax-codes', { method: 'POST', body: JSON.stringify(payload) }),
  listCostCentres: () => request('/parameters/cost-centres'),
  createCostCentre: (payload) => request('/parameters/cost-centres', { method: 'POST', body: JSON.stringify(payload) }),
  listPaymentTerms: () => request('/parameters/payment-terms'),
  createPaymentTerm: (payload) => request('/parameters/payment-terms', { method: 'POST', body: JSON.stringify(payload) }),
  listNumberSequences: () => request('/parameters/number-sequences'),
  updateNumberSequence: (sequenceId, payload) => request(`/parameters/number-sequences/${sequenceId}`, { method: 'PUT', body: JSON.stringify(payload) }),
  listDocumentTypes: () => request('/parameters/document-types'),
  createDocumentType: (payload) => request('/parameters/document-types', { method: 'POST', body: JSON.stringify(payload) }),

  listAuditLog: () => request('/security/audit-log'),
  listLoginHistory: () => request('/security/login-history'),
  getPasswordPolicy: () => request('/security/password-policy'),
  updatePasswordPolicy: (payload) => request('/security/password-policy', { method: 'PUT', body: JSON.stringify(payload) }),

  getMySignature: () => request('/my-signature'),
  saveMySignature: (signatureData) => request('/my-signature', { method: 'PUT', body: JSON.stringify({ signatureData }) }),
  deleteMySignature: () => request('/my-signature', { method: 'DELETE' }),

  listApprovals: (scope) => request(`/approvals?scope=${scope}`),
  createDocumentApproval: (payload) => request('/approvals/documents', { method: 'POST', body: JSON.stringify(payload) }),
  approveRequest: (id, payload) => request(`/approvals/${id}/approve`, { method: 'POST', body: JSON.stringify(payload) }),
  rejectRequest: (id, comments) => request(`/approvals/${id}/reject`, { method: 'POST', body: JSON.stringify({ comments }) }),

  listInventoryItems: () => request('/inventory/items'),
  createInventoryItem: (payload) => request('/inventory/items', { method: 'POST', body: JSON.stringify(payload) }),
  updateInventoryItem: (id, payload) => request(`/inventory/items/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  listInventoryMovements: (id) => request(`/inventory/items/${id}/movements`),
  adjustInventoryStock: (id, payload) => request(`/inventory/items/${id}/adjust`, { method: 'POST', body: JSON.stringify(payload) }),

  listFixedAssets: () => request('/fixed-assets'),
  createFixedAsset: (payload) => request('/fixed-assets', { method: 'POST', body: JSON.stringify(payload) }),
  updateFixedAsset: (id, payload) => request(`/fixed-assets/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  runDepreciation: (asOfDate) => request('/fixed-assets/depreciate', { method: 'POST', body: JSON.stringify({ asOfDate }) }),
  disposeFixedAsset: (id, payload) => request(`/fixed-assets/${id}/dispose`, { method: 'POST', body: JSON.stringify(payload) }),
  listFixedAssetMovements: (id) => request(`/fixed-assets/${id}/movements`),

  getBudgets: (year) => request(`/budgets?year=${year}`),
  saveBudgets: (year, entries) => request('/budgets', { method: 'PUT', body: JSON.stringify({ year, entries }) }),
  getBudgetVsActual: (year, throughMonth) => request(`/reports/budget-vs-actual?year=${year}&throughMonth=${throughMonth}`),

  getReconciliationState: (bankAccountId, asOf) => request(`/bank-accounts/${bankAccountId}/reconciliation?asOf=${asOf}`),
  completeReconciliation: (bankAccountId, payload) => request(`/bank-accounts/${bankAccountId}/reconciliation`, { method: 'POST', body: JSON.stringify(payload) }),
  listReconciliations: (bankAccountId) => request(`/bank-accounts/${bankAccountId}/reconciliations`),

  listRecurring: () => request('/recurring'),
  createRecurring: (payload) => request('/recurring', { method: 'POST', body: JSON.stringify(payload) }),
  updateRecurring: (id, payload) => request(`/recurring/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  runDueRecurring: (asOfDate) => request('/recurring/run', { method: 'POST', body: JSON.stringify({ asOfDate }) }),
  listRecurringRuns: (id) => request(`/recurring/${id}/runs`),

  listQuotes: () => request('/quotes'),
  createQuote: (payload) => request('/quotes', { method: 'POST', body: JSON.stringify(payload) }),
  updateQuoteStatus: (id, status) => request(`/quotes/${id}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  convertQuote: (id) => request(`/quotes/${id}/convert`, { method: 'POST' }),

  listDocuments: (entityType, entityId) => request(`/documents?entityType=${entityType}&entityId=${entityId}`),
  uploadDocument: (entityType, entityId, file) => uploadFile(entityType, entityId, file),
  downloadDocument: (id, fileName) => downloadFile(id, fileName),
  deleteDocument: (id) => request(`/documents/${id}`, { method: 'DELETE' }),

  listNotifications: () => request('/notifications'),
  dismissNotification: (key) => request(`/notifications/${encodeURIComponent(key)}/dismiss`, { method: 'POST' }),
  dismissAllNotifications: () => request('/notifications/dismiss-all', { method: 'POST' }),

  getAiSettings: () => request('/ai/settings'),
  updateAiSettings: (payload) => request('/ai/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  clearAiSettings: () => request('/ai/settings', { method: 'DELETE' }),
  askAssistant: (messages) => request('/ai/ask', { method: 'POST', body: JSON.stringify({ messages }) }),
};
