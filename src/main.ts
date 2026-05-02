type ApiResponse =
  | {
      ok: true;
      user: string;
      spreadsheet: {
        id: string;
        name: string;
      };
      data: unknown;
    }
  | {
      ok: false;
      error: string;
    };

declare const __SPREADSHEET_ID__: string;

const SPREADSHEET_ID = __SPREADSHEET_ID__;

function doGet(): GoogleAppsScript.Content.TextOutput {
  return handleRequest({ method: 'GET' });
}

function doPost(e: GoogleAppsScript.Events.DoPost): GoogleAppsScript.Content.TextOutput {
  return handleRequest({
    method: 'POST',
    body: parseJson(e.postData?.contents),
  });
}

function handleRequest(request: {
  method: 'GET' | 'POST';
  body?: unknown;
}): GoogleAppsScript.Content.TextOutput {
  const spreadsheet = getAuthorizedSpreadsheet();

  if (!spreadsheet) {
    return json({
      ok: false,
      error: 'forbidden',
    });
  }

  return json({
    ok: true,
    user: Session.getActiveUser().getEmail(),
    spreadsheet: {
      id: spreadsheet.getId(),
      name: spreadsheet.getName(),
    },
    data: {
      method: request.method,
      body: request.body ?? null,
    },
  });
}

function getAuthorizedSpreadsheet(): GoogleAppsScript.Spreadsheet.Spreadsheet | null {
  try {
    return SpreadsheetApp.openById(SPREADSHEET_ID);
  } catch {
    return null;
  }
}

function parseJson(value: string | undefined): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return {
      raw: value,
    };
  }
}

function json(payload: ApiResponse): GoogleAppsScript.Content.TextOutput {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

globalThis.doGet = doGet;
globalThis.doPost = doPost;
