import * as z from 'zod';

export const ticketStatuses = ['open', 'in_progress', 'review', 'done', 'closed'] as const;
export const ticketPriorities = ['low', 'medium', 'high', 'urgent'] as const;
export const ticketTypes = ['task', 'bug', 'feature'] as const;
export const ticketEventTypes = ['created', 'updated', 'commented', 'status_changed'] as const;

export const ticketStatusSchema = z.enum(ticketStatuses);
export const ticketPrioritySchema = z.enum(ticketPriorities);
export const ticketTypeSchema = z.enum(ticketTypes);
export const ticketEventTypeSchema = z.enum(ticketEventTypes);

// zod schema と columns の組を Spreadsheet DB の正とする。
// schema は API 入出力の型と値検証を、columns はシート上の列順を担う。
const labelListSchema = z
  .array(z.string().trim().min(1))
  .transform((labels) => Array.from(new Set(labels)));

export const labelsSchema = labelListSchema.default([]);

const nullableStringSchema = z
  .union([z.string().trim(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined || value === null || value === '') {
      return null;
    }

    return value;
  });

const optionalNullableStringSchema = z
  .union([z.string().trim(), z.null()])
  .optional()
  .transform((value) => {
    if (value === undefined) {
      return undefined;
    }

    if (value === null || value === '') {
      return null;
    }

    return value;
  });

export const ticketRowSchema = z.object({
  ticketId: z.string().min(1),
  title: z.string().trim().min(1),
  description: z.string(),
  type: ticketTypeSchema,
  status: ticketStatusSchema,
  priority: ticketPrioritySchema,
  assignee: z.string(),
  labels: z.array(z.string()),
  dueDate: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
});

export const ticketColumns = [
  'ticketId',
  'title',
  'description',
  'type',
  'status',
  'priority',
  'assignee',
  'labels',
  'dueDate',
  'createdAt',
  'updatedAt',
  'archivedAt',
] as const satisfies readonly (keyof z.infer<typeof ticketRowSchema>)[];

export const ticketCommentRowSchema = z.object({
  commentId: z.string().min(1),
  ticketId: z.string().min(1),
  body: z.string().trim().min(1),
  author: z.string(),
  createdAt: z.string(),
});

export const ticketCommentColumns = [
  'commentId',
  'ticketId',
  'body',
  'author',
  'createdAt',
] as const satisfies readonly (keyof z.infer<typeof ticketCommentRowSchema>)[];

export const ticketEventRowSchema = z.object({
  eventId: z.string().min(1),
  ticketId: z.string().min(1),
  type: ticketEventTypeSchema,
  actor: z.string(),
  payload: z.unknown(),
  createdAt: z.string(),
});

export const ticketEventColumns = [
  'eventId',
  'ticketId',
  'type',
  'actor',
  'payload',
  'createdAt',
] as const satisfies readonly (keyof z.infer<typeof ticketEventRowSchema>)[];

export const listTicketsQuerySchema = z.object({
  status: ticketStatusSchema.optional(),
  assignee: z.string().trim().optional(),
  label: z.string().trim().optional(),
  q: z.string().trim().optional(),
});

export const createTicketSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().optional().default(''),
  type: ticketTypeSchema.optional().default('task'),
  priority: ticketPrioritySchema.optional().default('medium'),
  assignee: z.string().optional().default(''),
  labels: labelListSchema.optional().default([]),
  dueDate: nullableStringSchema,
});

export const updateTicketSchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    description: z.string().optional(),
    type: ticketTypeSchema.optional(),
    priority: ticketPrioritySchema.optional(),
    assignee: z.string().optional(),
    labels: labelListSchema.optional(),
    dueDate: optionalNullableStringSchema,
    archivedAt: optionalNullableStringSchema,
  })
  .strict();

export const createCommentSchema = z.object({
  body: z.string().trim().min(1),
});

export const changeStatusSchema = z.object({
  status: ticketStatusSchema,
});

export type TicketRow = z.infer<typeof ticketRowSchema>;
export type TicketCommentRow = z.infer<typeof ticketCommentRowSchema>;
export type TicketEventRow = z.infer<typeof ticketEventRowSchema>;
export type TicketEventType = z.infer<typeof ticketEventTypeSchema>;

export function normalizePath(pathInfo: string | undefined): string {
  const path = (pathInfo ?? '').replace(/^\/+|\/+$/g, '');
  return path ? `/${path}` : '/';
}

export function matchRoute(path: string, pattern: string): Record<string, string> | null {
  const pathParts = path.split('/').filter(Boolean);
  const patternParts = pattern.split('/').filter(Boolean);

  if (pathParts.length !== patternParts.length) {
    return null;
  }

  const params: Record<string, string> = {};

  for (let index = 0; index < patternParts.length; index += 1) {
    const patternPart = patternParts[index];
    const pathPart = pathParts[index];

    if (patternPart.startsWith(':')) {
      params[patternPart.slice(1)] = decodeURIComponent(pathPart);
      continue;
    }

    if (patternPart !== pathPart) {
      return null;
    }
  }

  return params;
}

export function nextId(existingIds: string[], prefix: 'TICKET' | 'COMMENT' | 'EVENT'): string {
  // 行番号には依存せず、既存 ID の最大値から次の ID を採番する。
  const nextNumber =
    existingIds.reduce((max, id) => {
      const match = new RegExp(`^${prefix}-(\\d+)$`).exec(id);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;

  return `${prefix}-${String(nextNumber).padStart(4, '0')}`;
}

export function rowToRecord(columns: readonly string[], row: unknown[]): Record<string, unknown> {
  return columns.reduce<Record<string, unknown>>((record, column, index) => {
    record[column] = deserializeCell(column, row[index]);
    return record;
  }, {});
}

export function recordToRow<T extends Record<string, unknown>>(
  columns: readonly (keyof T & string)[],
  record: T,
): unknown[] {
  return columns.map((column) => serializeCell(column, record[column]));
}

export function omitUndefined<T extends Record<string, unknown>>(record: T): Partial<T> {
  return Object.keys(record).reduce<Partial<T>>((result, key) => {
    const typedKey = key as keyof T;

    if (record[typedKey] !== undefined) {
      result[typedKey] = record[typedKey];
    }

    return result;
  }, {});
}

export function serializeCell(column: string, value: unknown): unknown {
  // Spreadsheet のセルは配列やオブジェクトを直接扱いにくいので、構造化データは JSON 文字列で保存する。
  if (column === 'labels' || column === 'payload') {
    return JSON.stringify(value ?? null);
  }

  return value ?? '';
}

export function deserializeCell(column: string, value: unknown): unknown {
  if (column === 'labels') {
    return parseJsonArray(String(value || '[]'));
  }

  if (column === 'payload') {
    return parseJsonValue(String(value || 'null'));
  }

  if ((column === 'dueDate' || column === 'archivedAt') && value === '') {
    return null;
  }

  return value;
}

function parseJsonArray(value: string): string[] {
  const parsed = parseJsonValue(value);
  return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [];
}

function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
