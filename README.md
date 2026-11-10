# Tesorería ICTUS

App web para llevar la tesorería de la iglesia desde el celular: saldo, cuadratura de caja y banco, movimientos, diezmos y el seguimiento del trámite de la cuenta bancaria.

Es un sitio estático sin backend. Lee y escribe planillas privadas de Google Sheets con el login de Google de quien la usa. **Este repositorio es público y contiene solo código**: ningún monto ni nombre vive aquí.

## Archivos

- `index.html`, `login.html`: las dos páginas.
- `js/config.js`: cliente OAuth e ID de las planillas.
- `js/sheets-auth.js`: login con Google Identity Services y llamadas a la Sheets API.
- `js/libros.js`: la forma de los libros (filas, bloques, fórmulas) y todas las escrituras.
- `js/app.js`: las pantallas.

## Publicar

Actualizar `?v=AAAAMMDDHHMM` en los HTML (el celular cachea agresivo) y hacer push a `main`. GitHub Pages tarda uno o dos minutos.
