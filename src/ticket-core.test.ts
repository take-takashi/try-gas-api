import { describe, expect, it } from 'vitest';

import {
  changeStatusSchema,
  createTicketSchema,
  deserializeCell,
  matchRoute,
  nextId,
  normalizePath,
  omitUndefined,
  serializeCell,
  updateTicketSchema,
} from './ticket-core';

describe('normalizePath', () => {
  it('empty pathInfo をルートパスに正規化する', () => {
    expect(normalizePath(undefined)).toBe('/');
    expect(normalizePath('')).toBe('/');
    expect(normalizePath('/')).toBe('/');
  });

  it('前後のスラッシュを取り除き、先頭スラッシュだけを付ける', () => {
    expect(normalizePath('/tickets/')).toBe('/tickets');
    expect(normalizePath('///tickets/TICKET-0001///')).toBe('/tickets/TICKET-0001');
  });

  it('通常パスを REST 風のパスに正規化する', () => {
    expect(normalizePath('tickets/TICKET-0001/comments')).toBe('/tickets/TICKET-0001/comments');
  });
});

describe('matchRoute', () => {
  it('/tickets/:ticketId に一致した ticketId を返す', () => {
    expect(matchRoute('/tickets/TICKET-0001', '/tickets/:ticketId')).toEqual({
      ticketId: 'TICKET-0001',
    });
  });

  it('/tickets/:ticketId/comments に一致した ticketId を返す', () => {
    expect(matchRoute('/tickets/TICKET%2F0001/comments', '/tickets/:ticketId/comments')).toEqual({
      ticketId: 'TICKET/0001',
    });
  });

  it('不一致なら null を返す', () => {
    expect(matchRoute('/tickets/TICKET-0001/comments', '/tickets/:ticketId')).toBeNull();
    expect(matchRoute('/comments/TICKET-0001', '/tickets/:ticketId')).toBeNull();
  });
});

describe('nextId', () => {
  it('空配列なら 0001 から採番する', () => {
    expect(nextId([], 'TICKET')).toBe('TICKET-0001');
  });

  it('既存 ID の最大値の次を採番する', () => {
    expect(nextId(['TICKET-0001', 'TICKET-0010', 'TICKET-0003'], 'TICKET')).toBe('TICKET-0011');
  });

  it('prefix が一致しない ID は無視する', () => {
    expect(nextId(['COMMENT-0099', 'TICKET-0002', 'TICKET-x'], 'TICKET')).toBe('TICKET-0003');
  });
});

describe('cell serialization', () => {
  it('labels を JSON 文字列として serialize / deserialize する', () => {
    const serialized = serializeCell('labels', ['bug', 'api']);

    expect(serialized).toBe('["bug","api"]');
    expect(deserializeCell('labels', serialized)).toEqual(['bug', 'api']);
  });

  it('payload を JSON 文字列として serialize / deserialize する', () => {
    const payload = { before: { status: 'open' }, after: { status: 'done' } };
    const serialized = serializeCell('payload', payload);

    expect(serialized).toBe(JSON.stringify(payload));
    expect(deserializeCell('payload', serialized)).toEqual(payload);
  });
});

describe('updateTicketSchema', () => {
  it('dueDate / archivedAt 未指定時は omitUndefined で patch から落とせる', () => {
    const patch = omitUndefined(updateTicketSchema.parse({ title: '更新後タイトル' }));

    expect(patch).toEqual({ title: '更新後タイトル' });
    expect(patch).not.toHaveProperty('dueDate');
    expect(patch).not.toHaveProperty('archivedAt');
  });

  it('dueDate / archivedAt に空文字を指定した場合は null として扱う', () => {
    expect(updateTicketSchema.parse({ dueDate: '', archivedAt: '' })).toEqual({
      dueDate: null,
      archivedAt: null,
    });
  });
});

describe('zod schemas', () => {
  it('不正な status を拒否する', () => {
    expect(() => changeStatusSchema.parse({ status: 'blocked' })).toThrow();
  });

  it('create ticket の default 値を補う', () => {
    expect(createTicketSchema.parse({ title: '新しいチケット' })).toEqual({
      title: '新しいチケット',
      description: '',
      type: 'task',
      priority: 'medium',
      assignee: '',
      labels: [],
      dueDate: null,
    });
  });
});
