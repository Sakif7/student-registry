// Small but genuine PDF and Word documents, built in code so the repository
// holds no binary fixtures. The seed stores them as demo submissions, and the
// tests upload them. Both open in ordinary readers.
import { crc32 } from "node:zlib";

/**
 * A one-page PDF showing a heading and lines of text. Characters outside
 * Latin-1 are replaced with "?", as the built-in Helvetica font can't show
 * them.
 */
export function samplePdf(heading: string, lines: readonly string[]): Buffer {
  const text = [
    "BT",
    `/F1 18 Tf 72 770 Td (${pdfString(heading)}) Tj`,
    "/F1 11 Tf",
    ...lines.map((line) => `0 -20 Td (${pdfString(line)}) Tj`),
    "ET",
  ].join("\n");
  const content = Buffer.from(text, "latin1");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] " +
      "/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica " +
      "/Encoding /WinAnsiEncoding >>",
    `<< /Length ${content.length} >>\nstream\n${content.toString("latin1")}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  pdf += `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
}

/**
 * A Word document (.docx) with a heading and paragraphs. With
 * `macroEnabled`, it declares itself a macro-enabled document (.docm)
 * instead, which the app must refuse whatever the file is called.
 */
export function sampleDocx(
  heading: string,
  paragraphs: readonly string[],
  { macroEnabled = false }: { macroEnabled?: boolean } = {},
): Buffer {
  const mainType = macroEnabled
    ? "application/vnd.ms-word.document.macroEnabled.main+xml"
    : "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml";
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const paragraph = (text: string, bold = false) =>
    `<w:p><w:r>${bold ? "<w:rPr><w:b/></w:rPr>" : ""}<w:t xml:space="preserve">${xmlText(text)}</w:t></w:r></w:p>`;

  return zip([
    [
      "[Content_Types].xml",
      `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        `<Override PartName="/word/document.xml" ContentType="${mainType}"/>` +
        "</Types>",
    ],
    [
      "_rels/.rels",
      `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
        "</Relationships>",
    ],
    [
      "word/document.xml",
      `${xml}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` +
        paragraph(heading, true) +
        paragraphs.map((text) => paragraph(text)).join("") +
        "<w:sectPr/></w:body></w:document>",
    ],
  ]);
}

// WinAnsiEncoding puts typographic punctuation where Latin-1 has control
// codes, e.g. the curly apostrophe a name like O’Connor may use.
const WIN_ANSI_PUNCTUATION: Record<string, string> = {
  "–": "\x96", // en dash
  "—": "\x97", // em dash
  "‘": "\x91", // left single quotation mark
  "’": "\x92", // right single quotation mark (apostrophe)
  "“": "\x93", // left double quotation mark
  "”": "\x94", // right double quotation mark
  "…": "\x85", // ellipsis
};

/** Escapes text for a PDF string literal in WinAnsiEncoding. */
function pdfString(text: string): string {
  return text
    .replace(
      /[–—‘’“”…]/g,
      (character) => WIN_ANSI_PUNCTUATION[character] ?? "?",
    )
    .replace(/[^ -ÿ]/g, "?")
    .replace(/[\\()]/g, (character) => `\\${character}`);
}

function xmlText(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

// 1 January 2026, 00:00, in MS-DOS date format, so archives are reproducible.
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;

/** A ZIP archive of uncompressed ("stored") entries. */
function zip(entries: readonly (readonly [name: string, text: string])[]) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const [name, text] of entries) {
    const fileName = Buffer.from(name, "utf8");
    const data = Buffer.from(text, "utf8");
    const checksum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); // local file header signature
    local.writeUInt16LE(20, 4); // version needed to extract (2.0)
    local.writeUInt16LE(0x0800, 6); // flags: UTF-8 file names
    local.writeUInt16LE(0, 8); // compression: stored
    local.writeUInt16LE(0, 10); // modification time
    local.writeUInt16LE(DOS_DATE, 12); // modification date
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18); // compressed size
    local.writeUInt32LE(data.length, 22); // uncompressed size
    local.writeUInt16LE(fileName.length, 26);
    local.writeUInt16LE(0, 28); // extra field length
    locals.push(local, fileName, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); // central directory signature
    central.writeUInt16LE(20, 4); // version made by
    central.writeUInt16LE(20, 6); // version needed to extract
    central.writeUInt16LE(0x0800, 8); // flags: UTF-8 file names
    central.writeUInt16LE(0, 10); // compression: stored
    central.writeUInt16LE(0, 12); // modification time
    central.writeUInt16LE(DOS_DATE, 14); // modification date
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20); // compressed size
    central.writeUInt32LE(data.length, 24); // uncompressed size
    central.writeUInt16LE(fileName.length, 28);
    // Extra field, comment, disk number and attributes stay zero.
    central.writeUInt32LE(offset, 42); // offset of the local header
    centrals.push(central, fileName);

    offset += local.length + fileName.length + data.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); // end of central directory signature
  end.writeUInt16LE(entries.length, 8); // entries on this disk
  end.writeUInt16LE(entries.length, 10); // entries in total
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16); // offset of the central directory
  return Buffer.concat([...locals, directory, end]);
}
