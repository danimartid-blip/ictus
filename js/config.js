// Config compartida. Este repo es público: acá va SOLO código y los ID de las
// planillas. Ningún monto ni nombre vive en el repo: todo se lee en vivo desde
// las planillas privadas, con el login de Google del propio usuario. Un ID no es
// una llave: Google solo entrega la planilla a una cuenta que tenga permiso.
window.APP_CONFIG = {
  // Mismo cliente OAuth que las otras apps (proyecto personal-drive-mcp-507305).
  CLIENT_ID: "410252619718-jog7oi0j0cubhfcr8kee8p28kq4g8b3u.apps.googleusercontent.com",
  SCOPES: "https://www.googleapis.com/auth/spreadsheets",
  // Los dos libros son la fuente de verdad. El compartido se mantiene al día a
  // partir de ellos, nunca al revés.
  LIBRO_TESORERIA: "12H-f_KYiZB553j1iGOjf8XK7iBk3xZfi_3AzyaLD6r8",
  LIBRO_DIEZMOS: "1_iU-9n-YWgx36_AuAKuVqkAV0wXTIYyKKdI1KBdtW0A",
  COMPARTIDO: "1ChH97jX71su-IaQ-NTfVujmbpq1Zfa4f1Ifqj1h1oeM",
  // Seguimiento del trámite de la cuenta bancaria (Tramite, Pendientes, Datos).
  APP_DB: "1VDvlNtZCV5UxX6Vg7f3x1N8OkE9re71N-qnLEp_tm5M",
};
