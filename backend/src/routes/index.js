const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const asyncHandler = require('../middleware/asyncHandler');
const authController = require('../controllers/auth.controller');
const signupController = require('../controllers/signup.controller');
const dashboardController = require('../controllers/dashboard.controller');
const expenseController = require('../controllers/expense.controller');
const customerController = require('../controllers/customer.controller');
const invoiceController = require('../controllers/invoice.controller');
const receiptController = require('../controllers/receipt.controller');
const supplierController = require('../controllers/supplier.controller');
const billController = require('../controllers/bill.controller');
const supplierPaymentController = require('../controllers/supplierPayment.controller');
const reportController = require('../controllers/report.controller');
const companyController = require('../controllers/company.controller');
const userController = require('../controllers/user.controller');
const bankController = require('../controllers/bank.controller');
const payrollController = require('../controllers/payroll.controller');
const accountingController = require('../controllers/accounting.controller');
const orgController = require('../controllers/org.controller');
const roleController = require('../controllers/role.controller');
const systemController = require('../controllers/system.controller');
const licenseController = require('../controllers/license.controller');
const parametersController = require('../controllers/parameters.controller');
const securityController = require('../controllers/security.controller');
const aiController = require('../controllers/ai.controller');
const signatureController = require('../controllers/signature.controller');
const approvalController = require('../controllers/approval.controller');
const inventoryController = require('../controllers/inventory.controller');
const fixedAssetController = require('../controllers/fixedAsset.controller');
const budgetController = require('../controllers/budget.controller');
const reconciliationController = require('../controllers/reconciliation.controller');
const recurringController = require('../controllers/recurring.controller');
const quoteController = require('../controllers/quote.controller');
const documentController = require('../controllers/document.controller');
const uploadMiddleware = require('../middleware/upload');
const notificationController = require('../controllers/notification.controller');

const APPROVER_ROLES = ['administrator', 'finance_manager', 'super_administrator'];

const ADMIN_ROLES = ['administrator', 'super_administrator'];

// Item CRUD and stock adjustments are restricted to roles that should be touching stock
// levels/costs; anyone authenticated can still read the list (e.g. to pick an item on an
// invoice or bill line).
const INVENTORY_MANAGE_ROLES = ['administrator', 'accountant', 'inventory_officer', 'super_administrator'];

// No dedicated "fixed assets officer" role exists yet, so registering, depreciating,
// and disposing of assets is restricted the same way manual journal entries are.
const FIXED_ASSET_MANAGE_ROLES = ['administrator', 'accountant', 'super_administrator'];

const BUDGET_MANAGE_ROLES = ['administrator', 'accountant', 'finance_manager', 'super_administrator'];

const RECONCILIATION_ROLES = ['administrator', 'accountant', 'finance_manager', 'super_administrator'];

const RECURRING_MANAGE_ROLES = ['administrator', 'accountant', 'finance_manager', 'super_administrator'];

const router = express.Router();

router.post('/auth/login', asyncHandler(authController.login));
router.post('/auth/refresh', asyncHandler(authController.refresh));
router.get('/auth/me', requireAuth, asyncHandler(authController.me));
router.post('/auth/logout', requireAuth, asyncHandler(authController.logout));
router.get('/auth/companies', requireAuth, asyncHandler(authController.listMyCompanies));
router.post('/auth/switch-company', requireAuth, asyncHandler(authController.switchCompany));
router.post('/auth/change-password', requireAuth, asyncHandler(authController.changePassword));

router.post('/auth/register', asyncHandler(signupController.register));
router.post('/auth/verify-email', asyncHandler(signupController.verifyEmail));
router.post('/auth/complete-setup', requireAuth, asyncHandler(signupController.completeSetup));
router.post('/auth/request-password-reset', asyncHandler(signupController.requestPasswordReset));
router.post('/auth/reset-password', asyncHandler(signupController.resetPassword));

router.get('/dashboard/summary', requireAuth, asyncHandler(dashboardController.summary));

router.get('/expenses', requireAuth, asyncHandler(expenseController.listExpenses));
router.post('/expenses', requireAuth, asyncHandler(expenseController.createExpense));

router.get('/customers', requireAuth, asyncHandler(customerController.listCustomers));
router.post('/customers', requireAuth, asyncHandler(customerController.createCustomer));
router.put('/customers/:id', requireAuth, asyncHandler(customerController.updateCustomer));
router.delete('/customers/:id', requireAuth, asyncHandler(customerController.deleteCustomer));
router.get('/customers/:id/statement', requireAuth, asyncHandler(customerController.getCustomerStatement));

router.get('/invoices', requireAuth, asyncHandler(invoiceController.listInvoices));
router.get('/invoices/:id', requireAuth, asyncHandler(invoiceController.getInvoice));
router.post('/invoices', requireAuth, asyncHandler(invoiceController.createInvoice));
router.post('/invoices/:id/void', requireAuth, requireRole('administrator', 'accountant'), asyncHandler(invoiceController.voidInvoice));

router.post('/receipts', requireAuth, asyncHandler(receiptController.createReceipt));

router.get('/suppliers', requireAuth, asyncHandler(supplierController.listSuppliers));
router.post('/suppliers', requireAuth, asyncHandler(supplierController.createSupplier));
router.put('/suppliers/:id', requireAuth, asyncHandler(supplierController.updateSupplier));
router.delete('/suppliers/:id', requireAuth, asyncHandler(supplierController.deleteSupplier));
router.get('/suppliers/:id/statement', requireAuth, asyncHandler(supplierController.getSupplierStatement));

router.get('/bills', requireAuth, asyncHandler(billController.listBills));
router.get('/bills/:id', requireAuth, asyncHandler(billController.getBill));
router.post('/bills', requireAuth, asyncHandler(billController.createBill));
router.post('/bills/:id/void', requireAuth, requireRole('administrator', 'accountant'), asyncHandler(billController.voidBill));

router.post('/supplier-payments', requireAuth, asyncHandler(supplierPaymentController.createSupplierPayment));

router.get('/reports/profit-and-loss', requireAuth, asyncHandler(reportController.getProfitAndLoss));
router.get('/reports/balance-sheet', requireAuth, asyncHandler(reportController.getBalanceSheet));
router.get('/reports/trial-balance', requireAuth, asyncHandler(reportController.getTrialBalance));
router.get('/reports/cost-centres', requireAuth, asyncHandler(reportController.getCostCentreBreakdown));
router.get('/reports/cash-flow', requireAuth, asyncHandler(reportController.getCashFlow));

router.get('/company', requireAuth, asyncHandler(companyController.getCompany));
router.put('/company', requireAuth, requireRole('administrator'), asyncHandler(companyController.updateCompany));

router.get('/users', requireAuth, asyncHandler(userController.listUsers));
router.post('/users', requireAuth, requireRole(...ADMIN_ROLES), asyncHandler(userController.createUser));
router.put('/users/:userId', requireAuth, requireRole(...ADMIN_ROLES), asyncHandler(userController.updateUser));
router.post('/users/:userId/reset-password', requireAuth, requireRole(...ADMIN_ROLES), asyncHandler(userController.resetPassword));
router.put('/users/:userId/active', requireAuth, requireRole(...ADMIN_ROLES), asyncHandler(userController.setActive));

router.get('/branches', requireAuth, asyncHandler(orgController.listBranches));
router.post('/branches', requireAuth, requireRole(...ADMIN_ROLES), asyncHandler(orgController.createBranch));
router.get('/departments', requireAuth, asyncHandler(orgController.listDepartments));
router.post('/departments', requireAuth, requireRole(...ADMIN_ROLES), asyncHandler(orgController.createDepartment));

router.get('/roles', requireAuth, asyncHandler(roleController.listRoles));
router.get('/permissions', requireAuth, requireRole(...ADMIN_ROLES), asyncHandler(roleController.listPermissions));
router.get('/roles/:roleId/permissions', requireAuth, requireRole(...ADMIN_ROLES), asyncHandler(roleController.getRolePermissions));
router.put('/roles/:roleId/permissions', requireAuth, requireRole(...ADMIN_ROLES), asyncHandler(roleController.setRolePermissions));

router.get('/system/companies', requireAuth, requireRole('super_administrator'), asyncHandler(systemController.listCompanies));
router.post('/system/companies', requireAuth, requireRole('super_administrator'), asyncHandler(systemController.createCompany));

router.get('/license', requireAuth, asyncHandler(licenseController.getMyLicense));
router.get('/license/pricing-tiers', requireAuth, asyncHandler(licenseController.listPricingTiers));
router.get('/license/pricing-addons', requireAuth, asyncHandler(licenseController.listPricingAddons));
router.put('/license/pricing-tiers/:tierId', requireAuth, requireRole('super_administrator'), asyncHandler(licenseController.updatePricingTier));
router.put('/license/pricing-addons/:addonId', requireAuth, requireRole('super_administrator'), asyncHandler(licenseController.updatePricingAddon));
router.get('/license/company/:companyId', requireAuth, requireRole('super_administrator'), asyncHandler(licenseController.getCompanyLicense));
router.post('/license/generate', requireAuth, requireRole('super_administrator'), asyncHandler(licenseController.generateLicense));
router.post('/license/request-upgrade', requireAuth, requireRole(...ADMIN_ROLES), asyncHandler(licenseController.requestUpgrade));
router.get('/license/upgrade-requests', requireAuth, requireRole('super_administrator'), asyncHandler(licenseController.listUpgradeRequests));
router.delete('/system/companies/:companyId', requireAuth, requireRole('super_administrator'), asyncHandler(licenseController.deleteCompany));

router.get('/bank-accounts', requireAuth, asyncHandler(bankController.listBankAccounts));
router.post('/bank-accounts', requireAuth, asyncHandler(bankController.createBankAccount));
router.put('/bank-accounts/:id', requireAuth, asyncHandler(bankController.updateBankAccount));
router.post('/bank-accounts/deposit', requireAuth, asyncHandler(bankController.deposit));
router.post('/bank-accounts/withdraw', requireAuth, asyncHandler(bankController.withdraw));
router.post('/bank-accounts/transfer', requireAuth, asyncHandler(bankController.transfer));
router.post('/bank-accounts/charge', requireAuth, asyncHandler(bankController.charge));
router.post('/bank-accounts/interest', requireAuth, asyncHandler(bankController.interest));
router.get('/bank-accounts/transactions', requireAuth, asyncHandler(bankController.listTransactions));

router.get('/payroll/available-runs', requireAuth, asyncHandler(payrollController.listAvailableRuns));
router.get('/payroll/imports', requireAuth, asyncHandler(payrollController.listImports));
// No requireRole here: when the company requires approval for payroll imports, any
// authenticated user can submit the request — the role restriction is enforced inside
// importRun() itself, but only for the direct (no-approval-needed) posting path.
router.post('/payroll/import/:runId', requireAuth, asyncHandler(payrollController.importRun));

router.get('/accounting/accounts', requireAuth, asyncHandler(accountingController.listAccounts));
router.get('/accounting/payable-from-accounts', requireAuth, asyncHandler(accountingController.listPayableFromAccounts));
router.get('/accounting/ledger/:accountId', requireAuth, asyncHandler(accountingController.getLedger));
router.get('/accounting/journal-entries', requireAuth, asyncHandler(accountingController.listJournalEntries));
router.get('/accounting/journal-entries/:entryId', requireAuth, asyncHandler(accountingController.getJournalEntryLines));
router.post('/accounting/journal-entries', requireAuth, requireRole('administrator', 'accountant'), asyncHandler(accountingController.createJournalEntry));
router.post('/accounting/journal-entries/:entryId/void', requireAuth, requireRole('administrator', 'accountant'), asyncHandler(accountingController.voidJournalEntry));
router.post('/accounting/accounts', requireAuth, requireRole('administrator', 'accountant'), asyncHandler(accountingController.createAccount));
router.put('/accounting/accounts/:accountId', requireAuth, requireRole('administrator', 'accountant'), asyncHandler(accountingController.updateAccount));

router.get('/parameters/currencies', requireAuth, asyncHandler(parametersController.listCurrencies));
router.put('/parameters/currencies/:code', requireAuth, requireRole('super_administrator'), asyncHandler(parametersController.updateCurrency));

router.get('/parameters/exchange-rates', requireAuth, asyncHandler(parametersController.listExchangeRates));
router.post('/parameters/exchange-rates', requireAuth, requireRole(...ADMIN_ROLES), asyncHandler(parametersController.createExchangeRate));

router.get('/parameters/tax-codes', requireAuth, asyncHandler(parametersController.listTaxCodes));
router.post('/parameters/tax-codes', requireAuth, requireRole(...ADMIN_ROLES), asyncHandler(parametersController.createTaxCode));

router.get('/parameters/cost-centres', requireAuth, asyncHandler(parametersController.listCostCentres));
router.post('/parameters/cost-centres', requireAuth, requireRole(...ADMIN_ROLES), asyncHandler(parametersController.createCostCentre));

router.get('/parameters/payment-terms', requireAuth, asyncHandler(parametersController.listPaymentTerms));
router.post('/parameters/payment-terms', requireAuth, requireRole(...ADMIN_ROLES), asyncHandler(parametersController.createPaymentTerm));

router.get('/parameters/number-sequences', requireAuth, asyncHandler(parametersController.listNumberSequences));
router.put('/parameters/number-sequences/:sequenceId', requireAuth, requireRole(...ADMIN_ROLES), asyncHandler(parametersController.updateNumberSequence));

router.get('/parameters/document-types', requireAuth, asyncHandler(parametersController.listDocumentTypes));
router.post('/parameters/document-types', requireAuth, requireRole(...ADMIN_ROLES), asyncHandler(parametersController.createDocumentType));

router.get('/security/audit-log', requireAuth, requireRole(...ADMIN_ROLES), asyncHandler(securityController.listAuditLog));
router.get('/security/login-history', requireAuth, requireRole(...ADMIN_ROLES), asyncHandler(securityController.listLoginHistory));
router.get('/security/password-policy', requireAuth, requireRole(...ADMIN_ROLES), asyncHandler(securityController.getPasswordPolicy));
router.put('/security/password-policy', requireAuth, requireRole(...ADMIN_ROLES), asyncHandler(securityController.updatePasswordPolicy));

router.get('/ai/settings', requireAuth, asyncHandler(aiController.getAiSettings));
router.put('/ai/settings', requireAuth, requireRole(...ADMIN_ROLES), asyncHandler(aiController.updateAiSettings));
router.delete('/ai/settings', requireAuth, requireRole(...ADMIN_ROLES), asyncHandler(aiController.clearAiSettings));
router.post('/ai/ask', requireAuth, asyncHandler(aiController.ask));

router.get('/my-signature', requireAuth, asyncHandler(signatureController.getMySignature));
router.put('/my-signature', requireAuth, asyncHandler(signatureController.saveMySignature));
router.delete('/my-signature', requireAuth, asyncHandler(signatureController.deleteMySignature));

router.get('/approvals', requireAuth, asyncHandler(approvalController.listApprovalRequests));
router.post('/approvals/documents', requireAuth, asyncHandler(approvalController.createDocumentRequest));
router.post('/approvals/:id/approve', requireAuth, requireRole(...APPROVER_ROLES), asyncHandler(approvalController.approve));
router.post('/approvals/:id/reject', requireAuth, requireRole(...APPROVER_ROLES), asyncHandler(approvalController.reject));

router.get('/inventory/items', requireAuth, asyncHandler(inventoryController.listItems));
router.post('/inventory/items', requireAuth, requireRole(...INVENTORY_MANAGE_ROLES), asyncHandler(inventoryController.createItem));
router.put('/inventory/items/:id', requireAuth, requireRole(...INVENTORY_MANAGE_ROLES), asyncHandler(inventoryController.updateItem));
router.get('/inventory/items/:id/movements', requireAuth, asyncHandler(inventoryController.listMovements));
router.post('/inventory/items/:id/adjust', requireAuth, requireRole(...INVENTORY_MANAGE_ROLES), asyncHandler(inventoryController.adjustStock));

router.get('/fixed-assets', requireAuth, asyncHandler(fixedAssetController.listAssets));
router.post('/fixed-assets', requireAuth, requireRole(...FIXED_ASSET_MANAGE_ROLES), asyncHandler(fixedAssetController.createAsset));
router.put('/fixed-assets/:id', requireAuth, requireRole(...FIXED_ASSET_MANAGE_ROLES), asyncHandler(fixedAssetController.updateAsset));
router.post('/fixed-assets/depreciate', requireAuth, requireRole(...FIXED_ASSET_MANAGE_ROLES), asyncHandler(fixedAssetController.runDepreciation));
router.post('/fixed-assets/:id/dispose', requireAuth, requireRole(...FIXED_ASSET_MANAGE_ROLES), asyncHandler(fixedAssetController.disposeAsset));
router.get('/fixed-assets/:id/movements', requireAuth, asyncHandler(fixedAssetController.listMovements));

router.get('/budgets', requireAuth, asyncHandler(budgetController.getBudgets));
router.put('/budgets', requireAuth, requireRole(...BUDGET_MANAGE_ROLES), asyncHandler(budgetController.saveBudgets));
router.get('/reports/budget-vs-actual', requireAuth, asyncHandler(budgetController.getBudgetVsActual));

router.get('/bank-accounts/:bankAccountId/reconciliation', requireAuth, requireRole(...RECONCILIATION_ROLES), asyncHandler(reconciliationController.getState));
router.post('/bank-accounts/:bankAccountId/reconciliation', requireAuth, requireRole(...RECONCILIATION_ROLES), asyncHandler(reconciliationController.complete));
router.get('/bank-accounts/:bankAccountId/reconciliations', requireAuth, requireRole(...RECONCILIATION_ROLES), asyncHandler(reconciliationController.listHistory));

router.get('/recurring', requireAuth, asyncHandler(recurringController.listRecurring));
router.post('/recurring', requireAuth, requireRole(...RECURRING_MANAGE_ROLES), asyncHandler(recurringController.createRecurring));
router.put('/recurring/:id', requireAuth, requireRole(...RECURRING_MANAGE_ROLES), asyncHandler(recurringController.updateRecurring));
router.post('/recurring/run', requireAuth, requireRole(...RECURRING_MANAGE_ROLES), asyncHandler(recurringController.runDue));
router.get('/recurring/:id/runs', requireAuth, asyncHandler(recurringController.listRuns));

router.get('/quotes', requireAuth, asyncHandler(quoteController.listQuotes));
router.post('/quotes', requireAuth, asyncHandler(quoteController.createQuote));
router.put('/quotes/:id/status', requireAuth, asyncHandler(quoteController.updateStatus));
router.post('/quotes/:id/convert', requireAuth, asyncHandler(quoteController.convert));

// Attaching a receipt to your own invoice/bill/expense needs no special role -- it's the
// same "any authenticated user in the company" access Sales/Purchases/Expenses already
// have. Deleting someone else's attachment is gated inside the service itself (uploader
// or a DOCUMENT_MANAGE_ROLES role), not here, since it depends on who uploaded it.
router.post('/documents', requireAuth, uploadMiddleware, asyncHandler(documentController.upload));
router.get('/documents', requireAuth, asyncHandler(documentController.list));
router.get('/documents/:id/download', requireAuth, asyncHandler(documentController.download));
router.delete('/documents/:id', requireAuth, asyncHandler(documentController.remove));

// Read-only aggregation over data the user can already see (their own overdue invoices/
// bills, low stock, recurring due, pending-approvals count) -- no role gate beyond being
// signed in, same as the Dashboard KPIs those numbers are drawn from.
router.get('/notifications', requireAuth, asyncHandler(notificationController.list));
router.post('/notifications/:key/dismiss', requireAuth, asyncHandler(notificationController.dismiss));
router.post('/notifications/dismiss-all', requireAuth, asyncHandler(notificationController.dismissAll));

module.exports = router;
