const queryRegex = /@query\s+([^{]+)\s*\{([\s\S]*?)\}/g;

export function extractQueryBlocks(classBody: string): {
  queries: Array<{ selector: string; rawBody: string }>;
  newBody: string;
} {
  const queries: Array<{ selector: string; rawBody: string }> = [];
  let newBody = classBody;
  let match: RegExpExecArray | null;

  while ((match = queryRegex.exec(classBody)) !== null) {
    const raw = match[0];
    const selector = match[1].trim();
    const rawQueryBlockBody = match[2].trim();
    newBody = newBody.replace(raw, '').trim();
    queries.push({ selector, rawBody: rawQueryBlockBody });
  }
  return { queries, newBody };
}
