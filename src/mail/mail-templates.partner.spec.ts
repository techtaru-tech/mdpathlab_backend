import { partnerStatusEmail, welcomeEmail } from './mail-templates';

describe('partner status email', () => {
  const base = { appUrl: 'https://example.test', subject: 'S', heading: 'H', ctaUrl: 'https://example.test/partner' };

  it('escapes partner-provided text (names, admin reasons) in the HTML', () => {
    const email = partnerStatusEmail({ ...base, name: '<b>Dr X</b>', lines: ['Reason: <script>alert(1)</script>'] });
    expect(email.html).not.toContain('<script>');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).not.toContain('<b>Dr X</b>');
  });

  it('uses the partner footer and no unsubscribe link', () => {
    const email = partnerStatusEmail({ ...base, name: 'Dr X', lines: ['Hello'] });
    expect(email.html).toContain('about your doctor/clinic partner account');
    expect(email.html).not.toContain('about your booking');
    expect(email.html).not.toContain('Stop these emails');
  });

  it('swaps only the footer, even if the body repeats the footer sentence', () => {
    const sentence = 'This email was sent by MD Path Labs about your booking. Questions? Just reply to this email.';
    const email = partnerStatusEmail({ ...base, name: 'Dr X', lines: [sentence] });
    expect(email.html.split(sentence).length - 1).toBe(1); // the body copy stays
    expect(email.html.indexOf(sentence)).toBeLessThan(email.html.indexOf('about your doctor/clinic partner account'));
  });

  it('builds a plain-text version with real line breaks', () => {
    const email = partnerStatusEmail({ ...base, name: 'Dr X', lines: ['Line one', 'Line two'] });
    expect(email.text).toBe('Hi Dr X,\n\nLine one\nLine two\n\nOpen the portal: https://example.test/partner');
  });

  it('leaves the existing patient emails\' footer unchanged', () => {
    const email = welcomeEmail({ name: 'A', appUrl: 'https://example.test', unsubscribeUrl: 'https://example.test/u' });
    expect(email.html).toContain('This email was sent by MD Path Labs about your booking. Questions? Just reply to this email.');
  });
});
