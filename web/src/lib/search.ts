/**
 * Catalogue search: forgiving, ranked matching for test / package / scan names. The same rules run on the website
 * (src/catalogue/catalogue-search.ts on the API — keep the two in step) so the app, the website and every "add a test" picker find the
 * same things.
 *
 * - Every word of the query must match somewhere (title, code, category, included tests, other names), in any
 *   order: "vit d" finds "Vitamin D (25-OH)", "profile thyroid" finds "Thyroid Profile".
 * - A word matches a whole word, the start of a word, or (3+ letters) part of a word; long words also match with
 *   one or two typos ("thyriod", "cholestrol").
 * - Common short forms and lay words are understood: CBC, LFT, KFT/RFT, TSH, HbA1c, sugar → glucose, …
 * - British / American spellings are the same: haemoglobin = hemoglobin, anaemia = anemia, oestradiol = estradiol.
 * - Results are ranked: name matches before matches in the included tests; a name that starts with the query first.
 */

export type SearchFields = {
  title: string;
  code?: string | null | undefined;
  category?: string | null | undefined;
  /** Included tests / parameters, other names, modality, labels… */
  extra?: (string | null | undefined)[];
};

// Each group: words / phrases that mean the same thing for search.
const SYNONYM_GROUPS: string[][] = [
  ['cbc', 'complete blood count', 'hemogram'],
  ['lft', 'liver function', 'liver'],
  ['kft', 'rft', 'kidney function', 'renal function', 'kidney', 'renal'],
  ['tft', 'thyroid', 'thyroid function', 'thyroid profile'],
  ['tsh', 'thyroid stimulating hormone'],
  ['hba1c', 'glycated', 'glycosylated', 'a1c'],
  ['sugar', 'glucose', 'diabetes', 'diabetic', 'fbs', 'ppbs', 'rbs'],
  ['lipid', 'cholesterol', 'triglyceride', 'hdl', 'ldl'],
  ['vit', 'vitamin'],
  ['b12', 'vitamin b12', 'cobalamin'],
  ['crp', 'c reactive protein'],
  ['esr', 'erythrocyte sedimentation'],
  ['psa', 'prostate specific antigen', 'prostate'],
  ['iron', 'ferritin', 'tibc'],
  ['sgpt', 'alt', 'alanine'],
  ['sgot', 'ast', 'aspartate'],
  ['bilirubin', 'jaundice'],
  ['urine', 'urinalysis'],
  ['stool', 'faeces', 'feces', 'motion'],
  ['dengue', 'ns1'],
  ['typhoid', 'widal', 'typhidot'],
  ['malaria', 'malarial parasite'],
  ['covid', 'coronavirus', 'rt pcr', 'sars'],
  ['full body', 'full body checkup', 'health checkup', 'health package', 'whole body'],
  ['xray', 'x ray', 'radiograph'],
  ['usg', 'ultrasound', 'sonography'],
  ['ct scan', 'cat scan'],
  ['mri', 'magnetic resonance'],
  ['ecg', 'ekg', 'electrocardiogram'],
  ['hb', 'hemoglobin'],
  ['uric', 'uric acid', 'gout'],
  ['calcium', 'ca'],
  ['pregnancy', 'beta hcg', 'hcg'],
  ['pcod', 'pcos', 'polycystic'],
  ['heart', 'cardiac'],
  ['allergy', 'ige'],
  ['arthritis', 'ra factor', 'rheumatoid'],
];

/** lower-case, letters/digits only, British → American spellings, single spaces. */
export function normalizeSearchText(s: string | null | undefined): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/haem/g, 'hem')
    .replace(/anaem/g, 'anem')
    .replace(/oestr/g, 'estr')
    .replace(/faec/g, 'fec')
    .replace(/\s+/g, ' ')
    .trim();
}

const NORMALIZED_GROUPS = SYNONYM_GROUPS.map((g) => g.map(normalizeSearchText));
// Written without the space.
const GLUED = new Map<string, string>([
  ['vitd', 'vitamin d'],
  ['vitd3', 'vitamin d'],
  ['vitb12', 'vitamin b12'],
  ['xray', 'x ray'],
]);

/** Typos between two words (a swapped pair of letters counts as one), stopping early past `max`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let before: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, before[j - 2]! + 1);
      cur.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    before = prev;
    prev = cur;
  }
  return prev[b.length]!;
}

/**
 * How well one query word matches a text's words: 3 whole word, 2 start of a word, 1 inside a word / typo, 0 none.
 * `strict` (a synonym the person did not type): short words must be a whole word and no typos are allowed — so
 * "calcium" bringing in "ca" never matches "cardiac".
 */
function wordScore(token: string, words: string[], strict: boolean): number {
  let best = 0;
  for (const w of words) {
    if (w === token) return 3;
    if (strict) {
      if (token.length >= 4 && w.startsWith(token)) best = Math.max(best, 2);
      continue;
    }
    if (w.startsWith(token)) best = Math.max(best, 2);
    else if (token.length >= 3 && w.includes(token)) best = Math.max(best, 1);
    else if (best < 1 && token.length >= 4 && w.length >= 4) {
      const allowed = token.length >= 8 ? 2 : 1;
      if (editDistance(token, w, allowed) <= allowed) best = 1;
    }
  }
  return best;
}

/** A phrase matches when every one of its words does (any order). */
function phraseScore(phrase: string, words: string[], strict: boolean): number {
  const parts = phrase.split(' ').filter(Boolean);
  let total = 0;
  for (const p of parts) {
    const s = wordScore(p, words, strict);
    if (s === 0) return 0;
    total += s;
  }
  return total / parts.length;
}

type Alternative = { text: string; strict: boolean };
export type PreparedQuery = { tokens: string[]; alternatives: Alternative[][]; full: string };

/** Splits the query into words and works out, for each, the other words / phrases that mean the same. */
export function prepareQuery(query: string): PreparedQuery | null {
  const normalized = normalizeSearchText(query);
  if (!normalized) return null;
  const full = normalized
    .split(' ')
    .map((t) => GLUED.get(t) ?? t)
    .join(' ');
  const tokens = full.split(' ');
  const synonyms = (t: string) =>
    NORMALIZED_GROUPS.filter((g) => g.includes(t))
      .flat()
      .filter((x) => x !== t);
  const alternatives: Alternative[][] = tokens.map((t) => [{ text: t, strict: false }, ...synonyms(t).map((x) => ({ text: x, strict: true }))]);
  // A two-word phrase in a group (e.g. "full body", "liver function") also brings in its group.
  for (let i = 0; i + 1 < tokens.length; i++) {
    const extra = synonyms(tokens[i] + ' ' + tokens[i + 1]).map((x) => ({ text: x, strict: true }));
    alternatives[i]!.push(...extra);
    alternatives[i + 1]!.push(...extra);
  }
  return { tokens, alternatives, full };
}

/** 0 = no match; higher = better. */
export function searchScore(fields: SearchFields, q: PreparedQuery): number {
  const title = normalizeSearchText(fields.title);
  const titleWords = title.split(' ');
  const code = normalizeSearchText(fields.code);
  const codeWords = code.split(' ').filter(Boolean);
  const categoryWords = normalizeSearchText(fields.category).split(' ').filter(Boolean);
  const extraWords = normalizeSearchText((fields.extra ?? []).filter(Boolean).join(' '))
    .split(' ')
    .filter(Boolean);

  let score = 0;
  for (const alts of q.alternatives) {
    let best = 0;
    for (const { text, strict } of alts) {
      best = Math.max(
        best,
        phraseScore(text, titleWords, strict) * 3,
        phraseScore(text, codeWords, strict) * 3,
        phraseScore(text, categoryWords, strict) * 1.2,
        phraseScore(text, extraWords, strict),
      );
    }
    if (best === 0) return 0; // every word must match somewhere
    score += best;
  }
  if (title === q.full) score += 20;
  else if (title.startsWith(q.full)) score += 10;
  else if (title.includes(q.full)) score += 5;
  if (code && code === q.full) score += 15;
  return score;
}

/** Keeps the items that match, best first (ties keep their original order). */
export function rankBySearch<T>(items: T[], query: string, fields: (item: T) => SearchFields): T[] {
  const q = prepareQuery(query);
  if (!q) return items;
  return items
    .map((item, i) => ({ item, i, s: searchScore(fields(item), q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.item);
}
