const STOP_WORDS = new Set([
  'about', 'after', 'again', 'against', 'also', 'because', 'been', 'before',
  'being', 'between', 'both', 'could', 'does', 'doing', 'down', 'during',
  'each', 'from', 'further', 'have', 'having', 'here', 'into', 'more',
  'most', 'other', 'over', 'same', 'should', 'some', 'such', 'than', 'that',
  'their', 'them', 'then', 'there', 'these', 'they', 'this', 'those', 'through',
  'under', 'until', 'very', 'what', 'when', 'where', 'which', 'while', 'with',
  'would', 'your', 'you', 'the', 'and', 'for', 'are', 'was', 'were', 'but',
  'can', 'our', 'not', 'how', 'why', 'who', 'will', 'its', 'has', 'had', 'all',
  'any', 'use', 'used', 'using', 'does', 'did', 'get', 'got', 'make', 'made',
]);

function tokenize(value) {
  return (value.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_-]{1,}/gu) || [])
    .filter((term) => !STOP_WORDS.has(term));
}

function excerptAround(text, terms, maxLength = 300) {
  if (text.length <= maxLength) return text;

  const lowerText = text.toLowerCase();
  const positions = terms
    .map((term) => lowerText.indexOf(term))
    .filter((position) => position >= 0);
  const center = positions.length ? Math.min(...positions) : 0;
  const start = Math.max(0, Math.min(center - 75, text.length - maxLength));
  const end = Math.min(text.length, start + maxLength);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

function getRelevantPassages(question, documents, limit = 5) {
  const queryTerms = [...new Set(tokenize(question))];
  if (!queryTerms.length) return [];

  const passages = documents.flatMap((document) =>
    (document.passages || []).map((passage) => ({
      documentId: document._id,
      name: document.name,
      page: passage.page,
      text: passage.text,
      terms: tokenize(passage.text),
    }))
  );

  if (!passages.length) return [];

  const averageLength =
    passages.reduce((sum, passage) => sum + passage.terms.length, 0) /
    passages.length;
  const documentFrequency = new Map();

  for (const term of queryTerms) {
    documentFrequency.set(
      term,
      passages.reduce(
        (count, passage) => count + (passage.terms.includes(term) ? 1 : 0),
        0
      )
    );
  }

  const scored = passages
    .map((passage) => {
      const counts = new Map();
      for (const term of passage.terms) {
        counts.set(term, (counts.get(term) || 0) + 1);
      }

      let score = 0;
      for (const term of queryTerms) {
        const frequency = counts.get(term) || 0;
        if (!frequency) continue;

        const docsWithTerm = documentFrequency.get(term) || 0;
        const inverseDocumentFrequency = Math.log(
          1 + (passages.length - docsWithTerm + 0.5) / (docsWithTerm + 0.5)
        );
        const lengthFactor = averageLength
          ? 1.2 * (0.25 + 0.75 * (passage.terms.length / averageLength))
          : 1.2;
        score +=
          inverseDocumentFrequency *
          ((frequency * 2.2) / (frequency + lengthFactor));
      }

      return { ...passage, score };
    })
    .filter((passage) => passage.score > 0)
    .sort((left, right) => right.score - left.score);

  const perDocument = new Map();
  const selected = [];

  for (const passage of scored) {
    const id = String(passage.documentId);
    const count = perDocument.get(id) || 0;
    if (count >= 2) continue;

    selected.push({
      documentId: passage.documentId,
      name: passage.name,
      page: passage.page,
      text: passage.text,
      excerpt: excerptAround(passage.text, queryTerms),
      score: passage.score,
    });
    perDocument.set(id, count + 1);

    if (selected.length >= limit) break;
  }

  return selected;
}

module.exports = { getRelevantPassages };
