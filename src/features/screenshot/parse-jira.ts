export const jiraTypes = ['Bug', 'Story', 'Task', 'Epic', 'Sub-task'] as const;
export type JiraType = typeof jiraTypes[number];
export interface OcrLine {
  text: string;
  confidence: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}
export interface JiraCandidate {
  key: string;
  summary: string;
  jiraType: JiraType | null;
  confidence: number;
}
export const isIssueKey = (key: string) => /^[A-Z][A-Z0-9]*-\d+$/.test(key);
export const suggestedBranch = (type: JiraType | null) => type === 'Bug' ? 'bugfix' : 'feature';

// Geometry keeps wrapped headings together; related issue keys remain separate candidates.
// This is a suggestion, never authority to save or replace a form.
export function parseJira(lines: OcrLine[]): JiraCandidate[] {
  const ordered = [...lines].filter(line => line.text.trim()).sort((a, b) => a.bbox.y0 - b.bbox.y0 || a.bbox.x0 - b.bbox.x0);
  const candidates = new Map<string, JiraCandidate>();
  for (const [index, line] of ordered.entries()) {
    const keys = line.text.match(/\b[A-Z][A-Z0-9]*-\d+\b/g) ?? [];
    for (const key of keys) {
      if (candidates.has(key)) continue;
      const following: OcrLine[] = [];
      for (const next of ordered.slice(index + 1, index + 12)) {
        if (/\b[A-Z][A-Z0-9]*-\d+\b/.test(next.text)) break;
        following.push(next);
      }
      const typeLine = following.find(item => /^(?:Issue\s+)?Type\s*:?\s*(Bug|Story|Task|Epic|Sub-task)\s*$/i.test(item.text.trim()));
      const typeText = typeLine?.text.match(/(Bug|Story|Task|Epic|Sub-task)\s*$/i)?.[1];
      const jiraType = jiraTypes.find(type => type.toLowerCase() === typeText?.toLowerCase()) ?? null;
      const inline = line.text.slice(line.text.indexOf(key) + key.length).replace(/^[\s:|/–—-]+/, '').trim();
      const heading = following.find(item => !/^(?:Type|Issue Type|Status|Assignee|Reporter|Details|Description|Priority|Attachments|Activity|To do|In progress|Done)\b/i.test(item.text.trim()));
      const titleLines: OcrLine[] = [];
      if (!inline && heading) {
        titleLines.push(heading);
        const start = following.indexOf(heading);
        for (const next of following.slice(start + 1)) {
          const previous = titleLines[titleLines.length - 1];
          const height = previous.bbox.y1 - previous.bbox.y0;
          if (next.bbox.y0 - previous.bbox.y1 > height * 0.9 || Math.abs(next.bbox.x0 - heading.bbox.x0) > height * 2 || Math.abs((next.bbox.y1 - next.bbox.y0) - height) > height * 0.3 || /^(?:Type|Issue Type|Status|Assignee|Reporter|Details|Description|Priority|Attachments|Activity)\b/i.test(next.text.trim())) break;
          titleLines.push(next);
        }
      }
      const summary = (inline || titleLines.map(item => item.text.replace(/^Summary\s*:\s*/i, '').trim()).join(' ')).slice(0, 500);
      candidates.set(key, { key, summary, jiraType, confidence: Math.min(line.confidence, ...titleLines.map(item => item.confidence)) });
    }
  }
  return [...candidates.values()];
}
