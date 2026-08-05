// Shared FAQ content -- rendered by both the public /faq page (pre-login) and the
// in-app Help page, via components/FAQList.jsx. Keep answers generic about pricing
// (point at the pricing page rather than quoting numbers) since admins can edit tier
// prices at any time from License > Pricing.

export const FAQ_CATEGORIES = [
  {
    category: 'Getting started, trial & billing',
    items: [
      {
        q: 'How does the 30-day free trial work?',
        a: "When you sign up, verify your email, and finish the company-setup wizard, your company automatically gets 30 days of full access -- no credit card required. You're the Administrator from day one, with up to 2 users included on the trial.",
      },
      {
        q: 'Do I need a credit card to sign up?',
        a: 'No. Create an account, verify your email, and set up your company to start your trial. You only add billing details if and when you choose to upgrade to a paid plan.',
      },
      {
        q: 'How many companies and users can I have?',
        a: 'Self-serve accounts are limited to 1 company and 2 users. If you need more companies or seats, request an upgrade from the License page and your Super Administrator will review and activate the right plan for you.',
      },
      {
        q: 'What happens when my trial ends?',
        a: "You'll get renewal reminders in the run-up to expiry. Once the trial period is over, your account enters a 30-day grace period with read-only access -- you can still view transactions, reports, and the ledger, but recording new entries, adding users, and changing settings are paused until you upgrade or renew. After the grace period, you'll be prompted to upgrade before you can use ChronoBooks again.",
      },
      {
        q: 'How do I upgrade my plan?',
        a: "Go to License in the sidebar, review the available plans and the modules each one includes, and click Upgrade on the plan you want. That sends a request to your Super Administrator, who reviews and activates it -- you'll see the request move to \"Requested\" while it's pending.",
      },
      {
        q: "What's included in each plan?",
        a: "Every plan includes core bookkeeping, invoicing, and reporting. Higher tiers add modules like Inventory, Fixed Assets, Budgeting, Procurement, Multi-Currency, and more, plus higher user limits. The exact modules and prices for each tier are shown live on the License page -- if pricing changes, you'll see the updated cost there.",
      },
      {
        q: 'Can I change my plan later?',
        a: "Yes. You can request a different plan at any time from the License page, whether you're moving up for more modules and seats or scaling back.",
      },
      {
        q: "I forgot my password -- how do I reset it?",
        a: 'Click "Forgot password?" on the sign-in page, enter your email, and follow the reset link. You can also toggle the eye icon on any password field to check what you\'ve typed before submitting.',
      },
      {
        q: "I didn't get a verification or reset email",
        a: "This install doesn't have an email provider configured yet, so verification and reset links are shown directly on screen right after you request them, instead of arriving by email -- just click through from there.",
      },
    ],
  },
  {
    category: 'Product & features',
    items: [
      {
        q: 'What is ChronoBooks?',
        a: 'ChronoBooks is double-entry accounting software built for small and growing businesses -- invoicing, expenses, banking, payroll, inventory, and reporting, all keeping your books balanced automatically behind the scenes.',
      },
      {
        q: 'Can I manage more than one company?',
        a: 'Yes, on plans that support it -- Administrators and Super Administrators can switch between companies from the sidebar. Self-serve trial accounts are limited to 1 company; higher plans support multiple companies.',
      },
      {
        q: 'Does ChronoBooks handle payroll?',
        a: 'Yes -- Payroll imports run through the same journal engine as everything else, so payroll entries post straight to the correct GL accounts.',
      },
      {
        q: 'What reports are available?',
        a: 'Profit & Loss, Balance Sheet, Trial Balance, Budget vs Actual, and Cost Centre breakdowns, all exportable, plus a live dashboard of income, expenses, and outstanding balances.',
      },
      {
        q: 'Can I track inventory?',
        a: 'Yes, on plans with the Inventory module enabled -- stock receipts and issues post automatically from your Purchases and Sales, including cost of goods sold.',
      },
      {
        q: 'Does it support multiple currencies?',
        a: 'Yes, on plans with the Multi-Currency module -- you can invoice, bill, and record expenses in a foreign currency and ChronoBooks resolves the exchange rate for you.',
      },
      {
        q: 'Can I set up approval workflows?',
        a: 'Yes -- sales, purchases, payroll imports, and other sensitive actions can require sign-off before they post, with everything tracked in the Approvals inbox.',
      },
      {
        q: 'Is there an AI assistant?',
        a: "Yes -- the floating assistant in the bottom corner can answer questions about your books and how to use ChronoBooks, and it's included free on every plan.",
      },
    ],
  },
  {
    category: 'Security & data',
    items: [
      {
        q: 'Is my data secure?',
        a: 'Yes -- sign-in uses bank-grade security, and every account and password is stored encrypted. Access to your company data is scoped to users you explicitly invite.',
      },
      {
        q: "Who can see my company's data?",
        a: 'Only users you add to your company can sign in and see its data. Your Super Administrator can access license and billing details but not your day-to-day transactions.',
      },
      {
        q: 'Can I export my data?',
        a: 'Yes -- reports, the ledger, and transaction lists can all be exported for your own records or your accountant.',
      },
      {
        q: 'Is there an audit trail?',
        a: 'Yes -- every posting is tracked, and the audit trail remains viewable even during a read-only grace period.',
      },
      {
        q: 'What happens to my data if I cancel or my license expires?',
        a: "Your data isn't deleted when a license expires -- you keep read-only access to view and export everything during the grace period. Reach out to your Super Administrator about longer-term retention if you plan to cancel for good.",
      },
    ],
  },
];
