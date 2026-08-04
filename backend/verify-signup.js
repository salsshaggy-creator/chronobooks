// Smoke test for self-serve signup: register -> blocked login before verifying -> verify
// (auto-login) -> company-setup wizard -> 2-user seat cap -> forgot/reset password ->
// upgrade-request flow reaching the Super Administrator's pending-requests list and being
// cleared by generateLicense.
require('dotenv').config();
const app = require('./src/app');

function log(label, data) {
  console.log(`\n== ${label} ==`);
  console.log(JSON.stringify(data, null, 2));
}

async function main() {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  const login = async (email, password) => {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    return { status: res.status, body: await res.json() };
  };

  const stamp = Date.now();
  const email = `signup-test-${stamp}@example.com`;
  const password = 'TrialUser!12345';

  // 1. Register — creates a placeholder company + unverified Administrator.
  const registerRes = await fetch(`${base}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fullName: 'Signup Test User', email, password }),
  });
  const registerBody = await registerRes.json();
  log('register', registerBody);
  const registerOk = registerRes.status === 201 && registerBody.email === email && typeof registerBody.verificationUrl === 'string';

  // 2. Logging in before verifying must be blocked.
  const preVerifyLogin = await login(email, password);
  const preVerifyBlockedOk = preVerifyLogin.status === 403 && preVerifyLogin.body.code === 'EMAIL_NOT_VERIFIED';
  log('login before verify', preVerifyLogin);

  // 3. Verify — extracts the token from the (stubbed) verification link, mirrors login's
  // token issuance, and reports needsSetup since the placeholder company isn't finished.
  const token = new URLSearchParams(registerBody.verificationUrl.split('?')[1]).get('token');
  const verifyRes = await fetch(`${base}/api/auth/verify-email`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  const verifyBody = await verifyRes.json();
  log('verify-email', { ...verifyBody, accessToken: verifyBody.accessToken ? '(present)' : null });
  const verifyOk = verifyRes.ok && !!verifyBody.accessToken && verifyBody.needsSetup === true;

  let headers = { Authorization: `Bearer ${verifyBody.accessToken}`, 'Content-Type': 'application/json' };

  // 4. Company should read back as self-serve and not-yet-set-up.
  const companyBeforeSetup = await (await fetch(`${base}/api/company`, { headers })).json();
  const beforeSetupOk = companyBeforeSetup.selfServe === true && companyBeforeSetup.setupCompleted === false;
  log('company before setup', companyBeforeSetup);

  // 5. Complete setup — renames the placeholder, seeds COA + Head Office branch.
  const setupRes = await fetch(`${base}/api/auth/complete-setup`, {
    method: 'POST', headers,
    body: JSON.stringify({ companyName: 'Signup Test Co', currency: 'GHS', country: 'Ghana', industry: 'Retail', companyType: 'Sole Proprietor' }),
  });
  const setupBody = await setupRes.json();
  const setupOk = setupRes.ok && setupBody.companyName === 'Signup Test Co';
  log('complete-setup', setupBody);

  const companyAfterSetup = await (await fetch(`${base}/api/company`, { headers })).json();
  const afterSetupOk = companyAfterSetup.setupCompleted === true && companyAfterSetup.name === 'Signup Test Co';
  log('company after setup', companyAfterSetup);

  const accountsAfterSetup = await (await fetch(`${base}/api/accounting/accounts`, { headers })).json();
  const coaSeededOk = Array.isArray(accountsAfterSetup.accounts) && accountsAfterSetup.accounts.length > 0;

  // 6. Seat cap — this company started with 1 user (the registrant) and is capped at 2.
  // Adding a second user should succeed; a third should be rejected.
  const roles = (await (await fetch(`${base}/api/roles`, { headers })).json()).roles;
  const cashierRole = roles.find((r) => r.code === 'cashier');
  const secondUserRes = await fetch(`${base}/api/users`, {
    method: 'POST', headers,
    body: JSON.stringify({ firstName: 'Second', lastName: 'User', email: `second-${stamp}@example.com`, password: 'SecondUser!123', roleId: cashierRole.id }),
  });
  const secondUserOk = secondUserRes.ok;

  const thirdUserRes = await fetch(`${base}/api/users`, {
    method: 'POST', headers,
    body: JSON.stringify({ firstName: 'Third', lastName: 'User', email: `third-${stamp}@example.com`, password: 'ThirdUser!123', roleId: cashierRole.id }),
  });
  const thirdUserBody = await thirdUserRes.json();
  const thirdUserBlockedOk = thirdUserRes.status === 403 && thirdUserBody.code === 'SEAT_LIMIT_REACHED';
  log('seat cap', { secondUserOk, thirdUserBlockedOk, thirdUserBody });

  // 7. Forgot / reset password.
  const forgotRes = await fetch(`${base}/api/auth/request-password-reset`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const forgotBody = await forgotRes.json();
  const forgotOk = forgotRes.ok && typeof forgotBody.resetUrl === 'string';
  const resetToken = forgotOk ? new URLSearchParams(forgotBody.resetUrl.split('?')[1]).get('token') : null;

  const newPassword = 'BrandNewPass!456';
  const resetRes = await fetch(`${base}/api/auth/reset-password`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: resetToken, newPassword }),
  });
  const resetOk = resetRes.ok;

  const oldPasswordLogin = await login(email, password);
  const oldPasswordRejectedOk = oldPasswordLogin.status === 401;
  const newPasswordLogin = await login(email, newPassword);
  const newPasswordWorksOk = newPasswordLogin.status === 200 && !!newPasswordLogin.body.accessToken;
  log('password reset', { forgotOk, resetOk, oldPasswordRejectedOk, newPasswordWorksOk });

  // Re-establish headers with a token from the fresh password (the reset invalidated the
  // old refresh token, but the access token from verify-email is still independently
  // valid for its own 15-minute window, so headers above still work for step 8 too --
  // just being explicit here).
  headers = { Authorization: `Bearer ${newPasswordLogin.body.accessToken}`, 'Content-Type': 'application/json' };

  // 8. Upgrade request flow: pick a tier, confirm it shows up for the Super Admin, then
  // confirm generateLicense clears it.
  const tiers = (await (await fetch(`${base}/api/license/pricing-tiers`, { headers })).json()).tiers;
  const businessTier = tiers.find((t) => t.plan_name === 'Business');
  const upgradeRes = await fetch(`${base}/api/license/request-upgrade`, {
    method: 'POST', headers,
    body: JSON.stringify({ tierId: businessTier.id }),
  });
  const upgradeOk = upgradeRes.ok;

  const superLogin = await login('salsshaggy@gmail.com', 'ChronoBooks!SuperAdmin1');
  const superHeaders = { Authorization: `Bearer ${superLogin.body.accessToken}`, 'Content-Type': 'application/json' };
  const requestsBefore = await (await fetch(`${base}/api/license/upgrade-requests`, { headers: superHeaders })).json();
  const requestShowsUpOk = requestsBefore.requests.some((r) => r.companyName === 'Signup Test Co' && r.requestedPlanName === 'Business');
  log('upgrade requests (before activation)', requestsBefore);

  const targetCompanyId = companyAfterSetup.id;
  const modules = Object.fromEntries((businessTier.modulesIncluded || []).map((k) => [k, true]));
  const generateRes = await fetch(`${base}/api/license/generate`, {
    method: 'POST', headers: superHeaders,
    body: JSON.stringify({ companyId: targetCompanyId, licenseType: 'paid', planName: 'Business', userLimit: businessTier.userLimitNumeric || 10, expiryYears: 1, modules }),
  });
  const generateOk = generateRes.ok;

  const requestsAfter = await (await fetch(`${base}/api/license/upgrade-requests`, { headers: superHeaders })).json();
  const requestClearedOk = !requestsAfter.requests.some((r) => r.companyName === 'Signup Test Co');
  log('upgrade requests (after activation)', requestsAfter);

  const ok = registerOk && preVerifyBlockedOk && verifyOk && beforeSetupOk && setupOk && afterSetupOk && coaSeededOk
    && secondUserOk && thirdUserBlockedOk && forgotOk && resetOk && oldPasswordRejectedOk && newPasswordWorksOk
    && upgradeOk && requestShowsUpOk && generateOk && requestClearedOk;

  console.log(`\n== RESULT: ${ok ? 'PASS' : 'FAIL'} ==`);
  console.log(`registerOk=${registerOk} preVerifyBlockedOk=${preVerifyBlockedOk} verifyOk=${verifyOk} beforeSetupOk=${beforeSetupOk}`);
  console.log(`setupOk=${setupOk} afterSetupOk=${afterSetupOk} coaSeededOk=${coaSeededOk} secondUserOk=${secondUserOk} thirdUserBlockedOk=${thirdUserBlockedOk}`);
  console.log(`forgotOk=${forgotOk} resetOk=${resetOk} oldPasswordRejectedOk=${oldPasswordRejectedOk} newPasswordWorksOk=${newPasswordWorksOk}`);
  console.log(`upgradeOk=${upgradeOk} requestShowsUpOk=${requestShowsUpOk} generateOk=${generateOk} requestClearedOk=${requestClearedOk}`);

  server.close();
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error('VERIFY FAILED:', err);
  process.exit(1);
});
