import { resetDatabase } from '@src/core/db';

import { countPendingReceipts, drainReceipts, writeDeliveryEndpoint } from '@src/domains/messaging/services/receiptSender';
import { enrol, listSchedule, markScheduled } from '@src/domains/messaging/services/scheduleRepository';
import { recordDelivery } from '@src/domains/messaging/services/scheduler';

const ENROLLED_AT = 1_700_000_000_000;

function queueSlot(position: number) {
  markScheduled('daily', position, `d-1-${position + 1}`, ENROLLED_AT + position, `n-${position}`);
}

beforeEach(() => {
  resetDatabase();
  enrol(ENROLLED_AT);
});

describe('recordDelivery', () => {
  it('marks the slot delivered and queues exactly one receipt', () => {
    queueSlot(0);

    expect(recordDelivery('daily', 0, 'd-1-1', 'Semana 1; Mensagem 1 de 7', 9_000)).toBe(true);
    expect(listSchedule()[0].state).toBe('delivered');
    expect(countPendingReceipts()).toBe(1);
  });

  it('refuses to record the same delivery twice', () => {
    queueSlot(0);
    recordDelivery('daily', 0, 'd-1-1', 'Semana 1; Mensagem 1 de 7', 9_000);

    expect(recordDelivery('daily', 0, 'd-1-1', 'Semana 1; Mensagem 1 de 7', 9_000)).toBe(false);
    expect(countPendingReceipts()).toBe(1);
  });

  it('scopes the idempotency key to the enrolment, so a new signup is not deduped away', async () => {
    queueSlot(0);
    recordDelivery('daily', 0, 'd-1-1', 'Semana 1; Mensagem 1 de 7', 9_000);

    writeDeliveryEndpoint('https://webhook.site/test');
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;

    await drainReceipts();

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe(
      `${ENROLLED_AT}:daily:0`,
    );
  });

  it('ignores a slot the app never scheduled', () => {
    expect(recordDelivery('daily', 3, 'd-1-4', 'Semana 1; Mensagem 4 de 7', 9_000)).toBe(false);
    expect(countPendingReceipts()).toBe(0);
  });
});
