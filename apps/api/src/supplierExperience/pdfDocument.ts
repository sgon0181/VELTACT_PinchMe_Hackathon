type PdfSection = {
  heading: string;
  lines: string[];
};

type PdfDocumentInput = {
  title: string;
  subtitle: string;
  reference: string;
  sections: PdfSection[];
  footer: string;
};

type PdfLine = {
  font: "regular" | "bold";
  size: number;
  text: string;
  spacingAfter: number;
  keepWithNext?: boolean;
};

const pageWidth = 595;
const pageHeight = 842;
const marginX = 48;
const firstLineY = 760;
const bottomMargin = 58;

export function renderTextPdf(input: PdfDocumentInput): Buffer {
  const lines = documentLines(input);
  const pages = paginate(lines);
  const pageObjectNumbers = pages.map((_, index) => 5 + index * 2);
  const contentObjectNumbers = pages.map((_, index) => 6 + index * 2);
  const objects: string[] = [];

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] =
    `<< /Type /Pages /Count ${pages.length} /Kids [` +
    pageObjectNumbers.map((number) => `${number} 0 R`).join(" ") +
    "] >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

  pages.forEach((page, index) => {
    const pageNumber = pageObjectNumbers[index];
    const contentNumber = contentObjectNumbers[index];
    const stream = renderPage(page, index + 1, pages.length);
    objects[pageNumber] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> ` +
      `/Contents ${contentNumber} 0 R >>`;
    objects[contentNumber] =
      `<< /Length ${Buffer.byteLength(stream, "ascii")} >>\nstream\n${stream}\nendstream`;
  });

  return serialisePdf(objects);
}

function documentLines(input: PdfDocumentInput): PdfLine[] {
  const lines: PdfLine[] = [
    line("bold", 22, "VELTACT", 16),
    ...wrappedLines("bold", 18, input.title, 10, 58),
    ...wrappedLines("regular", 10, input.subtitle, 8, 92),
    line("regular", 9, `Reference: ${input.reference}`, 18)
  ];

  for (const section of input.sections) {
    lines.push(
      line("bold", 12, section.heading.toUpperCase(), 8, true)
    );
    for (const value of section.lines) {
      lines.push(...wrappedLines("regular", 10, value, 6, 92));
    }
    lines.push(line("regular", 8, "", 9));
  }

  lines.push(...wrappedLines("regular", 8, input.footer, 4, 112));
  return lines;
}

function paginate(lines: PdfLine[]) {
  const pages: PdfLine[][] = [[]];
  let remaining = firstLineY - bottomMargin;

  for (const [index, current] of lines.entries()) {
    const required = current.size * 1.25 + current.spacingAfter;
    const next = lines[index + 1];
    const keepWithNextRequired =
      current.keepWithNext && next
        ? required + next.size * 1.25 + next.spacingAfter
        : required;
    if (
      remaining < keepWithNextRequired &&
      pages.at(-1)?.length
    ) {
      pages.push([]);
      remaining = firstLineY - bottomMargin;
    }
    pages.at(-1)?.push(current);
    remaining -= required;
  }

  return pages;
}

function renderPage(lines: PdfLine[], pageNumber: number, pageCount: number) {
  const commands = [
    "0.62 0.12 0.16 rg",
    `0 ${pageHeight - 22} ${pageWidth} 22 re f`,
    "0.10 0.13 0.12 rg"
  ];
  if (pageNumber > 1) {
    commands.push(
      "BT",
      "/F2 9 Tf",
      `${marginX} 790 Td`,
      "(VELTACT / CONTINUED) Tj",
      "ET"
    );
  }
  let y = firstLineY;

  for (const current of lines) {
    if (current.text) {
      commands.push(
        "BT",
        `/${current.font === "bold" ? "F2" : "F1"} ${current.size} Tf`,
        `${marginX} ${y.toFixed(2)} Td`,
        `(${pdfString(current.text)}) Tj`,
        "ET"
      );
    }
    y -= current.size * 1.25 + current.spacingAfter;
  }

  commands.push(
    "0.42 0.47 0.45 rg",
    "BT",
    "/F1 8 Tf",
    `${marginX} 30 Td`,
    `(Veltact supplier document  |  Page ${pageNumber} of ${pageCount}) Tj`,
    "ET"
  );
  return commands.join("\n");
}

function serialisePdf(objects: string[]) {
  let output = "%PDF-1.4\n%VELTACT\n";
  const offsets = [0];

  for (let index = 1; index < objects.length; index += 1) {
    offsets[index] = Buffer.byteLength(output, "ascii");
    output += `${index} 0 obj\n${objects[index]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(output, "ascii");
  output += `xref\n0 ${objects.length}\n`;
  output += "0000000000 65535 f \n";
  for (let index = 1; index < objects.length; index += 1) {
    output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  output +=
    `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(output, "ascii");
}

function wrappedLines(
  font: PdfLine["font"],
  size: number,
  value: string,
  spacingAfter: number,
  maxCharacters: number
) {
  const wrapped = wrapText(value, maxCharacters);
  return wrapped.map((text, index) =>
    line(font, size, text, index === wrapped.length - 1 ? spacingAfter : 2)
  );
}

function wrapText(value: string, maxCharacters: number) {
  const paragraphs = ascii(value).split(/\r?\n/);
  const output: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      output.push("");
      continue;
    }
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (candidate.length <= maxCharacters) {
        current = candidate;
        continue;
      }
      if (current) output.push(current);
      current = word;
    }
    if (current) output.push(current);
  }
  return output;
}

function line(
  font: PdfLine["font"],
  size: number,
  text: string,
  spacingAfter: number,
  keepWithNext = false
): PdfLine {
  return { font, size, text, spacingAfter, keepWithNext };
}

function pdfString(value: string) {
  return ascii(value)
    .replaceAll("\\", "\\\\")
    .replaceAll("(", "\\(")
    .replaceAll(")", "\\)");
}

function ascii(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E\r\n]/g, "")
    .trim();
}
