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
        // Y transform coordinate
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

/**
 * Parses raw text lines into structured nominee entries
 */
export function parseNomineesFromLines(lines: string[]): ParsedNominee[] {
  const nominees: ParsedNominee[] = [];
  let currentCategory = "";
  let currentNominee: Partial<ParsedNominee> | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Check if line specifies a category e.g., "Category: Best Researcher" or "CATEGORY: Student of the Year"
    const catMatch = trimmed.match(/^(?:category|award|nomination category)\s*[:-]\s*(.+)$/i);
    if (catMatch) {
      currentCategory = catMatch[1].trim();
      continue;
    }

    // Check key-value lines
    const nameKv = trimmed.match(/^(?:name|nominee|candidate)\s*[:-]\s*(.+)$/i);
    const deptKv = trimmed.match(/^(?:dept|department|programme|course)\s*[:-]\s*(.+)$/i);
    const levelKv = trimmed.match(/^(?:level|year|class)\s*[:-]\s*(.+)$/i);
    const bioKv = trimmed.match(/^(?:bio|reason|description|citation|about)\s*[:-]\s*(.+)$/i);

    if (nameKv) {
      if (currentNominee && currentNominee.name) {
        nominees.push(finalizeNominee(currentNominee, currentCategory));
      }
      currentNominee = { name: nameKv[1].trim() };
      continue;
    }

    if (currentNominee) {
      if (deptKv) {
        currentNominee.department = deptKv[1].trim();
        continue;
      }
      if (levelKv) {
        currentNominee.level = levelKv[1].trim();
        continue;
      }
      if (bioKv) {
        currentNominee.bio = bioKv[1].trim();
        continue;
      }
    }

    // Check delimiter-separated lines (e.g. "1. John Doe | Biochemistry | Level 300 | Active researcher")
    // or ("Jane Smith - Chemistry - 400 - Top student")
    const parts = trimmed.split(/[\t|]|\s{2,}|\s*[-–—]\s*/).map((p) => p.replace(/^\d+[.)]\s*/, "").trim()).filter(Boolean);

    if (parts.length >= 2) {
      // Looks like a structured row!
      if (currentNominee && currentNominee.name) {
        nominees.push(finalizeNominee(currentNominee, currentCategory));
        currentNominee = null;
      }

      const name = parts[0];
      let department = "";
      let level = "";
      let bio = "";

      for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        if (/^(?:L\d{3}|\d{3}|level \d{3}|year \d)$/i.test(part)) {
          level = part;
        } else if (/biology|chemistry|biochemistry|science|botany|zoology|department|dept/i.test(part) || (!department && part.length < 35)) {
          department = part;
        } else {
          bio = bio ? `${bio} ${part}` : part;
        }
      }

      nominees.push({
        id: crypto.randomUUID(),
        name,
        department,
        level,
        bio,
        category: currentCategory,
      });
      continue;
    }

    // If numbered or bulleted list item e.g. "1. Samuel Mensah - Biochemistry"
    const bulletMatch = trimmed.match(/^(?:\d+[.)]|\*|•|-)\s+(.+)$/);
    if (bulletMatch) {
      const candidateStr = bulletMatch[1].trim();
      const subParts = candidateStr.split(/,|-|–|\|/).map((s) => s.trim());

      if (currentNominee && currentNominee.name) {
        nominees.push(finalizeNominee(currentNominee, currentCategory));
        currentNominee = null;
      }

      nominees.push({
        id: crypto.randomUUID(),
        name: subParts[0],
        department: subParts[1] || "",
        level: subParts[2] || "",
        bio: subParts.slice(3).join(", ") || "",
        category: currentCategory,
      });
      continue;
    }

    // Fallback: If current nominee exists and we get unstructured text, append to bio
    if (currentNominee && currentNominee.name) {
      currentNominee.bio = currentNominee.bio ? `${currentNominee.bio} ${trimmed}` : trimmed;
    }
  }

  if (currentNominee && currentNominee.name) {
    nominees.push(finalizeNominee(currentNominee, currentCategory));
  }

  return nominees;
}

function finalizeNominee(raw: Partial<ParsedNominee>, defaultCategory: string): ParsedNominee {
  return {
    id: crypto.randomUUID(),
    name: raw.name || "Unknown Nominee",
    department: raw.department || "",
    level: raw.level || "",
    bio: raw.bio || "",
    category: raw.category || defaultCategory,
  };
}

/**
 * High-level function to parse a PDF file into candidate nominee records
 */
export async function parsePDFNomineeFile(file: File): Promise<{
  lines: string[];
  nominees: ParsedNominee[];
}> {
  const lines = await extractTextFromPDF(file);
  const nominees = parseNomineesFromLines(lines);

  // If auto-pattern matching returned nothing but text exists, fallback to line-by-line entry proposals
  if (nominees.length === 0 && lines.length > 0) {
    const fallbackNominees: ParsedNominee[] = lines
      .filter((l) => l.trim().length > 2 && !/^(table of contents|page \d+|nominees|list|abossa)/i.test(l.trim()))
      .slice(0, 50)
      .map((l) => ({
        id: crypto.randomUUID(),
        name: l.replace(/^\d+[.)]\s*/, "").split(/,|-|\|/)[0].trim(),
        department: "",
        level: "",
        bio: l,
        category: "",
      }));
    return { lines, nominees: fallbackNominees };
  }

  return { lines, nominees };
}
