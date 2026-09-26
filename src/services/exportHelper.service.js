const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

// ═══════════════════════════════════════════
// CSV GENERATOR
// ═══════════════════════════════════════════
const escCSV = (val) => {
  if (val === null || val === undefined) return '';
  const str = String(val).replace(/"/g, '""');
  return `"${str}"`;
};

const generateCSV = (headers, rows) => {
  let csv = headers.map(escCSV).join(',') + '\n';
  rows.forEach((r) => {
    csv += r.map(escCSV).join(',') + '\n';
  });
  return Buffer.from('\uFEFF' + csv, 'utf8');
};

// ═══════════════════════════════════════════
// EXCEL GENERATOR (.xlsx)
// ═══════════════════════════════════════════
const generateExcel = async (headers, rows, sheetName = 'Data') => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'XFC Admin';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  // Header row
  sheet.addRow(headers);
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF2D3748' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 24;

  // Data rows
  rows.forEach((row) => sheet.addRow(row));

  // Style data rows
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber > 1) {
      row.alignment = { vertical: 'middle' };
      if (rowNumber % 2 === 0) {
        row.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFF7FAFC' },
        };
      }
    }
  });

  // Auto column widths
  sheet.columns.forEach((col, idx) => {
    let maxLen = headers[idx] ? String(headers[idx]).length : 10;
    rows.forEach((r) => {
      const v = r[idx];
      if (v !== null && v !== undefined) {
        maxLen = Math.max(maxLen, String(v).length);
      }
    });
    col.width = Math.min(maxLen + 4, 45);
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
};

// ═══════════════════════════════════════════
// PDF GENERATOR
// ═══════════════════════════════════════════
const generatePDF = (title, headers, rows) => {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 25,
    });

    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Title
    doc.fontSize(15).fillColor('#000000').font('Helvetica-Bold');
    doc.text(title, { align: 'center' });
    doc.moveDown(0.3);

    // Meta
    doc.fontSize(8).fillColor('#666666').font('Helvetica');
    doc.text(
      `Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}  |  Total rows: ${rows.length}`,
      { align: 'center' }
    );
    doc.moveDown(0.5);

    const pageWidth = doc.page.width - 50;
    const startX = 25;
    const colWidth = pageWidth / headers.length;
    let y = doc.y;

    const drawHeader = () => {
      doc.rect(startX, y, pageWidth, 20).fill('#2D3748');
      doc.fillColor('#FFFFFF').fontSize(7.5).font('Helvetica-Bold');
      headers.forEach((h, i) => {
        doc.text(String(h), startX + i * colWidth + 3, y + 6, {
          width: colWidth - 6,
          height: 14,
          ellipsis: true,
          lineBreak: false,
        });
      });
      y += 20;
      doc.font('Helvetica');
    };

    drawHeader();

    doc.fillColor('#000000').fontSize(7);
    rows.forEach((row, rowIdx) => {
      const rowHeight = 15;

      // Page break check
      if (y + rowHeight > doc.page.height - 35) {
        doc.addPage();
        y = 40;
        drawHeader();
        doc.fillColor('#000000').fontSize(7);
      }

      // Alternate row background
      if (rowIdx % 2 === 0) {
        doc.rect(startX, y, pageWidth, rowHeight).fill('#F7FAFC');
      }

      doc.fillColor('#000000');
      row.forEach((cell, i) => {
        const text = cell === null || cell === undefined ? '' : String(cell);
        doc.text(text, startX + i * colWidth + 3, y + 4, {
          width: colWidth - 6,
          height: rowHeight - 4,
          ellipsis: true,
          lineBreak: false,
        });
      });

      // Bottom border
      doc.strokeColor('#E2E8F0').lineWidth(0.3);
      doc.moveTo(startX, y + rowHeight).lineTo(startX + pageWidth, y + rowHeight).stroke();

      y += rowHeight;
    });

    doc.end();
  });
};

// ═══════════════════════════════════════════
// MAIN DISPATCHER
// ═══════════════════════════════════════════
const generateExport = async (format, { title, headers, rows, sheetName }) => {
  const fmt = (format || 'csv').toLowerCase();

  if (fmt === 'xlsx' || fmt === 'excel') {
    const buffer = await generateExcel(headers, rows, sheetName || 'Data');
    return {
      buffer,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      extension: 'xlsx',
    };
  }

  if (fmt === 'pdf') {
    const buffer = await generatePDF(title || 'Report', headers, rows);
    return {
      buffer,
      contentType: 'application/pdf',
      extension: 'pdf',
    };
  }

  // CSV default
  const buffer = generateCSV(headers, rows);
  return {
    buffer,
    contentType: 'text/csv; charset=utf-8',
    extension: 'csv',
  };
};

module.exports = { generateExport };