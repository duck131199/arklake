import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { arklakeLogoPngBase64 } from './arklake-logo.js'

export type InvoicePdfData = {
  invoiceNumber: string; seller: string; payer: string; amount: string; asset: string; memo: string
  status: 'active' | 'paid' | 'expired'; createdAt: string; expiresAt: string; timeZone?: string
}

const safePdfText = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^\x20-\x7e]/g, '?')
const pdfDate = (value: string, timeZone: string) => new Intl.DateTimeFormat('en-US', {
  month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone, timeZoneName: 'short',
}).format(new Date(value))

function drawLabelValue(page: PDFPage, font: PDFFont, bold: PDFFont, label: string, value: string, x: number, y: number, width: number) {
  page.drawText(label.toUpperCase(), { x, y, size: 8, font: bold, color: rgb(0.35, 0.43, 0.46) })
  let text = safePdfText(value)
  while (text.length > 1 && font.widthOfTextAtSize(text, 11) > width) text = `${text.slice(0, -4)}...`
  page.drawText(text, { x, y: y - 21, size: 11, font, color: rgb(0.08, 0.15, 0.18) })
}

export async function createInvoicePdf(invoice: InvoicePdfData) {
  const document = await PDFDocument.create()
  document.setTitle(`Arklake invoice ${invoice.invoiceNumber}`)
  document.setAuthor('Arklake')
  document.setSubject('Invoice')
  const page = document.addPage([595.28, 841.89])
  const regular = await document.embedFont(StandardFonts.Helvetica)
  const bold = await document.embedFont(StandardFonts.HelveticaBold)
  const logo = await document.embedPng(Buffer.from(arklakeLogoPngBase64, 'base64'))
  const ink = rgb(0.08, 0.15, 0.18)
  const slate = rgb(0.35, 0.43, 0.46)
  const aqua = rgb(0.08, 0.72, 0.68)
  const mist = rgb(0.91, 0.98, 0.97)
  const border = rgb(0.84, 0.89, 0.9)
  const left = 52
  const right = 543
  const timeZone = invoice.timeZone || 'Asia/Bangkok'

  page.drawImage(logo, { x: left, y: 786, width: 60, height: 25 })
  page.drawText('ARKLAKE', { x: 124, y: 791, size: 14, font: bold, color: ink })
  page.drawText('INVOICE', { x: 481, y: 791, size: 10, font: bold, color: slate })
  page.drawLine({ start: { x: left, y: 772 }, end: { x: right, y: 772 }, thickness: 2, color: aqua })

  page.drawText('Invoice number', { x: left, y: 733, size: 9, font: regular, color: slate })
  page.drawText(safePdfText(invoice.invoiceNumber), { x: left, y: 708, size: 17, font: bold, color: ink })
  const status = invoice.status.toUpperCase()
  const statusWidth = bold.widthOfTextAtSize(status, 9) + 22
  page.drawRectangle({ x: right - statusWidth, y: 708, width: statusWidth, height: 23, color: invoice.status === 'active' ? mist : rgb(0.97, 0.96, 0.94), borderColor: invoice.status === 'active' ? aqua : border, borderWidth: 0.8 })
  page.drawText(status, { x: right - statusWidth + 11, y: 716, size: 9, font: bold, color: invoice.status === 'active' ? aqua : slate })

  page.drawRectangle({ x: left, y: 606, width: right - left, height: 76, color: mist, borderColor: border, borderWidth: 0.8 })
  page.drawText('TOTAL DUE', { x: 72, y: 654, size: 9, font: bold, color: slate })
  page.drawText(`${safePdfText(invoice.amount)} ${safePdfText(invoice.asset)}`, { x: 72, y: 622, size: 24, font: bold, color: ink })

  page.drawText('PARTIES', { x: left, y: 568, size: 9, font: bold, color: slate })
  page.drawRectangle({ x: left, y: 497, width: 237, height: 54, borderColor: border, borderWidth: 0.8 })
  page.drawRectangle({ x: 306, y: 497, width: 237, height: 54, borderColor: border, borderWidth: 0.8 })
  drawLabelValue(page, regular, bold, 'Seller', invoice.seller, 67, 532, 205)
  drawLabelValue(page, regular, bold, 'Payer', invoice.payer, 321, 532, 205)

  page.drawText('DATES', { x: left, y: 462, size: 9, font: bold, color: slate })
  drawLabelValue(page, regular, bold, 'Created', pdfDate(invoice.createdAt, timeZone), left, 435, 220)
  drawLabelValue(page, regular, bold, invoice.status === 'expired' ? 'Expired at' : 'Expires', pdfDate(invoice.expiresAt, timeZone), 306, 435, 237)
  page.drawLine({ start: { x: left, y: 392 }, end: { x: right, y: 392 }, thickness: 0.8, color: border })

  page.drawText('MEMO', { x: left, y: 360, size: 9, font: bold, color: slate })
  page.drawText(safePdfText(invoice.memo || '-').slice(0, 92), { x: left, y: 333, size: 11, font: regular, color: ink, maxWidth: right - left, lineHeight: 16 })

  const message = invoice.status === 'expired'
    ? 'This invoice has expired and is no longer payable.'
    : invoice.status === 'active'
      ? `Payment of ${safePdfText(invoice.amount)} ${safePdfText(invoice.asset)} is due by the expiry time above.`
      : 'This invoice is marked paid. Payment verification details are not included in this document.'
  page.drawRectangle({ x: left, y: 252, width: right - left, height: 48, color: invoice.status === 'active' ? mist : rgb(0.97, 0.96, 0.94) })
  page.drawText(message, { x: 68, y: 271, size: 10, font: invoice.status === 'expired' ? bold : regular, color: invoice.status === 'active' ? ink : slate })

  page.drawLine({ start: { x: left, y: 98 }, end: { x: right, y: 98 }, thickness: 0.7, color: border })
  page.drawText('Arklake', { x: left, y: 72, size: 10, font: bold, color: ink })
  page.drawText('Invoice for the goods or services described above.', { x: left, y: 56, size: 8, font: regular, color: slate })
  return document.save()
}
