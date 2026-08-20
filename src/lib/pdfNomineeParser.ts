import * as pdfjs from "pdfjs-dist";

// Set worker source to CDN matching the pdfjs-dist version
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version || "3.11.174"}/pdf.worker.min.js`;

export interface ParsedNominee {
  id: string;
  name: string;
  department: string;
  level: string;
  bio: string;
  category: string;
}

/**
 * Extracts raw lines of text from a PDF file
 */
export async function extractTextFromPDF(file: File): Promise<string[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const lines: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    // Group text items by approximate y-coordinate
    const lineMap = new Map<number, { x: number; text: string }[]>();

    for (const item of textContent.items) {
      if ("str" in item && item.str.trim().length > 0) {
        // Y transform coordinate rounded to bucket
        const y = Math.round(item.transform[5]);
        const x = item.transform[4];
        if (!lineMap.has(y)) {
          lineMap.set(y, []);
        }
        lineMap.get(y)!.push({ x, text: item.str });
      }
    }

    // Sort y descending (top of page to bottom)
    const sortedY = Array.from(lineMap.keys()).sort((a, b) => b - a);

    for (const y of sortedY) {
      const itemsOnLine = lineMap.get(y)!;
      // Sort x ascending (left to right)
      itemsOnLine.sort((a, b) => a.x - b.x);
      const fullLine = itemsOnLine.map((i) => i.text).join(" ").trim();
      if (fullLine) {
        lines.push(fullLine);
      }
    }
  }

  return lines;
}

const isDocHeader = (line: string): boolean =>
  /^(?:ABCOSSA|END OF YEAR|DINNER|AWARDS?\s+NOMINATIONS?|PAGE\s+\d+|TABLE OF CONTENTS)/i.test(line);

const isCategoryTitle = (line: string): boolean => {
  if (isDocHeader(line)) return false;
  if (/^[•\u2022\u25cf\u25cb\u25e6\-*]\s*/.test(line)) return false;

  if (/^(?:category|award|nomination category)\s*[:-]/i.test(line)) return true;
  if (/(?:of the year|student choice|\(ta\)|best pals|couples of|personality of)/i.test(line)) return true;
  if (
    /^(?:Most\s|Best\s|Face\s+of|Class\s+Rep|Student\s|Committee\s|Graduate\s|Sophomore\s|Junior\s|Senior\s|Lecturer\s|Executive\s|Technician\s|Gentleman\s|Lady\s|Sports\s|Teaching\s+Assistant)/i.test(
      line
    )
  )
    return true;

  // Short title line that is capitalized and has no trailing punctuation
  if (line.length <= 45 && !line.includes(",") && !/^\d+$/.test(line) && /^[A-Z]/.test(line)) {
    return true;
  }

  return false;
};

/**
 * Parses raw text lines into structured nominee entries
 */
export function parseNomineesFromLines(lines: string[]): {
  nominees: ParsedNominee[];
  categories: string[];
} {
  const nominees: ParsedNominee[] = [];
  const detectedCategories = new Set<string>();
  let currentCategory = "";
  let lastNominee: ParsedNominee | null = null;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx].trim();
    if (!line || isDocHeader(line)) continue;

    // Check if line is an explicit or implicit category title
    if (isCategoryTitle(line)) {
      const catTitle = line
        .replace(/^(?:category|award|nomination category)\s*[:-]\s*/i, "")
        .replace(/\s+/g, " ")
        .trim();

      currentCategory = catTitle;
      detectedCategories.add(catTitle);
      lastNominee = null;
      continue;
    }

    // Check if line contains bullet points (e.g. "• Samuel Duah • Carlos Nartey")
    if (line.includes("•") || /^[•\u2022\u25cf\u25cb\u25e6]/.test(line)) {
      const bulletItems = line
        .split(/[•\u2022\u25cf\u25cb\u25e6]/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      for (const item of bulletItems) {
        const parsed = parseSingleNomineeString(item, currentCategory);
        nominees.push(parsed);
        lastNominee = parsed;
      }
      continue;
    }

    // Check delimiter-separated lines (e.g. "1. John Doe | Biochemistry | Level 300")
    const parts = line.split(/[\t|]|\s{2,}|\s*[-–—]\s*/).map((p) => p.replace(/^\d+[.)]\s*/, "").trim()).filter(Boolean);
    if (parts.length >= 2 && !isCategoryTitle(line)) {
      const parsed = parseSingleNomineeString(line, currentCategory);
      nominees.push(parsed);
      lastNominee = parsed;
      continue;
    }

    // If numbered or bulleted list item e.g. "1. Samuel Mensah - Biochemistry"
    const numberedMatch = line.match(/^(?:\d+[.)]|\*|-)\s+(.+)$/);
    if (numberedMatch) {
      const parsed = parseSingleNomineeString(numberedMatch[1], currentCategory);
      nominees.push(parsed);
      lastNominee = parsed;
      continue;
    }

    // Fallback: If previous nominee exists and this line looks like a continuation (e.g. wrapped name or description)
    if (lastNominee) {
      if (lastNominee.bio) {
        lastNominee.bio = `${lastNominee.bio} ${line}`.trim();
      } else if (!lastNominee.name.includes(",")) {
        lastNominee.name = `${lastNominee.name} ${line}`.trim();
      } else {
        lastNominee.name = `${lastNominee.name}, ${line}`.trim();
      }
    } else {
      // Unclassified line - add as nominee under current category
      const parsed = parseSingleNomineeString(line, currentCategory);
      nominees.push(parsed);
      lastNominee = parsed;
    }
  }

  return {
    nominees,
    categories: Array.from(detectedCategories),
  };
}

function parseSingleNomineeString(raw: string, category: string): ParsedNominee {
  // Strip initial number prefix e.g. "1. " or "- "
  const cleaned = raw.replace(/^\d+[.)]\s*/, "").trim();

  // Check structured parts e.g. "Name | Department | Level 300 | Bio"
  const parts = cleaned.split(/[\t|]|\s*[-–—]\s*/).map((s) => s.trim()).filter(Boolean);

  let name = cleaned;
  let department = "";
  let level = "";
  let bio = "";

  if (parts.length >= 2) {
    name = parts[0];
    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (/^(?:L\d{3}|\d{3}|level\s*\d{3}|year\s*\d)$/i.test(part)) {
        level = part;
      } else if (
        /biology|chemistry|biochemistry|science|botany|zoology|department|dept|student/i.test(part) ||
        (!department && part.length < 35)
      ) {
        department = part;
      } else {
        bio = bio ? `${bio} ${part}` : part;
      }
    }
  }

  return {
    id: crypto.randomUUID(),
    name,
    department,
    level,
    bio,
    category: category || "General Nominees",
  };
}

/**
 * High-level function to parse a PDF file into candidate nominee records and categories
 */
export async function parsePDFNomineeFile(file: File): Promise<{
  lines: string[];
  nominees: ParsedNominee[];
  categories: string[];
}> {
  const lines = await extractTextFromPDF(file);
  const { nominees, categories } = parseNomineesFromLines(lines);

  // If auto-pattern matching returned nothing but text exists, fallback to line-by-line entry proposals
  if (nominees.length === 0 && lines.length > 0) {
    const fallbackNominees: ParsedNominee[] = lines
      .filter((l) => l.trim().length > 2 && !isDocHeader(l))
      .slice(0, 50)
      .map((l) => ({
        id: crypto.randomUUID(),
        name: l.replace(/^\d+[.)]\s*/, "").split(/,|-|\|/)[0].trim(),
        department: "",
        level: "",
        bio: l,
        category: "General Nominees",
      }));
    return { lines, nominees: fallbackNominees, categories: ["General Nominees"] };
  }

  return { lines, nominees, categories };
}
