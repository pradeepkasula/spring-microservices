const fs = require("fs");
const path = require("path");
const {
  Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, WidthType, ShadingType, BorderStyle,
  HeadingLevel, AlignmentType, LevelFormat, PageBreak,
} = require("docx");

const W = 9746; // content width in DXA (A4, 1080 margins)
const FONT = "Calibri";
const numberingConfigs = [];
let numCounter = 0;

function runs(text, opts = {}) {
  // **bold** and `code` inline markup
  const out = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(new TextRun({ text: text.slice(last, m.index), ...opts }));
    const tok = m[0];
    if (tok.startsWith("**")) out.push(new TextRun({ text: tok.slice(2, -2), bold: true, ...opts }));
    else out.push(new TextRun({ text: tok.slice(1, -1), font: "Consolas", size: 19, color: "7B241C", ...opts, bold: opts.bold }));
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(new TextRun({ text: text.slice(last), ...opts }));
  return out;
}

const p = (text, opts = {}) => new Paragraph({ children: runs(text, opts.run || {}), spacing: { after: 100, line: 276 }, ...(opts.para || {}) });
const h1 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)], pageBreakBefore: true });
const h1nb = (t) => new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(t)] });
const h2 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(t)] });
const h3 = (t) => new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(t)] });

const bullets = (items) => items.map((t) => new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: runs(t), spacing: { after: 60, line: 264 } }));

function numbered(items) {
  const ref = "num" + ++numCounter;
  numberingConfigs.push({
    reference: ref,
    levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }],
  });
  return items.map((t) => new Paragraph({ numbering: { reference: ref, level: 0 }, children: runs(t), spacing: { after: 60, line: 264 } }));
}

function code(lines) {
  const arr = Array.isArray(lines) ? lines : lines.split("\n");
  return arr.map((ln, i) => new Paragraph({
    children: [new TextRun({ text: ln === "" ? " " : ln, font: "Consolas", size: 18 })],
    shading: { type: ShadingType.CLEAR, fill: "F2F4F4", color: "auto" },
    spacing: { before: i === 0 ? 60 : 0, after: i === arr.length - 1 ? 120 : 0, line: 240 },
    indent: { left: 120, right: 120 },
    keepLines: true,
  }));
}

const border = { style: BorderStyle.SINGLE, size: 4, color: "B2BABB" };
const borders = { top: border, bottom: border, left: border, right: border };

function cell(text, width, opts = {}) {
  const paras = (Array.isArray(text) ? text : [text]).map((t) => new Paragraph({
    children: runs(t, { size: 19, bold: opts.bold, color: opts.color }),
    spacing: { after: 40, line: 250 },
  }));
  return new TableCell({
    borders, width: { size: width, type: WidthType.DXA },
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill, color: "auto" } : undefined,
    margins: { top: 60, bottom: 60, left: 100, right: 100 },
    children: paras,
  });
}

function table(headers, rows, widths) {
  const total = widths.reduce((a, b) => a + b, 0);
  const head = new TableRow({ tableHeader: true, children: headers.map((h, i) => cell(h, widths[i], { bold: true, fill: "1F4E79", color: "FFFFFF" })) });
  const body = rows.map((r, ri) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, widths[i], { fill: ri % 2 ? "F7F9FA" : undefined })) }));
  return new Table({ width: { size: total, type: WidthType.DXA }, columnWidths: widths, rows: [head, ...body] });
}

function callout(text, fill = "FFF6C9", edge = "C9B458") {
  const b = { style: BorderStyle.SINGLE, size: 6, color: edge };
  return new Table({
    width: { size: W, type: WidthType.DXA }, columnWidths: [W],
    rows: [new TableRow({ children: [new TableCell({
      borders: { top: b, bottom: b, left: { style: BorderStyle.SINGLE, size: 24, color: edge }, right: b },
      width: { size: W, type: WidthType.DXA }, shading: { type: ShadingType.CLEAR, fill, color: "auto" },
      margins: { top: 80, bottom: 80, left: 160, right: 160 },
      children: (Array.isArray(text) ? text : [text]).map((t) => new Paragraph({ children: runs(t, { size: 20 }), spacing: { after: 40, line: 260 } })),
    })] })],
  });
}

const spacer = () => new Paragraph({ children: [], spacing: { after: 80 } });

function image(file, caption, widthPx = 610) {
  const buf = fs.readFileSync(path.join(__dirname, "img", file));
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  const scale = widthPx / w;
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { before: 120, after: 40 }, keepNext: true,
      children: [new ImageRun({ type: "png", data: buf, transformation: { width: widthPx, height: Math.round(h * scale) },
        altText: { title: caption, description: caption, name: file } })],
    }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [new TextRun({ text: caption, italics: true, size: 18, color: "566573" })] }),
  ];
}

module.exports = { W, FONT, numberingConfigs, p, h1, h1nb, h2, h3, bullets, numbered, code, table, callout, spacer, image, runs, PageBreak, Paragraph, TextRun };
