import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Sale } from '../types';
import { formatCurrency } from './inventoryMath';

function escapeCsvCell(value: string | number | undefined | null): string {
  const str = String(value ?? '');
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | undefined | null>>
): void {
  const lines = [
    headers.map(escapeCsvCell).join(','),
    ...rows.map((row) => row.map(escapeCsvCell).join(',')),
  ];
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function downloadInvoicePdf(sale: Sale): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();

  // Header band
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageWidth, 88, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('StockMaster', 40, 42);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(148, 163, 184);
  doc.text('Inventory & Commercial Operations', 40, 60);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('SALES INVOICE', pageWidth - 40, 42, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(sale.invoiceNumber, pageWidth - 40, 60, { align: 'right' });

  // Customer & Meta
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('BILL TO', 40, 124);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(sale.customerName, 40, 142);
  if (sale.customerEmail) {
    doc.setFontSize(10);
    doc.setTextColor(71, 85, 105);
    doc.text(sale.customerEmail, 40, 158);
  }

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('INVOICE DETAILS', pageWidth - 200, 124);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  const dateStr = new Date(sale.createdAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  doc.text(`Date: ${dateStr}`, pageWidth - 200, 142);
  doc.text(`Payment: ${sale.paymentMethod.replace('_', ' ').toUpperCase()}`, pageWidth - 200, 158);
  doc.text(`Issued By: ${sale.createdBy}`, pageWidth - 200, 174);

  autoTable(doc, {
    startY: 204,
    head: [['SKU', 'Product', 'Qty', 'Unit Price', 'Line Total']],
    body: sale.items.map((item) => [
      item.sku,
      item.productName,
      String(item.quantity),
      formatCurrency(item.unitPrice),
      formatCurrency(item.lineTotal),
    ]),
    styles: {
      fontSize: 9.5,
      cellPadding: 8,
      textColor: [15, 23, 42],
    },
    headStyles: {
      fillColor: [241, 245, 249],
      textColor: [15, 23, 42],
      fontStyle: 'bold',
    },
    columnStyles: {
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
    },
  });

  const finalY = ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 320) + 24;

  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text('Subtotal:', pageWidth - 180, finalY);
  doc.setTextColor(15, 23, 42);
  doc.text(formatCurrency(sale.subtotal), pageWidth - 40, finalY, { align: 'right' });

  doc.setTextColor(71, 85, 105);
  doc.text(`Tax (${Math.round(sale.taxRate * 100)}%):`, pageWidth - 180, finalY + 18);
  doc.setTextColor(15, 23, 42);
  doc.text(formatCurrency(sale.taxAmount), pageWidth - 40, finalY + 18, { align: 'right' });

  doc.setDrawColor(203, 213, 225);
  doc.line(pageWidth - 180, finalY + 28, pageWidth - 40, finalY + 28);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Total Due:', pageWidth - 180, finalY + 46);
  doc.text(formatCurrency(sale.totalAmount), pageWidth - 40, finalY + 46, { align: 'right' });

  doc.save(`${sale.invoiceNumber}.pdf`);
}

export function downloadReportPdf(
  title: string,
  subtitle: string,
  columns: string[],
  rows: Array<Array<string | number>>,
  filename: string
): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42);
  doc.text(`StockMaster — ${title}`, 40, 44);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text(`${subtitle} · Generated ${new Date().toLocaleString('en-US')}`, 40, 62);

  autoTable(doc, {
    startY: 82,
    head: [columns],
    body: rows.map((r) => r.map((c) => String(c))),
    styles: {
      fontSize: 8.5,
      cellPadding: 6,
      textColor: [15, 23, 42],
    },
    headStyles: {
      fillColor: [37, 99, 235],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
  });

  doc.save(filename);
}
