import { lastValueFrom, of } from 'rxjs';
import { requireSignedUploadUrl, signUploadUrl, SignUploadUrlsInterceptor } from './signed-upload-urls';

// Guards the one-line change that added /uploads/partner-documents/: the existing protected folders must behave
// exactly as before, public folders stay public, and the new folder is protected the same way.
const SECRET = 'test-secret';
const config = { get: (key: string) => (key === 'JWT_SECRET' ? SECRET : undefined) } as never;

function serve(url: string) {
  const [path, query = ''] = url.split('?');
  const req = { path, baseUrl: '', query: Object.fromEntries(new URLSearchParams(query)) } as never;
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn(), setHeader: jest.fn() };
  const next = jest.fn();
  requireSignedUploadUrl(config)(req, res as never, next);
  return { allowed: next.mock.calls.length === 1, status: res.status.mock.calls[0]?.[0] };
}

const PROTECTED = ['/uploads/reports/r.pdf', '/uploads/prescriptions/p.jpg', '/uploads/resumes/c.pdf', '/uploads/partner-documents/d.pdf'];
const PUBLIC = ['/uploads/offers/o.jpg', '/uploads/catalogue/t.png', '/uploads/phlebotomist-photos/x.jpg'];

describe('signed upload URLs', () => {
  it('refuses unsigned links to every protected folder (existing three and partner documents)', () => {
    for (const path of PROTECTED) expect(serve(path)).toEqual({ allowed: false, status: 403 });
  });

  it('serves protected files with a valid signature', () => {
    for (const path of PROTECTED) expect(serve(signUploadUrl(SECRET, path)).allowed).toBe(true);
  });

  it('refuses a signature made for a different file', () => {
    const signedForReport = signUploadUrl(SECRET, '/uploads/reports/r.pdf');
    expect(serve('/uploads/partner-documents/d.pdf?' + signedForReport.split('?')[1]).allowed).toBe(false);
  });

  it('leaves public folders public', () => {
    for (const path of PUBLIC) expect(serve(path).allowed).toBe(true);
  });

  it('signs protected paths in API responses and leaves everything else untouched', async () => {
    const body = { report: '/uploads/reports/r.pdf', doc: '/uploads/partner-documents/d.pdf', offer: '/uploads/offers/o.jpg', n: 1 };
    const out = (await lastValueFrom(new SignUploadUrlsInterceptor(config).intercept({} as never, { handle: () => of(body) }))) as typeof body;
    expect(out.report).toMatch(/^\/uploads\/reports\/r\.pdf\?e=\d+&s=[0-9a-f]{64}$/);
    expect(out.doc).toMatch(/^\/uploads\/partner-documents\/d\.pdf\?e=\d+&s=[0-9a-f]{64}$/);
    expect(out.offer).toBe('/uploads/offers/o.jpg');
    expect(out.n).toBe(1);
  });
});
