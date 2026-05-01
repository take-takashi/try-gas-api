type ApiResponse =
  | {
      ok: true;
      user: string;
      data: unknown;
    }
  | {
      ok: false;
      error: string;
    };

const ALLOWED_EMAILS = new Set([
  'allowed-user@example.com',
]);

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
  const email = Session.getActiveUser().getEmail();

  if (!email || !ALLOWED_EMAILS.has(email)) {
    return json({
      ok: false,
      error: 'forbidden',
    });
  }

  return json({
    ok: true,
    user: email,
    data: {
      method: request.method,
      body: request.body ?? null,
    },
  });
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
