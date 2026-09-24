const PDFDocument = require('pdfkit');

// ═══════════════════════════════════════════
// HELPER: Format date
// ═══════════════════════════════════════════
const formatDate = (date) => {
  if (!date) return '—';
  return new Date(date).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

// ═══════════════════════════════════════════
// MAIN: Generate Meetup Attendance PDF
// ═══════════════════════════════════════════
const generateMeetupAttendancePDF = (meetup, rsvps) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margin: 40,
        bufferPages: true,
      });

      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth = doc.page.width;
      const contentWidth = pageWidth - 80;
      const leftMargin = 40;

      // ═══ HEADER ═══
      doc.rect(0, 0, pageWidth, 90).fill('#FF6900');

      doc
        .fillColor('#FFFFFF')
        .fontSize(22)
        .font('Helvetica-Bold')
        .text('XFC PATNA', leftMargin, 25);

      doc
        .fontSize(10)
        .font('Helvetica')
        .text('Xiaomi Fans Club Patna — Meetup Attendance Report', leftMargin, 55);

      doc
        .fontSize(8)
        .text(`Generated: ${formatDate(new Date())}`, leftMargin, 72);

      // ═══ MEETUP DETAILS ═══
      let y = 115;

      doc
        .fillColor('#000000')
        .fontSize(16)
        .font('Helvetica-Bold')
        .text(meetup.title, leftMargin, y);

      y += 28;

      doc.fontSize(10).font('Helvetica').fillColor('#444444');

      const weights = meetup.attendance_weights || { physical: 50, x_link: 25, instagram: 25 };

      const details = [
        ['Date:', formatDate(meetup.date)],
        ['Venue:', meetup.venue || '—'],
        ['Total Points:', `${meetup.points} pts`],
        ['Attendance Split:', `Physical ${weights.physical}% · X ${weights.x_link}% · Instagram ${weights.instagram}%`],
        ['Location Locked:', meetup.location_locked ? 'Yes' : 'No'],
        ['Total RSVPs:', `${rsvps.length}`],
      ];

      details.forEach(([label, value]) => {
        doc.font('Helvetica-Bold').fillColor('#000000').text(label, leftMargin, y, { width: 110 });
        doc.font('Helvetica').fillColor('#333333').text(String(value), leftMargin + 115, y, { width: contentWidth - 115 });
        y += 16;
      });

      y += 10;

      // ═══ SUMMARY STATS ═══
      const physicalCount = rsvps.filter((r) => r.attendance_status === 'PRESENT').length;
      const xApproved = rsvps.filter((r) => r.x_status === 'APPROVED').length;
      const igApproved = rsvps.filter((r) => r.instagram_status === 'APPROVED').length;

      const statsY = y;
      const stats = [
        { label: 'Total RSVPs', value: rsvps.length, color: '#FF6900' },
        { label: 'Physical Present', value: physicalCount, color: '#22C55E' },
        { label: 'X Approved', value: xApproved, color: '#3B82F6' },
        { label: 'Insta Approved', value: igApproved, color: '#EC4899' },
      ];

      const boxWidth = (contentWidth - 30) / 4;

      stats.forEach((stat, i) => {
        const x = leftMargin + i * (boxWidth + 10);
        doc.rect(x, statsY, boxWidth, 55).fillAndStroke('#F9F9F9', '#DDDDDD');
        doc
          .fillColor(stat.color)
          .fontSize(18)
          .font('Helvetica-Bold')
          .text(String(stat.value), x, statsY + 10, { width: boxWidth, align: 'center' });
        doc
          .fillColor('#666666')
          .fontSize(8)
          .font('Helvetica')
          .text(stat.label, x, statsY + 35, { width: boxWidth, align: 'center' });
      });

      y = statsY + 75;

      // ═══ TABLE ═══
      doc
        .fillColor('#000000')
        .fontSize(12)
        .font('Helvetica-Bold')
        .text('Attendance Details', leftMargin, y);

      y += 20;

      const colWidths = {
        no: 25,
        name: 130,
        xiaomi: 80,
        rsvp: 60,
        physical: 55,
        x: 55,
        insta: 55,
        points: 55,
      };

      const drawHeader = (yPos) => {
        doc.rect(leftMargin, yPos, contentWidth, 22).fill('#333333');

        let x = leftMargin + 5;
        doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');

        doc.text('#', x, yPos + 7, { width: colWidths.no });
        x += colWidths.no;
        doc.text('Member', x, yPos + 7, { width: colWidths.name });
        x += colWidths.name;
        doc.text('Xiaomi ID', x, yPos + 7, { width: colWidths.xiaomi });
        x += colWidths.xiaomi;
        doc.text('RSVP', x, yPos + 7, { width: colWidths.rsvp });
        x += colWidths.rsvp;
        doc.text('Physical', x, yPos + 7, { width: colWidths.physical });
        x += colWidths.physical;
        doc.text('X', x, yPos + 7, { width: colWidths.x });
        x += colWidths.x;
        doc.text('Insta', x, yPos + 7, { width: colWidths.insta });
        x += colWidths.insta;
        doc.text('Points', x, yPos + 7, { width: colWidths.points });

        return yPos + 22;
      };

      y = drawHeader(y);

      rsvps.forEach((r, index) => {
        if (y > doc.page.height - 80) {
          doc.addPage();
          y = 40;
          y = drawHeader(y);
        }

        const rowHeight = 20;
        const bgColor = index % 2 === 0 ? '#FFFFFF' : '#F5F5F5';

        doc.rect(leftMargin, y, contentWidth, rowHeight).fill(bgColor);

        let x = leftMargin + 5;
        doc.fillColor('#333333').fontSize(8).font('Helvetica');

        doc.text(String(index + 1), x, y + 6, { width: colWidths.no });
        x += colWidths.no;

        const name = (r.member_name || 'Unknown').substring(0, 22);
        doc.text(name, x, y + 6, { width: colWidths.name });
        x += colWidths.name;

        doc.text(String(r.xiaomi_id || '—').substring(0, 12), x, y + 6, { width: colWidths.xiaomi });
        x += colWidths.xiaomi;

        doc.text(r.rsvp_status || '—', x, y + 6, { width: colWidths.rsvp });
        x += colWidths.rsvp;

        const physicalText = r.attendance_status === 'PRESENT' ? 'Present' : 'Absent';
        doc
          .fillColor(r.attendance_status === 'PRESENT' ? '#22C55E' : '#999999')
          .text(physicalText, x, y + 6, { width: colWidths.physical });
        x += colWidths.physical;

        const xStatus = r.x_status === 'APPROVED' ? 'OK' : r.x_status === 'PENDING' ? 'Pend' : r.x_status === 'REJECTED' ? 'Rej' : '—';
        doc
          .fillColor(r.x_status === 'APPROVED' ? '#22C55E' : r.x_status === 'PENDING' ? '#EAB308' : r.x_status === 'REJECTED' ? '#EF4444' : '#999999')
          .text(xStatus, x, y + 6, { width: colWidths.x });
        x += colWidths.x;

        const igStatus = r.instagram_status === 'APPROVED' ? 'OK' : r.instagram_status === 'PENDING' ? 'Pend' : r.instagram_status === 'REJECTED' ? 'Rej' : '—';
        doc
          .fillColor(r.instagram_status === 'APPROVED' ? '#22C55E' : r.instagram_status === 'PENDING' ? '#EAB308' : r.instagram_status === 'REJECTED' ? '#EF4444' : '#999999')
          .text(igStatus, x, y + 6, { width: colWidths.insta });
        x += colWidths.insta;

        const totalPoints = (r.physical_points || 0) + (r.x_points || 0) + (r.instagram_points || 0);
        doc.fillColor('#FF6900').font('Helvetica-Bold').text(totalPoints.toFixed(2), x, y + 6, { width: colWidths.points });

        y += rowHeight;
      });

      // ═══ FOOTER ═══
      const pageCount = doc.bufferedPageRange().count;

      for (let i = 0; i < pageCount; i++) {
        doc.switchToPage(i);
        doc
          .fillColor('#999999')
          .fontSize(7)
          .font('Helvetica')
          .text(
            `XFC Patna · ${meetup.title} · Page ${i + 1} of ${pageCount}`,
            leftMargin,
            doc.page.height - 25,
            { width: contentWidth, align: 'center' }
          );
      }

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = {
  generateMeetupAttendancePDF,
};