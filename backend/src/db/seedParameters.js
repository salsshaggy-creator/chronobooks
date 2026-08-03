const db = require('../config/db');

const TAX_CODES = [
  ['VAT-STD', 'VAT Standard Rate', 15],
  ['VAT-ZERO', 'VAT Zero Rated', 0],
  ['NHIL', 'NHIL', 2.5],
  ['EXEMPT', 'Tax Exempt', 0],
];
const COST_CENTRES = [
  ['GEN', 'General'],
  ['ADM', 'Administration'],
  ['SLS', 'Sales'],
  ['OPS', 'Operations'],
];
const PAYMENT_TERMS = [
  ['Due on Receipt', 0],
  ['Net 15', 15],
  ['Net 30', 30],
  ['Net 60', 60],
];
const NUMBER_SEQUENCES = [
  ['invoice', 'INV-'],
  ['bill', 'BILL-'],
  ['receipt', 'RCT-'],
  ['payment', 'PMT-'],
  ['journal', 'JV-'],
];
const DOCUMENT_TYPES = ['Invoice', 'Bill', 'Credit Note', 'Debit Note', 'Receipt', 'Journal Voucher', 'Purchase Order'];

/** Sensible starter Parameters (write-up System Administration > Parameters) for a brand-new company — same set for the demo company or one a Super Administrator just created. */
async function seedParameters(companyId) {
  for (const [code, name, rate] of TAX_CODES) {
    await db.query(`INSERT INTO tax_codes (company_id, code, name, rate) VALUES ($1,$2,$3,$4)`, [companyId, code, name, rate]);
  }
  for (const [code, name] of COST_CENTRES) {
    await db.query(`INSERT INTO cost_centres (company_id, code, name) VALUES ($1,$2,$3)`, [companyId, code, name]);
  }
  for (const [name, days] of PAYMENT_TERMS) {
    await db.query(`INSERT INTO payment_terms (company_id, name, days) VALUES ($1,$2,$3)`, [companyId, name, days]);
  }
  for (const [docType, prefix] of NUMBER_SEQUENCES) {
    await db.query(`INSERT INTO number_sequences (company_id, document_type, prefix, next_number) VALUES ($1,$2,$3,1)`, [companyId, docType, prefix]);
  }
  for (const name of DOCUMENT_TYPES) {
    await db.query(`INSERT INTO document_types (company_id, name) VALUES ($1,$2)`, [companyId, name]);
  }
}

module.exports = { seedParameters };
