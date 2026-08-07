/**
 * Shared CSV + PDF download helpers, used anywhere in the app that needs a "download this
 * as a file" button -- invoices, receipts, bills, statements, and every Reports tab. Keeping
 * this in one place means every export looks and behaves the same, and any future formatting
 * fix only needs to happen once.
 *
 * Both functions run entirely in the browser (no backend round trip, no external service),
 * so they work the moment the button is clicked -- nothing to configure.
 */
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

/** Escapes a single CSV cell: wraps in quotes and doubles internal quotes whenever the value
 * contains a comma, quote, or newline (the only characters that actually require quoting). */
function csvCell(value) {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/** Triggers a browser download for an in-memory Blob, then cleans up the object URL. */
function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Downloads `rows` (an array of arrays -- the first row is normally the header) as a CSV file.
 * Opens directly in Excel, Google Sheets, or Numbers.
 */
export function downloadCSV(filename, rows) {
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  saveBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }), filename);
}

/**
 * Draws whatever image format the browser can decode (PNG/JPEG/GIF/WEBP) onto an offscreen
 * canvas and reads it back out as a PNG data URL -- jsPDF's addImage() only reliably supports
 * PNG/JPEG, so this normalizes every logo to one format instead of branching on the original
 * upload's mime type. Also hands back the natural pixel size so the caller can scale it down
 * to a sensible print size without distorting the aspect ratio.
 */
function normalizeImageToPng(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      resolve({ dataUrl: canvas.toDataURL('image/png'), width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => reject(new Error('Could not load the logo image.'));
    img.src = dataUrl;
  });
}

/**
 * Downloads a simple one-table PDF: an optional logo, a title, an optional subtitle (e.g. a
 * date range or "Invoice INV-0001"), an optional set of key/value summary lines (e.g.
 * totals), and a table. Async because embedding a logo requires decoding it via an <img>
 * element first -- every caller should `await` this (or `.catch()` it) rather than fire-and-forget.
 *
 * @param {string} filename
 * @param {object} opts
 * @param {string} opts.title - shown large at the top (usually the company name or report name).
 * @param {string} [opts.subtitle] - shown under the title (e.g. document number, date range).
 * @param {string[]} [opts.meta] - extra lines under the subtitle (e.g. "Customer: Acme Ltd").
 * @param {string[]} opts.columns - table header cells.
 * @param {Array<Array<string|number>>} opts.rows - table body rows.
 * @param {string[]} [opts.summary] - lines rendered below the table, right-aligned (e.g. totals).
 * @param {string} [opts.logoDataUrl] - the company logo (any browser-decodable format) to print
 *   at the top of the page, above the title. Silently skipped if it fails to decode.
 */
export async function downloadPDF(filename, { title, subtitle, meta = [], columns, rows, summary = [], logoDataUrl }) {
  const doc = new jsPDF({ unit: 'pt' });
  const marginLeft = 40;
  let y = 48;

  if (logoDataUrl) {
    try {
      const { dataUrl: pngDataUrl, width, height } = await normalizeImageToPng(logoDataUrl);
      const maxW = 110;
      const maxH = 46;
      const scale = Math.min(maxW / width, maxH / height, 1);
      const w = width * scale;
      const h = height * scale;
      doc.addImage(pngDataUrl, 'PNG', marginLeft, 26, w, h);
      y = Math.max(y, 26 + h + 18);
    } catch {
      // A broken/unreadable logo shouldn't block the rest of the PDF from generating.
    }
  }

  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text(title, marginLeft, y);
  y += 20;

  doc.setFontSize(11);
  doc.setFont(undefined, 'normal');
  if (subtitle) {
    doc.text(subtitle, marginLeft, y);
    y += 16;
  }
  meta.forEach((line) => {
    doc.setFontSize(10);
    doc.setTextColor(90);
    doc.text(line, marginLeft, y);
    y += 14;
  });
  doc.setTextColor(0);
  y += 6;

  if (columns && rows) {
    autoTable(doc, {
      startY: y,
      head: [columns],
      body: rows,
      margin: { left: marginLeft, right: marginLeft },
      headStyles: { fillColor: [30, 41, 59] },
      styles: { fontSize: 9, cellPadding: 5 },
    });
    y = doc.lastAutoTable.finalY + 20;
  }

  if (summary.length) {
    doc.setFontSize(11);
    summary.forEach((line) => {
      doc.text(line, doc.internal.pageSize.getWidth() - marginLeft, y, { align: 'right' });
      y += 16;
    });
  }

  doc.save(filename);
}
