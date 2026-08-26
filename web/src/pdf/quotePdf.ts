/**
 * Marpol antetli teklif PDF'i.
 *
 * pdfmake istemci tarafında çalışır; sunucuya ek yük binmez ve Türkçe
 * karakterler gömülü Roboto fontuyla sorunsuz basılır.
 */
import pdfMake from 'pdfmake/build/pdfmake';
import * as pdfFonts from 'pdfmake/build/vfs_fonts';
import type { TDocumentDefinitions } from 'pdfmake/interfaces';
import type { Quote } from '../api/types.js';
import { formatDate, formatMoney, formatNumber, formatPct, revisionLabel } from '../lib/format.js';

// pdfmake'in sürümüne göre vfs farklı alanlarda gelebiliyor.
const vfs =
  (pdfFonts as unknown as { vfs?: Record<string, string> }).vfs ??
  (pdfFonts as unknown as { pdfMake?: { vfs: Record<string, string> } }).pdfMake?.vfs;
if (vfs) (pdfMake as unknown as { vfs: Record<string, string> }).vfs = vfs;

const MARPOL_RED = '#e30613';
const GREY = '#6a6d70';

export function buildQuoteDoc(quote: Quote): TDocumentDefinitions {
  const items = quote.items ?? [];

  const itemRows = items.map((item, index) => [
    { text: String(index + 1), alignment: 'center' as const },
    {
      stack: [
        { text: item.description, bold: true },
        ...(item.options?.length
          ? [{ text: item.options.map((o) => o.option.name).join(' · '), fontSize: 8, color: GREY }]
          : []),
      ],
    },
    { text: `${formatNumber(item.quantity)} ${item.unit}`, alignment: 'right' as const },
    { text: formatMoney(item.unitPrice, quote.currency), alignment: 'right' as const },
    { text: item.discountPct ? formatPct(item.discountPct, 0) : '-', alignment: 'right' as const },
    { text: formatMoney(item.lineTotal, quote.currency), alignment: 'right' as const },
  ]);

  return {
    pageSize: 'A4',
    pageMargins: [40, 90, 40, 60],

    header: {
      margin: [40, 24, 40, 0],
      columns: [
        {
          width: '*',
          stack: [
            { text: 'MARPOL', fontSize: 22, bold: true, color: MARPOL_RED },
            { text: 'Endüstriyel Sistemler A.Ş.', fontSize: 9, color: GREY },
          ],
        },
        {
          width: 'auto',
          stack: [
            { text: 'TEKLİF', fontSize: 16, bold: true, alignment: 'right' },
            {
              text: `${quote.quoteNo} · ${revisionLabel(quote.revision)}`,
              fontSize: 10,
              alignment: 'right',
              color: GREY,
            },
          ],
        },
      ],
    },

    footer: (currentPage: number, pageCount: number) => ({
      margin: [40, 10, 40, 0],
      columns: [
        {
          text: 'Marpol A.Ş. · Müşteri İlişkileri Yönetim Sistemi',
          fontSize: 8,
          color: GREY,
        },
        {
          text: `Sayfa ${currentPage} / ${pageCount}`,
          fontSize: 8,
          color: GREY,
          alignment: 'right',
        },
      ],
    }),

    content: [
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 2, lineColor: MARPOL_RED }],
        margin: [0, 0, 0, 12],
      },

      {
        columns: [
          {
            width: '*',
            stack: [
              { text: 'SAYIN', fontSize: 8, color: GREY, bold: true },
              { text: quote.customer?.name ?? '-', fontSize: 11, bold: true, margin: [0, 2, 0, 0] },
              ...(quote.opportunity?.title
                ? [{ text: `Proje: ${quote.opportunity.title}`, fontSize: 9, color: GREY }]
                : []),
            ],
          },
          {
            width: 180,
            table: {
              widths: ['auto', '*'],
              body: [
                [{ text: 'Tarih', fontSize: 8, color: GREY }, { text: formatDate(quote.issuedAt), fontSize: 8, alignment: 'right' }],
                [{ text: 'Geçerlilik', fontSize: 8, color: GREY }, { text: formatDate(quote.validUntil), fontSize: 8, alignment: 'right' }],
                [{ text: 'Termin', fontSize: 8, color: GREY }, { text: `${quote.leadTimeDays ?? 0} gün`, fontSize: 8, alignment: 'right' }],
                [{ text: 'Hazırlayan', fontSize: 8, color: GREY }, { text: quote.createdBy?.fullName ?? '-', fontSize: 8, alignment: 'right' }],
              ],
            },
            layout: 'noBorders',
          },
        ],
        margin: [0, 0, 0, 14],
      },

      { text: quote.title, fontSize: 13, bold: true, margin: [0, 0, 0, 10] },

      {
        table: {
          headerRows: 1,
          widths: [22, '*', 60, 70, 38, 75],
          body: [
            [
              { text: '#', style: 'th', alignment: 'center' },
              { text: 'Açıklama', style: 'th' },
              { text: 'Miktar', style: 'th', alignment: 'right' },
              { text: 'Birim Fiyat', style: 'th', alignment: 'right' },
              { text: 'İsk.', style: 'th', alignment: 'right' },
              { text: 'Tutar', style: 'th', alignment: 'right' },
            ],
            ...(itemRows.length
              ? itemRows
              : [
                  [
                    { text: 'Kalem bulunmuyor.', colSpan: 6, alignment: 'center' as const, color: GREY },
                    {}, {}, {}, {}, {},
                  ],
                ]),
          ],
        },
        layout: {
          hLineWidth: (i: number, node: { table: { body: unknown[] } }) =>
            i === 0 || i === 1 || i === node.table.body.length ? 1 : 0.5,
          hLineColor: (i: number) => (i <= 1 ? '#333' : '#ddd'),
          vLineWidth: () => 0,
          paddingTop: () => 5,
          paddingBottom: () => 5,
        },
        fontSize: 9,
        margin: [0, 0, 0, 12],
      },

      {
        columns: [
          { width: '*', text: '' },
          {
            width: 240,
            table: {
              widths: ['*', 'auto'],
              body: [
                [
                  { text: 'Ara toplam', fontSize: 9 },
                  { text: formatMoney(quote.subtotal, quote.currency), fontSize: 9, alignment: 'right' },
                ],
                [
                  { text: `İskonto (${formatPct(quote.discountPct)})`, fontSize: 9 },
                  { text: `-${formatMoney(quote.discountAmount, quote.currency)}`, fontSize: 9, alignment: 'right' },
                ],
                [
                  { text: 'GENEL TOPLAM', fontSize: 11, bold: true, fillColor: '#f2f2f2' },
                  {
                    text: formatMoney(quote.totalPrice, quote.currency),
                    fontSize: 11,
                    bold: true,
                    alignment: 'right',
                    fillColor: '#f2f2f2',
                  },
                ],
              ],
            },
            layout: 'noBorders',
          },
        ],
        margin: [0, 0, 0, 16],
      },

      {
        table: {
          widths: ['auto', '*'],
          body: [
            [{ text: 'Ödeme koşulu', style: 'tl' }, { text: quote.paymentTerms ?? '-', style: 'tv' }],
            [{ text: 'Teslim koşulu', style: 'tl' }, { text: quote.deliveryTerms ?? '-', style: 'tv' }],
            ...(quote.notes ? [[{ text: 'Notlar', style: 'tl' }, { text: quote.notes, style: 'tv' }]] : []),
            ...(quote.terms ? [[{ text: 'Şartlar', style: 'tl' }, { text: quote.terms, style: 'tv' }]] : []),
          ],
        },
        layout: 'noBorders',
        margin: [0, 0, 0, 18],
      },

      {
        text: 'Bu teklif yukarıda belirtilen geçerlilik tarihine kadar hükümlüdür. Fiyatlara KDV dahil değildir.',
        fontSize: 8,
        color: GREY,
        italics: true,
      },
    ],

    styles: {
      th: { bold: true, fontSize: 9 },
      tl: { fontSize: 9, color: GREY, bold: true, margin: [0, 1, 8, 1] },
      tv: { fontSize: 9, margin: [0, 1, 0, 1] },
    },

    defaultStyle: { font: 'Roboto', fontSize: 10 },

    info: {
      title: `${quote.quoteNo}-${revisionLabel(quote.revision)}`,
      author: 'Marpol A.Ş.',
      subject: quote.title,
    },
  };
}

/** Teklif PDF'ini üretip indirir. */
export function downloadQuotePdf(quote: Quote): void {
  const fileName = `${quote.quoteNo}_${revisionLabel(quote.revision).replace(' ', '')}.pdf`;
  pdfMake.createPdf(buildQuoteDoc(quote)).download(fileName);
}
