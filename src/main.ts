import * as z from 'zod';
import {
  changeStatusSchema,
  createCommentSchema,
  createTicketSchema,
  listTicketsQuerySchema,
  matchRoute,
  nextId,
  normalizePath,
  omitUndefined,
  recordToRow,
  rowToRecord,
  ticketColumns,
  ticketCommentColumns,
  ticketCommentRowSchema,
  ticketEventColumns,
  ticketEventRowSchema,
  ticketRowSchema,
  updateTicketSchema,
  type TicketCommentRow,
  type TicketEventRow,
  type TicketEventType,
  type TicketRow,
} from './ticket-core';

declare const __SPREADSHEET_ID__: string;

const SPREADSHEET_ID = __SPREADSHEET_ID__;

const SHEET_NAMES = {
  tickets: 'tickets',
  comments: 'ticket_comments',
  events: 'ticket_events',
} as const;

type ApiMethod = 'GET' | 'POST';

type ApiSuccess<T> = {
  ok: true;
  data: T;
};

type ApiFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

type ApiResponse<T = unknown> = ApiSuccess<T> | ApiFailure;

type WebAppEvent = (GoogleAppsScript.Events.DoGet | GoogleAppsScript.Events.DoPost) & {
  pathInfo?: string;
  postData?: {
    contents?: string;
  };
};

type Request = {
  method: ApiMethod;
  path: string;
  query: Record<string, string>;
  body: unknown;
  userEmail: string;
};

class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

function doGet(e: GoogleAppsScript.Events.DoGet): GoogleAppsScript.Content.TextOutput {
  return json(handleRequest(toRequest('GET', e as WebAppEvent)));
}

function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  return json(handleRequest(toRequest('POST', e as WebAppEvent)));
}

function handleRequest(request: Request): ApiResponse {
  try {
    const spreadsheet = getAuthorizedSpreadsheet();

    if (!spreadsheet) {
      return fail('forbidden', 'Spreadsheet を開けません');
    }

    ensureSchema(spreadsheet);

    // GAS Web App は doGet/doPost が入口なので、pathInfo を使って REST 風に振り分ける。
    // 更新系は PATCH ではなく POST として受け、レスポンス本文の ok/error で結果を返す。
    const ticketRoute = matchRoute(request.path, '/tickets/:ticketId');
    const commentRoute = matchRoute(request.path, '/tickets/:ticketId/comments');
    const statusRoute = matchRoute(request.path, '/tickets/:ticketId/status');

    if (request.method === 'GET' && request.path === '/tickets') {
      return listTickets(spreadsheet, listTicketsQuerySchema.parse(request.query));
    }

    if (request.method === 'GET' && ticketRoute) {
      return getTicket(spreadsheet, ticketRoute.ticketId);
    }

    if (request.method === 'POST' && request.path === '/tickets') {
      return createTicket(spreadsheet, createTicketSchema.parse(request.body), request.userEmail);
    }

    if (request.method === 'POST' && ticketRoute) {
      return updateTicket(
        spreadsheet,
        ticketRoute.ticketId,
        updateTicketSchema.parse(request.body),
        request.userEmail,
      );
    }

    if (request.method === 'POST' && commentRoute) {
      return addTicketComment(
        spreadsheet,
        commentRoute.ticketId,
        createCommentSchema.parse(request.body),
        request.userEmail,
      );
    }

    if (request.method === 'POST' && statusRoute) {
      return changeTicketStatus(
        spreadsheet,
        statusRoute.ticketId,
        changeStatusSchema.parse(request.body),
        request.userEmail,
      );
    }

    return fail('not_found', 'Route が見つかりません');
  } catch (error) {
    return toFailure(error);
  }
}

function listTickets(
  spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
  query: z.infer<typeof listTicketsQuerySchema>,
): ApiResponse<{ tickets: TicketRow[] }> {
  const q = query.q?.toLowerCase();
  const tickets = readTicketRows(spreadsheet)
    .filter((ticket) => !ticket.archivedAt)
    .filter((ticket) => !query.status || ticket.status === query.status)
    .filter((ticket) => !query.assignee || ticket.assignee === query.assignee)
    .filter((ticket) => !query.label || ticket.labels.indexOf(query.label) >= 0)
    .filter((ticket) => {
      if (!q) {
        return true;
      }

      return (
        ticket.title.toLowerCase().indexOf(q) >= 0 ||
        ticket.description.toLowerCase().indexOf(q) >= 0
      );
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return ok({ tickets });
}

function getTicket(
  spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
  ticketId: string,
): ApiResponse<{ ticket: TicketRow; comments: TicketCommentRow[]; events: TicketEventRow[] }> {
  const ticket = findTicketOrFail(spreadsheet, ticketId).ticket;
  const comments = readTicketCommentRows(spreadsheet).filter((comment) => comment.ticketId === ticketId);
  const events = readTicketEventRows(spreadsheet).filter((event) => event.ticketId === ticketId);

  return ok({
    ticket,
    comments: comments.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    events: events.sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  });
}

function createTicket(
  spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
  input: z.infer<typeof createTicketSchema>,
  actor: string,
): ApiResponse<{ ticket: TicketRow }> {
  const now = nowIso();
  const ticket = ticketRowSchema.parse({
    ticketId: nextId(readTicketRows(spreadsheet).map((row) => row.ticketId), 'TICKET'),
    title: input.title,
    description: input.description,
    type: input.type,
    status: 'open',
    priority: input.priority,
    assignee: input.assignee,
    labels: input.labels,
    dueDate: input.dueDate,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
  });

  appendRow(spreadsheet, SHEET_NAMES.tickets, ticketColumns, ticket);
  // 変更系操作は ticket_events に履歴を残す。Spreadsheet を DB として扱うための監査ログ。
  appendEvent(spreadsheet, ticket.ticketId, 'created', actor, { ticket });

  return ok({ ticket });
}

function updateTicket(
  spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
  ticketId: string,
  patch: z.infer<typeof updateTicketSchema>,
  actor: string,
): ApiResponse<{ ticket: TicketRow }> {
  const current = findTicketOrFail(spreadsheet, ticketId);
  const sanitizedPatch = omitUndefined(patch);
  const ticket = ticketRowSchema.parse({
    ...current.ticket,
    ...sanitizedPatch,
    ticketId: current.ticket.ticketId,
    status: current.ticket.status,
    createdAt: current.ticket.createdAt,
    updatedAt: nowIso(),
  });

  updateRow(spreadsheet, SHEET_NAMES.tickets, current.rowNumber, ticketColumns, ticket);
  appendEvent(spreadsheet, ticketId, 'updated', actor, {
    before: current.ticket,
    after: ticket,
  });

  return ok({ ticket });
}

function addTicketComment(
  spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
  ticketId: string,
  input: z.infer<typeof createCommentSchema>,
  actor: string,
): ApiResponse<{ comment: TicketCommentRow }> {
  const ticket = findTicketOrFail(spreadsheet, ticketId).ticket;
  const comment = ticketCommentRowSchema.parse({
    commentId: nextId(
      readTicketCommentRows(spreadsheet).map((row) => row.commentId),
      'COMMENT',
    ),
    ticketId: ticket.ticketId,
    body: input.body,
    author: actor,
    createdAt: nowIso(),
  });

  appendRow(spreadsheet, SHEET_NAMES.comments, ticketCommentColumns, comment);
  appendEvent(spreadsheet, ticketId, 'commented', actor, { comment });

  return ok({ comment });
}

function changeTicketStatus(
  spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
  ticketId: string,
  input: z.infer<typeof changeStatusSchema>,
  actor: string,
): ApiResponse<{ ticket: TicketRow }> {
  const current = findTicketOrFail(spreadsheet, ticketId);
  const ticket = ticketRowSchema.parse({
    ...current.ticket,
    status: input.status,
    updatedAt: nowIso(),
  });

  updateRow(spreadsheet, SHEET_NAMES.tickets, current.rowNumber, ticketColumns, ticket);
  appendEvent(spreadsheet, ticketId, 'status_changed', actor, {
    from: current.ticket.status,
    to: ticket.status,
  });

  return ok({ ticket });
}

function appendEvent(
  spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
  ticketId: string,
  type: TicketEventType,
  actor: string,
  payload: unknown,
): TicketEventRow {
  const event = ticketEventRowSchema.parse({
    eventId: nextId(
      readTicketEventRows(spreadsheet).map((row) => row.eventId),
      'EVENT',
    ),
    ticketId,
    type,
    actor,
    payload,
    createdAt: nowIso(),
  });

  appendRow(spreadsheet, SHEET_NAMES.events, ticketEventColumns, event);
  return event;
}

function ensureSchema(spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet): void {
  // 初回アクセス時に必要なシートとヘッダーを作る。既存ヘッダーが違う場合は schema 不一致として止める。
  ensureSheet(spreadsheet, SHEET_NAMES.tickets, ticketColumns);
  ensureSheet(spreadsheet, SHEET_NAMES.comments, ticketCommentColumns);
  ensureSheet(spreadsheet, SHEET_NAMES.events, ticketEventColumns);
}

function ensureSheet(
  spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
  sheetName: string,
  columns: readonly string[],
): void {
  const sheet = spreadsheet.getSheetByName(sheetName) ?? spreadsheet.insertSheet(sheetName);
  const existing = readHeader(sheet);

  if (existing.length === 0) {
    sheet.getRange(1, 1, 1, columns.length).setValues([Array.from(columns)]);
    return;
  }

  if (!sameColumns(existing, columns)) {
    throw new ApiError('schema_mismatch', `${sheetName} のヘッダーが schema と一致しません`, {
      sheetName,
      expected: columns,
      actual: existing,
    });
  }
}

function readTicketRows(spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet): TicketRow[] {
  return readRows(spreadsheet, SHEET_NAMES.tickets, ticketColumns, ticketRowSchema);
}

function readTicketCommentRows(
  spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
): TicketCommentRow[] {
  return readRows(spreadsheet, SHEET_NAMES.comments, ticketCommentColumns, ticketCommentRowSchema);
}

function readTicketEventRows(spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet): TicketEventRow[] {
  return readRows(spreadsheet, SHEET_NAMES.events, ticketEventColumns, ticketEventRowSchema);
}

function readRows<T extends z.ZodType>(
  spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
  sheetName: string,
  columns: readonly string[],
  schema: T,
): z.infer<T>[] {
  const sheet = getSheetOrThrow(spreadsheet, sheetName);
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    return [];
  }

  const values = sheet.getRange(2, 1, lastRow - 1, columns.length).getValues();
  return values.map((row) => schema.parse(rowToRecord(columns, row)));
}

function appendRow<T extends Record<string, unknown>>(
  spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
  sheetName: string,
  columns: readonly (keyof T & string)[],
  record: T,
): void {
  getSheetOrThrow(spreadsheet, sheetName).appendRow(recordToRow(columns, record));
}

function updateRow<T extends Record<string, unknown>>(
  spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
  sheetName: string,
  rowNumber: number,
  columns: readonly (keyof T & string)[],
  record: T,
): void {
  getSheetOrThrow(spreadsheet, sheetName)
    .getRange(rowNumber, 1, 1, columns.length)
    .setValues([recordToRow(columns, record)]);
}

function findTicketOrFail(
  spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
  ticketId: string,
): { ticket: TicketRow; rowNumber: number } {
  const sheet = getSheetOrThrow(spreadsheet, SHEET_NAMES.tickets);
  const lastRow = sheet.getLastRow();

  if (lastRow <= 1) {
    throw new ApiError('not_found', 'Ticket が見つかりません');
  }

  const values = sheet.getRange(2, 1, lastRow - 1, ticketColumns.length).getValues();

  for (let index = 0; index < values.length; index += 1) {
    const ticket = ticketRowSchema.parse(rowToRecord(ticketColumns, values[index]));

    if (ticket.ticketId === ticketId) {
      return {
        ticket,
        rowNumber: index + 2,
      };
    }
  }

  throw new ApiError('not_found', 'Ticket が見つかりません');
}

function readHeader(sheet: GoogleAppsScript.Spreadsheet.Sheet): string[] {
  if (sheet.getLastRow() === 0 || sheet.getLastColumn() === 0) {
    return [];
  }

  const values = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const header = values.map((value) => String(value).trim());
  const lastHeaderIndex = header.reduce((lastIndex, value, index) => (value ? index : lastIndex), -1);

  return lastHeaderIndex < 0 ? [] : header.slice(0, lastHeaderIndex + 1);
}

function sameColumns(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && actual.every((column, index) => column === expected[index]);
}

function getSheetOrThrow(
  spreadsheet: GoogleAppsScript.Spreadsheet.Spreadsheet,
  sheetName: string,
): GoogleAppsScript.Spreadsheet.Sheet {
  const sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    throw new ApiError('schema_missing', `${sheetName} が見つかりません`);
  }

  return sheet;
}

function toRequest(method: ApiMethod, e: WebAppEvent): Request {
  return {
    method,
    path: normalizePath(e.pathInfo),
    query: normalizeQuery(e.parameter ?? {}),
    body: method === 'POST' ? parseJsonBody(e.postData?.contents) : null,
    userEmail: getUserEmail(),
  };
}

function normalizeQuery(parameter: Record<string, string | undefined>): Record<string, string> {
  return Object.keys(parameter).reduce<Record<string, string>>((query, key) => {
    const value = parameter[key];

    if (value !== undefined) {
      query[key] = value;
    }

    return query;
  }, {});
}

function parseJsonBody(value: string | undefined): unknown {
  if (!value) {
    return {};
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    throw new ApiError('invalid_json', 'JSON を解析できません', errorMessage(error));
  }
}

function getAuthorizedSpreadsheet(): GoogleAppsScript.Spreadsheet.Spreadsheet | null {
  try {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch {
    return null;
  }
}

function getUserEmail(): string {
  try {
    return Session.getActiveUser().getEmail() || '';
  } catch {
    return '';
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function ok<T>(data: T): ApiSuccess<T> {
  return { ok: true, data };
}

function fail(code: string, message: string, details?: unknown): ApiFailure {
  return details === undefined
    ? { ok: false, error: { code, message } }
    : { ok: false, error: { code, message, details } };
}

function toFailure(error: unknown): ApiFailure {
  if (error instanceof ApiError) {
    return fail(error.code, error.message, error.details);
  }

  if (error instanceof z.ZodError) {
    return fail('validation_error', '入力値が不正です', z.treeifyError(error));
  }

  return fail('internal_error', '処理中にエラーが発生しました', errorMessage(error));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function json(payload: ApiResponse): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

const gasGlobal = globalThis as typeof globalThis & {
  doGet: typeof doGet;
  doPost: typeof doPost;
};

gasGlobal.doGet = doGet;
gasGlobal.doPost = doPost;
