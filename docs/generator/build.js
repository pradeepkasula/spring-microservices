const fs = require("fs");
const {
  Document, Packer, Paragraph, TextRun, AlignmentType, LevelFormat, Footer, Header, PageNumber, BorderStyle,
} = require("docx");
const L = require("./lib");

const body = [...require("./part1")(), ...require("./part2")(), ...require("./part3")()];

const cover = [
  new Paragraph({ spacing: { before: 2600 }, children: [] }),
  new Paragraph({ children: [new TextRun({ text: "Microservices Patterns", bold: true, size: 64, color: "1F4E79" })] }),
  new Paragraph({ children: [new TextRun({ text: "with Spring Boot and Spring Cloud", size: 40, color: "2E86C1" })], spacing: { after: 240 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: "2E86C1", space: 8 } } }),
  new Paragraph({ spacing: { before: 200, after: 120 }, children: [new TextRun({ text: "Project guide, pattern flows with diagrams, interview questions and production incident playbook", size: 26, color: "566573" })] }),
  new Paragraph({ spacing: { before: 1800, after: 60 }, children: [new TextRun({ text: "Contents", bold: true, size: 28, color: "1F4E79" })] }),
  ...[
    "1. Project overview",
    "2. How to run the code (with and without Docker)",
    "3. Pattern flows explained with diagrams",
    "4. Interview questions and answers (scenario based, 25 questions)",
    "5. Real-time incident scenarios and how to handle them (8 incidents)",
  ].map((t) => new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: t, size: 24 })] })),
  new Paragraph({ spacing: { before: 1400 }, children: [new TextRun({ text: "Based on the pattern catalog at microservices.io/patterns.", italics: true, size: 20, color: "7F8C8D" })] }),
];

const doc = new Document({
  creator: "Claude",
  title: "Microservices Patterns with Spring Boot",
  styles: {
    default: { document: { run: { font: L.FONT, size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: L.FONT, size: 36, bold: true, color: "1F4E79" },
        paragraph: { spacing: { before: 120, after: 160 }, keepNext: true, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: "2E86C1", space: 4 } } } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: L.FONT, size: 28, bold: true, color: "2E86C1" },
        paragraph: { spacing: { before: 280, after: 100 }, keepNext: true, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: L.FONT, size: 23, bold: true, color: "34495E" },
        paragraph: { spacing: { before: 180, after: 60 }, keepNext: true, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [
      { reference: "bullets", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 540, hanging: 270 } } } }] },
      ...L.numberingConfigs,
    ],
  },
  sections: [{
    properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } }, titlePage: true },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "Microservices Patterns with Spring Boot", size: 18, color: "7F8C8D" })] })] }),
               first: new Header({ children: [new Paragraph({ children: [] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: "Page ", size: 18, color: "7F8C8D" }), new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "7F8C8D" })] })] }),
               first: new Footer({ children: [new Paragraph({ children: [] })] }) },
    children: [...cover, ...body],
  }],
});

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync("Microservices-Patterns-Guide.docx", buf);
  console.log("written", buf.length);
});
