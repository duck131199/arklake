import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import { arklakeLogoPngBase64 } from './arklake-logo.js'

export type InvoicePdfData = {
  invoiceNumber: string; seller: string; payer: string; amount: string; asset: string; memo: string
  status: 'active' | 'paid' | 'expired'; createdAt: string; expiresAt: string; paidAt?: string | null; timeZone?: string
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

export function wrapInvoiceDescription(value: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = []
  for (const paragraph of value.replace(/\r\n?/g, '\n').split('\n')) {
    if (!paragraph) { lines.push(''); continue }
    let line = ''
    for (const word of safePdfText(paragraph).split(/\s+/)) {
      let remainder = word
      while (remainder && font.widthOfTextAtSize(remainder, size) > width) {
        let split = 1
        while (split < remainder.length && font.widthOfTextAtSize(remainder.slice(0, split + 1), size) <= width) split += 1
        if (line) { lines.push(line); line = '' }
        lines.push(remainder.slice(0, split))
        remainder = remainder.slice(split)
      }
      if (!remainder) continue
      const candidate = line ? `${line} ${remainder}` : remainder
      if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate
      else { lines.push(line); line = remainder }
    }
    lines.push(line)
  }
  return lines
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

  page.drawText('Invoice number', { x: left, y: 735, size: 8, font: bold, color: slate })
  page.drawText(safePdfText(invoice.invoiceNumber), { x: left, y: 710, size: 16, font: bold, color: ink })
  const status = invoice.status.toUpperCase()
  const statusWidth = bold.widthOfTextAtSize(status, 9) + 22
  page.drawRectangle({ x: right - statusWidth, y: 708, width: statusWidth, height: 23, color: invoice.status === 'active' ? mist : rgb(0.97, 0.96, 0.94), borderColor: invoice.status === 'active' ? aqua : border, borderWidth: 0.8 })
  page.drawText(status, { x: right - statusWidth + 11, y: 716, size: 9, font: bold, color: invoice.status === 'active' ? aqua : slate })

  page.drawRectangle({ x: left, y: 610, width: right - left, height: 78, color: mist, borderColor: border, borderWidth: 0.7 })
  page.drawText('AMOUNT DUE', { x: 72, y: 658, size: 8, font: bold, color: slate })
  page.drawText(`${safePdfText(invoice.amount)} ${safePdfText(invoice.asset)}`, { x: 72, y: 626, size: 25, font: bold, color: ink })
  page.drawText('PAYMENT DETAILS', { x: 405, y: 658, size: 8, font: bold, color: slate })
  page.drawText(`${safePdfText(invoice.asset)} · Arc Testnet`, { x: 405, y: 637, size: 9, font: regular, color: slate })

  page.drawText('FROM / BILL TO', { x: left, y: 570, size: 8, font: bold, color: slate })
  page.drawRectangle({ x: left, y: 497, width: 237, height: 56, borderColor: border, borderWidth: 0.7 })
  page.drawRectangle({ x: 306, y: 497, width: 237, height: 56, borderColor: border, borderWidth: 0.7 })
  drawLabelValue(page, regular, bold, 'From', invoice.seller, 67, 533, 205)
  drawLabelValue(page, regular, bold, 'Bill to', invoice.payer, 321, 533, 205)

  page.drawText('DATES', { x: left, y: 462, size: 8, font: bold, color: slate })
  drawLabelValue(page, regular, bold, 'Created', pdfDate(invoice.createdAt, timeZone), left, 435, 220)
  drawLabelValue(page, regular, bold, invoice.status === 'paid' ? 'Paid at' : invoice.status === 'expired' ? 'Expired at' : 'Expires', invoice.status === 'paid' && invoice.paidAt ? pdfDate(invoice.paidAt, timeZone) : pdfDate(invoice.expiresAt, timeZone), 306, 435, 237)
  page.drawLine({ start: { x: left, y: 394 }, end: { x: right, y: 394 }, thickness: 0.7, color: border })

  const description = invoice.memo.trim()
  if (description) {
    const lines = wrapInvoiceDescription(description, regular, 11, right - left)
    const firstPageCapacity = invoice.status === 'expired' ? 2 : 13
    page.drawText('DESCRIPTION', { x: left, y: 362, size: 8, font: bold, color: slate })
    lines.slice(0, firstPageCapacity).forEach((line, index) => page.drawText(line, { x: left, y: 335 - index * 16, size: 11, font: regular, color: ink }))

    for (let offset = firstPageCapacity; offset < lines.length; offset += 41) {
      const continuation = document.addPage([595.28, 841.89])
      continuation.drawText('DESCRIPTION (CONTINUED)', { x: left, y: 790, size: 8, font: bold, color: slate })
      lines.slice(offset, offset + 41).forEach((line, index) => continuation.drawText(line, { x: left, y: 763 - index * 16, size: 11, font: regular, color: ink }))
      continuation.drawLine({ start: { x: left, y: 72 }, end: { x: right, y: 72 }, thickness: 0.7, color: border })
      continuation.drawText(`Arklake invoice ${safePdfText(invoice.invoiceNumber)}`, { x: left, y: 50, size: 8, font: regular, color: slate })
    }
  }

  if (invoice.status === 'expired') {
    page.drawRectangle({ x: left, y: 258, width: right - left, height: 46, color: rgb(0.97, 0.96, 0.94) })
    page.drawText('This invoice has expired and is no longer payable.', { x: 68, y: 276, size: 10, font: bold, color: slate })
  }

  page.drawLine({ start: { x: left, y: 98 }, end: { x: right, y: 98 }, thickness: 0.7, color: border })
  page.drawText('Arklake', { x: left, y: 72, size: 10, font: bold, color: ink })
  page.drawText('Invoice for the goods or services described above.', { x: left, y: 56, size: 8, font: regular, color: slate })
  return document.save()
}
