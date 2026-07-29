import { createHash } from "node:crypto";
import type {
  MarketplaceNeedProfile,
  SolutionDecision,
  SolutionResearchResult
} from "@veltact/contracts";
import type { NeedReportRecord } from "./types.js";

type ReportLine = {
  text: string;
  font: "regular" | "bold";
  size: number;
  gapAfter?: number;
};

type RenderedLine = ReportLine & {
  x: number;
  y: number;
};

const pageWidth = 595;
const pageHeight = 842;
const horizontalMargin = 54;
const topMargin = 54;
const bottomMargin = 54;

export function createNeedReportRecord(input: {
  needProfileId: string;
  profile: MarketplaceNeedProfile;
  researchResult: SolutionResearchResult;
  selectedApproachId: string;
  selectionProvenance: NeedReportRecord["selectionProvenance"];
  solutionDecision?: SolutionDecision;
}): NeedReportRecord {
  const selectedApproach = input.researchResult.approaches.find(
    (approach) => approach.id === input.selectedApproachId
  );
  if (!selectedApproach) {
    throw new Error(
      "The selected solution does not belong to the persisted research result"
    );
  }
  if (
    input.solutionDecision &&
    (input.solutionDecision.researchResultId !== input.researchResult.id ||
      input.solutionDecision.selectedApproachIds.length !== 1 ||
      input.solutionDecision.selectedApproachIds[0] !==
        input.selectedApproachId)
  ) {
    throw new Error(
      "The execution decision does not match the selected report pathway"
    );
  }

  const generatedAt = input.selectionProvenance.selectedAt;
  const pdf = renderNeedReportPdf({
    profile: input.profile,
    researchResult: input.researchResult,
    solutionDecision: input.solutionDecision,
    selectedApproachId: input.selectedApproachId,
    selectedAt: input.selectionProvenance.selectedAt
  });

  return {
    id: `${input.needProfileId}:report:${input.researchResult.id}:${input.selectedApproachId}`,
    needProfileId: input.needProfileId,
    researchResultId: input.researchResult.id,
    solutionDecisionId: input.solutionDecision?.id,
    selectedApproachId: input.selectedApproachId,
    selectionProvenance: input.selectionProvenance,
    sourceMode: input.researchResult.sourceMode,
    generatedAt,
    fileName: `veltact-need-report-${safeFileSegment(
      input.needProfileId
    )}.pdf`,
    contentType: "application/pdf",
    byteLength: pdf.byteLength,
    sha256: createHash("sha256").update(pdf).digest("hex"),
    pdfBase64: pdf.toString("base64")
  };
}

export function readNeedReportPdf(report: NeedReportRecord): Buffer {
  const pdf = Buffer.from(report.pdfBase64, "base64");
  if (
    pdf.byteLength !== report.byteLength ||
    createHash("sha256").update(pdf).digest("hex") !== report.sha256
  ) {
    throw new Error("Persisted need report failed its integrity check");
  }
  return pdf;
}

function renderNeedReportPdf(input: {
  profile: MarketplaceNeedProfile;
  researchResult: SolutionResearchResult;
  solutionDecision?: SolutionDecision;
  selectedApproachId: string;
  selectedAt: string;
}): Buffer {
  const lines: ReportLine[] = [];
  const add = (
    text: string,
    options: Partial<Omit<ReportLine, "text">> = {}
  ) => {
    lines.push({
      text,
      font: options.font ?? "regular",
      size: options.size ?? 10,
      gapAfter: options.gapAfter
    });
  };

  add("VELTACT NEED AND SOLUTION REPORT", {
    font: "bold",
    size: 18,
    gapAfter: 8
  });
  add(input.profile.title, { font: "bold", size: 13, gapAfter: 4 });
  add(
    `Selected ${formatDateTime(input.selectedAt)} | Evidence mode: ${input.researchResult.sourceMode.toUpperCase()}`,
    { size: 9, gapAfter: 12 }
  );

  add("NEED PROFILE", { font: "bold", size: 12, gapAfter: 4 });
  add(
    `Problem summary: ${input.profile.problemSummary ?? input.profile.description}`
  );
  add(
    `Equipment or technology: ${listOrNotProvided(
      input.profile.equipmentOrTechnology ??
        input.profile.equipmentTechnology
    )}`
  );
  add(
    `Required capability: ${listOrNotProvided(
      input.profile.requiredCapabilities ??
        input.profile.requiredCapability
    )}`
  );
  add(`Industry: ${input.profile.industry}`);
  add(`Location: ${input.profile.location}`);
  add(
    `Urgency: ${
      input.profile.urgencyDays === undefined
        ? "Not provided"
        : `within ${input.profile.urgencyDays} day${
            input.profile.urgencyDays === 1 ? "" : "s"
          }`
    }`
  );
  add(
    `Budget: ${
      input.profile.budgetAud === undefined
        ? "Not provided"
        : `AUD ${input.profile.budgetAud.toLocaleString("en-AU")}`
    }`
  );
  add(
    `Buyer priority: ${formatLabel(
      input.profile.buyerPriority ?? "not_provided"
    )}`
  );
  add(`Constraints: ${listOrNotProvided(input.profile.constraints)}`, {
    gapAfter: 12
  });

  add("RESEARCH OVERVIEW", { font: "bold", size: 12, gapAfter: 4 });
  add(input.researchResult.overview, { gapAfter: 10 });

  add("SOLUTION PATHWAYS", { font: "bold", size: 12, gapAfter: 5 });
  for (const [index, approach] of input.researchResult.approaches.entries()) {
    const selected = approach.id === input.selectedApproachId;
    add(
      `${index + 1}. ${selected ? "SELECTED - " : ""}${approach.title}`,
      {
        font: "bold",
        size: 11,
        gapAfter: 2
      }
    );
    add(approach.summary);
    add(`Why this pathway: ${approach.rationale}`);
    add(
      `Required capabilities: ${approach.requiredCapabilities.join(", ")}`
    );
    add(`Confidence: ${Math.round(approach.confidence * 100)}%`, {
      gapAfter: 8
    });
  }

  const selectedApproach = input.researchResult.approaches.find(
    (approach) => approach.id === input.selectedApproachId
  );
  if (!selectedApproach) {
    throw new Error("Selected solution disappeared while rendering report");
  }

  add("SELECTED PATHWAY DETAIL", {
    font: "bold",
    size: 12,
    gapAfter: 4
  });
  add(
    `Execution decision: ${
      input.solutionDecision
        ? formatLabel(input.solutionDecision.decision)
        : "Not recorded"
    }`
  );
  add(`Selected pathway: ${selectedApproach.title}`);
  if (!input.solutionDecision) {
    add(
      "Downloading this report records the selected pathway only. It does not choose local execution, hybrid delivery or supplier outsourcing."
    );
  }
  if (input.solutionDecision?.buyerNote) {
    add(`Buyer note: ${input.solutionDecision.buyerNote}`);
  }
  add("Safe factory preparation:", { font: "bold", size: 10 });
  for (const action of selectedApproach.localActions) {
    add(`- ${action}`);
  }
  add("Specialist escalation triggers:", { font: "bold", size: 10 });
  for (const trigger of selectedApproach.outsourceTriggers) {
    add(`- ${trigger}`);
  }
  add("Selected-pathway risks:", { font: "bold", size: 10 });
  for (const risk of selectedApproach.risks) {
    add(`- ${risk}`);
  }
  add("", { gapAfter: 8 });

  add("MISSING INFORMATION", { font: "bold", size: 12, gapAfter: 4 });
  if (input.researchResult.missingInformation.length === 0) {
    add("None recorded.");
  } else {
    for (const item of input.researchResult.missingInformation) {
      add(`- ${item}`);
    }
  }
  add("", { gapAfter: 8 });

  add("EVIDENCE AND CITATIONS", {
    font: "bold",
    size: 12,
    gapAfter: 4
  });
  for (const [index, citation] of input.researchResult.citations.entries()) {
    add(`${index + 1}. ${citation.title}`, { font: "bold", size: 10 });
    add(citation.url, { size: 9 });
    add(
      `${citation.evidenceNote} Provider: ${citation.provider}; accessed ${formatDateTime(citation.accessedAt)}.`,
      { size: 9, gapAfter: 5 }
    );
  }

  add("SAFETY NOTICE", { font: "bold", size: 12, gapAfter: 4 });
  add(input.researchResult.safetyNotice);
  add(
    "This report is decision support based on the persisted buyer-reviewed need, research evidence and selected pathway. It is not engineering sign-off.",
    { font: "bold", size: 9 }
  );

  return buildPdf(lines);
}

function buildPdf(lines: ReportLine[]): Buffer {
  const pages = paginate(lines);
  const objectCount = 5 + pages.length * 2;
  const regularFontObject = 3 + pages.length * 2;
  const boldFontObject = regularFontObject + 1;
  const infoObject = boldFontObject + 1;
  const objects = new Map<number, string>();

  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  const pageObjectIds = pages.map((_page, index) => 3 + index * 2);
  objects.set(
    2,
    `<< /Type /Pages /Count ${pages.length} /Kids [${pageObjectIds
      .map((id) => `${id} 0 R`)
      .join(" ")}] >>`
  );

  for (const [index, page] of pages.entries()) {
    const pageObject = 3 + index * 2;
    const contentObject = pageObject + 1;
    const content = page
      .map((line) => {
        const font = line.font === "bold" ? "F2" : "F1";
        return [
          "BT",
          `/${font} ${line.size} Tf`,
          `1 0 0 1 ${line.x} ${line.y} Tm`,
          `(${escapePdfText(line.text)}) Tj`,
          "ET"
        ].join("\n");
      })
      .join("\n");
    objects.set(
      pageObject,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${regularFontObject} 0 R /F2 ${boldFontObject} 0 R >> >> /Contents ${contentObject} 0 R >>`
    );
    objects.set(
      contentObject,
      `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`
    );
  }

  objects.set(
    regularFontObject,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  );
  objects.set(
    boldFontObject,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>"
  );
  objects.set(
    infoObject,
    "<< /Title (Veltact Need and Solution Report) /Author (Veltact) /Subject (Buyer-reviewed industrial need and selected solution) >>"
  );

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n%Veltact\n", "latin1")];
  const offsets = new Array<number>(objectCount + 1).fill(0);
  let offset = chunks[0].byteLength;
  for (let objectNumber = 1; objectNumber <= objectCount; objectNumber += 1) {
    const body = objects.get(objectNumber);
    if (!body) {
      throw new Error(`Missing PDF object ${objectNumber}`);
    }
    offsets[objectNumber] = offset;
    const chunk = Buffer.from(
      `${objectNumber} 0 obj\n${body}\nendobj\n`,
      "latin1"
    );
    chunks.push(chunk);
    offset += chunk.byteLength;
  }

  const xrefOffset = offset;
  const xref = [
    "xref",
    `0 ${objectCount + 1}`,
    "0000000000 65535 f ",
    ...offsets
      .slice(1)
      .map((item) => `${item.toString().padStart(10, "0")} 00000 n `),
    "trailer",
    `<< /Size ${objectCount + 1} /Root 1 0 R /Info ${infoObject} 0 R >>`,
    "startxref",
    xrefOffset.toString(),
    "%%EOF",
    ""
  ].join("\n");
  chunks.push(Buffer.from(xref, "latin1"));
  return Buffer.concat(chunks);
}

function paginate(lines: ReportLine[]): RenderedLine[][] {
  const pages: RenderedLine[][] = [[]];
  let y = pageHeight - topMargin;

  for (const line of lines) {
    const maxCharacters = Math.max(
      30,
      Math.floor((pageWidth - horizontalMargin * 2) / (line.size * 0.52))
    );
    const wrappedLines = wrapText(normalisePdfText(line.text), maxCharacters);
    const headingReserve =
      line.font === "bold" && line.size >= 12 ? 30 : 0;
    if (
      y - line.size * 1.35 - headingReserve < bottomMargin
    ) {
      pages.push([]);
      y = pageHeight - topMargin;
    }
    for (const wrappedLine of wrappedLines) {
      const lineHeight = line.size * 1.35;
      if (y - lineHeight < bottomMargin) {
        pages.push([]);
        y = pageHeight - topMargin;
      }
      pages[pages.length - 1].push({
        ...line,
        text: wrappedLine,
        x: horizontalMargin,
        y
      });
      y -= lineHeight;
    }
    y -= line.gapAfter ?? 2;
  }

  return pages;
}

function wrapText(value: string, maxCharacters: number): string[] {
  if (value.length === 0) {
    return [""];
  }

  const words = value.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if (word.length > maxCharacters) {
      if (current) {
        lines.push(current);
        current = "";
      }
      for (let index = 0; index < word.length; index += maxCharacters) {
        lines.push(word.slice(index, index + maxCharacters));
      }
      continue;
    }

    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > maxCharacters) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) {
    lines.push(current);
  }
  return lines;
}

function escapePdfText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function normalisePdfText(value: string): string {
  return value
    .normalize("NFKD")
    .replaceAll("\u2013", "-")
    .replaceAll("\u2014", "-")
    .replaceAll("\u2018", "'")
    .replaceAll("\u2019", "'")
    .replaceAll("\u201c", "\"")
    .replaceAll("\u201d", "\"")
    .replace(/[^\x20-\x7e]/g, "?");
}

function listOrNotProvided(values: string[] | undefined): string {
  return values && values.length > 0 ? values.join(", ") : "Not provided";
}

function formatLabel(value: string): string {
  return value.replaceAll("_", " ");
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("en-AU", {
        timeZone: "Australia/Sydney",
        dateStyle: "medium",
        timeStyle: "short"
      });
}

function safeFileSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80);
}
