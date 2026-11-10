// Google Identity Services (OAuth 100% en el navegador) + lectura y escritura de
// las planillas. Sin backend y sin client secret: el token vive solo en el
// localStorage de este navegador.
//
// OJO: todas las apps de danimartid-blip.github.io comparten origen, o sea
// comparten localStorage. Esta clave es propia de esta app, distinta a la de
// Finanzas ("gsheets_token") y a la de Salud ("salud_token_rw").
const TOKEN_KEY = "ictus_token_rw";
let tokenClient = null;
let tokenClientReady = null;

function loadStoredToken() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.expiresAt > Date.now() + 30_000) return parsed;
  } catch {
    /* ignore */
  }
  return null;
}

function storeToken(tokenResponse) {
  const expiresAt = Date.now() + (Number(tokenResponse.expires_in) || 3300) * 1000;
  localStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken: tokenResponse.access_token, expiresAt }));
}

function waitForGis() {
  if (tokenClientReady) return tokenClientReady;
  tokenClientReady = new Promise((resolve, reject) => {
    const check = () => {
      if (window.google?.accounts?.oauth2) resolve();
      else setTimeout(check, 100);
    };
    check();
    setTimeout(() => reject(new Error("Google Identity Services no cargó")), 15000);
  });
  return tokenClientReady;
}

async function ensureTokenClient() {
  await waitForGis();
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: window.APP_CONFIG.CLIENT_ID,
      scope: window.APP_CONFIG.SCOPES,
      callback: () => {},
      error_callback: (err) => tokenClient?._onError?.(err),
    });
  }
  return tokenClient;
}

const ESPERA_LOGIN_MS = 60_000;

/** Devuelve un token válido, abriendo el login de Google si hace falta.
 * Pase lo que pase resuelve o rechaza: si el navegador bloquea el popup, GIS no
 * llama nunca al callback, y sin el error_callback + timeout la pantalla
 * quedaría cargando para siempre. */
async function getAccessToken() {
  const cached = loadStoredToken();
  if (cached) return cached.accessToken;

  const client = await ensureTokenClient();
  return new Promise((resolve, reject) => {
    let timer = null;
    const terminar = (fn) => {
      clearTimeout(timer);
      client.callback = () => {};
      client._onError = null;
      fn();
    };
    timer = setTimeout(
      () => terminar(() => reject(new Error("No se pudo renovar la sesión de Google. Recarga la página para volver a entrar."))),
      ESPERA_LOGIN_MS
    );
    client.callback = (resp) =>
      terminar(() => {
        if (resp.error) return reject(new Error(resp.error_description || resp.error));
        storeToken(resp);
        resolve(resp.access_token);
      });
    client._onError = (err) =>
      terminar(() => reject(new Error(err?.message || "No se pudo abrir el login de Google. Recarga la página.")));
    client.requestAccessToken({ prompt: "" });
  });
}

function isLoggedIn() {
  return !!loadStoredToken();
}

function logout() {
  const cached = loadStoredToken();
  localStorage.removeItem(TOKEN_KEY);
  if (cached && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(cached.accessToken, () => {});
  }
}

const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

async function sheetsFetch(spreadsheetId, path, options = {}) {
  const token = await getAccessToken();
  const res = await fetch(`${SHEETS_BASE}/${spreadsheetId}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(options.headers || {}) },
  });
  if (res.status === 401) {
    localStorage.removeItem(TOKEN_KEY);
    throw new Error("La sesión venció. Vuelve a entrar.");
  }
  if (res.status === 403 || res.status === 404) {
    throw new Error("Esta cuenta de Google no tiene acceso a esta planilla. Cierra sesión y entra con la cuenta correcta.");
  }
  if (!res.ok) throw new Error(`Sheets API ${res.status}: ${await res.text()}`);
  return res.json();
}

/** Lee varios rangos de una planilla en UNA petición. Devuelve un arreglo con
 * las filas de cada rango, en el mismo orden. Sin formatear: los montos llegan
 * como número y las fechas como número de serie. */
async function leer(spreadsheetId, rangos) {
  const qs = rangos.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
  const data = await sheetsFetch(spreadsheetId, `/values:batchGet?${qs}&valueRenderOption=UNFORMATTED_VALUE`);
  return rangos.map((_, i) => data.valueRanges?.[i]?.values || []);
}

/** Escribe un rango. En los libros se usa USER_ENTERED porque hay fórmulas que
 * escribir (el mes del movimiento); los números van como número y toman el
 * formato de fecha o de monto que la celda ya tiene. */
async function escribir(spreadsheetId, rango, values, modo = "USER_ENTERED") {
  return sheetsFetch(spreadsheetId, `/values/${encodeURIComponent(rango)}?valueInputOption=${modo}`, {
    method: "PUT",
    body: JSON.stringify({ values }),
  });
}

/** Varias celdas sueltas de una misma planilla en una sola petición. */
async function escribirVarios(spreadsheetId, data, modo = "USER_ENTERED") {
  return sheetsFetch(spreadsheetId, `/values:batchUpdate`, {
    method: "POST",
    body: JSON.stringify({ valueInputOption: modo, data }),
  });
}

async function agregar(spreadsheetId, rango, fila, modo = "RAW") {
  return sheetsFetch(spreadsheetId, `/values/${encodeURIComponent(rango)}:append?valueInputOption=${modo}&insertDataOption=INSERT_ROWS`, {
    method: "POST",
    body: JSON.stringify({ values: [fila] }),
  });
}

/** Títulos de las pestañas visibles de una planilla. */
async function pestanas(spreadsheetId) {
  const data = await sheetsFetch(spreadsheetId, `?fields=sheets.properties(title,hidden)`);
  return (data.sheets || []).filter((s) => !s.properties.hidden).map((s) => s.properties.title);
}

function requireAuthOrRedirect() {
  if (isLoggedIn()) return true;
  location.replace("login.html");
  return false;
}

window.SheetsAuth = { getAccessToken, isLoggedIn, logout, requireAuthOrRedirect };
window.SheetsApi = { leer, escribir, escribirVarios, agregar, pestanas };
