import { fillTemplate, MessageTemplatesService } from './message-templates.js';

describe('fillTemplate', () => {
  it('fills placeholders and drops unknown or empty ones', () => {
    expect(fillTemplate('Order {orderNumber} — {missing} done. {refundNote}', { orderNumber: 'MDP-1', refundNote: '' })).toBe('Order MDP-1 — done.');
  });
});

describe('MessageTemplatesService.render', () => {
  const make = (saved: unknown) =>
    new MessageTemplatesService({ siteSetting: { findFirst: jest.fn().mockResolvedValue({ messageTemplates: saved }) } } as never, {} as never);

  it('uses the default text when admin has not changed it', async () => {
    expect(await make(null).render('phleboDelay', {})).toEqual({
      title: 'Your phlebotomist is running late',
      body: 'Dear Patient, your phlebotomist is running slightly late. We apologize for the inconvenience and appreciate your patience. We will update you shortly.',
    });
  });

  it("uses admin's text, and nothing when switched off", async () => {
    expect(await make({ bookingReactivated: { title: 'Back on, {name}', body: '{orderNumber}', enabled: true } }).render('bookingReactivated', { name: 'Asha', orderNumber: 'X1' })).toEqual({
      title: 'Back on, Asha',
      body: 'X1',
    });
    expect(await make({ printingCharge: { title: 't', body: 'b', enabled: false } }).render('printingCharge', {})).toBeNull();
  });
});
