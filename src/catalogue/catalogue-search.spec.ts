import { rankBySearch, type SearchFields } from './catalogue-search';

type Item = SearchFields & { id: string };
const catalogue: Item[] = [
  { id: 'vitd', title: 'Vitamin D (25-OH)', category: 'Vitamins' },
  { id: 'b12', title: 'Vitamin B12', category: 'Vitamins' },
  { id: 'cbc', title: 'Complete Blood Count', code: 'CBC001', category: 'Hematology', extra: ['Haemoglobin', 'Platelet Count', 'WBC'] },
  { id: 'thyroid', title: 'Thyroid Profile', code: 'TFT01', category: 'Thyroid', extra: ['T3', 'T4', 'TSH'] },
  { id: 'lft', title: 'Liver Function Test', code: 'LFT01', extra: ['SGPT', 'SGOT', 'Bilirubin Total'] },
  { id: 'kft', title: 'Kidney Function Test', extra: ['Creatinine', 'Urea'] },
  { id: 'glucose', title: 'Glucose Fasting', category: 'Diabetes' },
  { id: 'hba1c', title: 'HbA1c', category: 'Diabetes' },
  { id: 'lipid', title: 'Lipid Profile', extra: ['Total Cholesterol', 'HDL', 'LDL'] },
  { id: 'calcium', title: 'Calcium Serum' },
  { id: 'cardiac', title: 'Cardiac Risk Markers' },
  { id: 'fullbody', title: 'MD Care Full Body Checkup', extra: ['Complete Blood Count', 'Thyroid Profile'] },
  { id: 'xray', title: 'X-Ray Chest PA View', extra: ['X-Ray'] },
];
const ids = (q: string) => rankBySearch(catalogue, q, (i) => i).map((i) => i.id);

describe('catalogue search', () => {
  it('matches words in any order and partial words', () => {
    expect(ids('vit d')[0]).toBe('vitd');
    expect(ids('profile thyroid')[0]).toBe('thyroid');
    expect(ids('vitamin')).toEqual(['vitd', 'b12']);
  });

  it('understands short forms and lay words', () => {
    expect(ids('cbc')[0]).toBe('cbc');
    expect(ids('lft')[0]).toBe('lft');
    expect(ids('kft')).toContain('kft');
    expect(ids('rft')).toContain('kft');
    expect(ids('sugar')).toEqual(expect.arrayContaining(['glucose', 'hba1c']));
    expect(ids('cholesterol')[0]).toBe('lipid');
    expect(ids('tsh')).toContain('thyroid');
    expect(ids('full body')[0]).toBe('fullbody');
    expect(ids('xray')).toContain('xray');
    expect(ids('vitd')[0]).toBe('vitd');
  });

  it('forgives typos and British spellings', () => {
    expect(ids('thyriod')).toContain('thyroid');
    expect(ids('cholestrol')).toContain('lipid');
    expect(ids('hemoglobin')).toContain('cbc');
  });

  it('a synonym short form never matches the start of another word', () => {
    // "calcium" brings in "ca", which must not match "cardiac".
    expect(ids('calcium')).toEqual(['calcium']);
  });

  it('a test code matches, and name matches rank above included-test matches', () => {
    expect(ids('cbc001')[0]).toBe('cbc');
    expect(ids('thyroid')[0]).toBe('thyroid'); // the full body package also includes it, but ranks below
    expect(ids('thyroid')).toContain('fullbody');
  });

  it('nothing for nonsense; everything for an empty query', () => {
    expect(ids('zzqx')).toEqual([]);
    expect(ids('  ')).toHaveLength(catalogue.length);
  });
});
