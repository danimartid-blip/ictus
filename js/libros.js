// Lectura y escritura de los libros. No toca el DOM.
//
// Los dos libros (tesorería y diezmos) son planillas hechas a mano, con
// encabezados, bloques y fórmulas. Acá vive todo lo que hay que saber de su
// forma: en qué fila parte cada cosa y qué celdas se pueden escribir.
//
// Va envuelto en una función: los scripts de la página comparten el ámbito
// global y un nombre repetido (MESES, hoja) tira "already declared".
(() => {

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const DIA_MS = 86400000;
const EPOCA_SHEETS = Date.UTC(1899, 11, 30);

// Libro de tesorería: pestaña por año, columnas B:H.
const TES_FILA_RESUMEN = 6; // G6 saldo inicial
const TES_FILA_DATOS = 12; // primer movimiento
// Libro de diezmos: pestaña por año, columnas B:I, encabezado en la fila 5.
const DIE_FILA_ENCABEZADO = 5;
const DIE_FILA_DATOS = 7;

const hoja = (nombre) => `'${String(nombre).replace(/'/g, "''")}'`;
const esNum = (v) => typeof v === "number" && isFinite(v);
const sinTildes = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** "2026-10-13" → número de serie de Sheets. */
function serialDeYmd(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - EPOCA_SHEETS) / DIA_MS);
}

/** Valor de una celda de fecha → "AAAA-MM-DD", o null. Acepta el número de
 * serie y también el texto "dd-mm-aaaa" que queda si alguien la tipea como texto. */
function ymdDeCelda(v) {
  if (esNum(v) && v > 20000 && v < 80000) {
    return new Date(EPOCA_SHEETS + Math.floor(v) * DIA_MS).toISOString().slice(0, 10);
  }
  const m = /^\s*(\d{1,2})[-/](\d{1,2})[-/](\d{4})\s*$/.exec(String(v ?? ""));
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/** Un texto que empieza con = + - @ se escribiría como fórmula. */
function textoSeguro(s) {
  const t = String(s ?? "").trim();
  return /^[=+\-@]/.test(t) ? `'${t}` : t;
}

// ---------- Tesorería ----------

function armarTesoreria(filas) {
  // filas parte en B6: índice i ↔ fila 6 + i; columnas B..H ↔ 0..6.
  const saldoInicial = esNum(filas[0]?.[5]) ? filas[0][5] : 0;
  const movs = [];
  let ultimaConDatos = TES_FILA_DATOS - 1;
  let saldo = saldoInicial;
  for (let i = TES_FILA_DATOS - TES_FILA_RESUMEN; i < filas.length; i++) {
    const f = filas[i] || [];
    const fila = TES_FILA_RESUMEN + i;
    // La columna H trae fórmula en todas las filas; lo que cuenta es B..G.
    if ([0, 2, 3, 4, 5].some((c) => f[c] !== undefined && f[c] !== "")) ultimaConDatos = fila;
    const fecha = ymdDeCelda(f[0]);
    if (!fecha || !esNum(f[5])) continue;
    saldo += f[5];
    // La categoría va tal cual, sin recortar: en el libro hay una con un espacio
    // al final ("Com x. Transferencia ") y escribirla distinta parte la tabla dinámica.
    movs.push({ fila, fecha, clasificacion: String(f[2] || "").trim(), categoria: String(f[3] || ""), detalle: String(f[4] || ""), monto: f[5], saldo });
  }
  const suma = (clas) => movs.filter((m) => sinTildes(m.clasificacion) === clas).reduce((a, m) => a + m.monto, 0);
  return {
    saldoInicial,
    movs,
    filaLibre: ultimaConDatos + 1,
    entradas: suma("ingresos"),
    gastos: suma("gastos"),
    ahorro: suma("ahorro"),
    saldoFinal: saldo,
  };
}

function armarSaldo(S) {
  const c = (fila, col) => S[fila - 1]?.[col.charCodeAt(0) - 65];
  const etiqueta = (fila, palabra) => sinTildes(c(fila, "B")).includes(palabra);
  // Si alguien movió las filas de la pestaña Saldo, mejor no escribir ahí.
  const valido = etiqueta(4, "caja") && etiqueta(5, "banco") && etiqueta(6, "ahorro") && etiqueta(7, "diezmo");
  const billetes = [];
  for (let fila = 9; fila <= S.length; fila++) {
    const denom = c(fila, "B");
    if (esNum(denom) && denom >= 100 && denom <= 20000) billetes.push({ fila, denom, cant: esNum(c(fila, "C")) ? c(fila, "C") : 0 });
  }
  const n = (v) => (esNum(v) ? v : 0);
  return {
    valido,
    anio: (/\b(20\d{2})\b/.exec(String(c(2, "B") || "")) || [])[1] || null,
    billetes,
    caja: billetes.reduce((a, b) => a + b.denom * b.cant, 0),
    banco: n(c(5, "E")),
    ahorros: n(c(6, "E")),
    diezmosPorPagar: n(c(7, "E")),
  };
}

function armarCategorias(C, movs) {
  // Categorias!A2:E — fila 0 son los títulos INGRESOS / AHORRO / GASTOS.
  const cats = { Ingresos: [], Ahorro: [], Gastos: [] };
  for (let i = 1; i < C.length; i++) {
    const f = C[i] || [];
    if (f[2]) cats.Ingresos.push(String(f[2]).trim());
    if (f[3]) cats.Ahorro.push(String(f[3]).trim());
    if (f[4]) cats.Gastos.push(String(f[4]).trim());
  }
  // Más las que ya se usan en el libro y no están en la lista.
  for (const m of movs) {
    const lista = cats[m.clasificacion];
    if (lista && m.categoria && !lista.some((x) => sinTildes(x) === sinTildes(m.categoria))) lista.push(m.categoria);
  }
  return cats;
}

async function leerTesoreria(anio) {
  const id = window.APP_CONFIG.LIBRO_TESORERIA;
  const [filas, S, C] = await window.SheetsApi.leer(id, [`${hoja(anio)}!B${TES_FILA_RESUMEN}:H`, "Saldo!A1:J24", "Categorias!A2:E40"]);
  const tes = armarTesoreria(filas);
  return { ...tes, cuadratura: armarSaldo(S), categorias: armarCategorias(C, tes.movs) };
}

/** Agrega movimientos al final del libro del año y los refleja en el compartido.
 * `lista`: [{ fecha "AAAA-MM-DD", clasificacion, categoria, detalle, monto con signo }].
 * Devuelve { saldo, compartido: true | false, aviso }. */
async function guardarMovimientos(anio, lista) {
  const cfg = window.APP_CONFIG;
  const api = window.SheetsApi;
  // Se busca la fila libre en el momento de escribir, no con lo que había en pantalla.
  const [filas] = await api.leer(cfg.LIBRO_TESORERIA, [`${hoja(anio)}!B${TES_FILA_RESUMEN}:H`]);
  const antes = armarTesoreria(filas);
  const r = antes.filaLibre;
  const valores = lista.map((m, k) => [
    serialDeYmd(m.fecha),
    `=MID(B${r + k};4;2)`, // el libro está en es_CL: separador ;
    m.clasificacion,
    m.categoria,
    textoSeguro(m.detalle),
    m.monto,
  ]);
  await api.escribir(cfg.LIBRO_TESORERIA, `${hoja(anio)}!B${r}:G${r + lista.length - 1}`, valores);

  // Comprobación: lo escrito tiene que leerse como movimiento (fecha real y monto).
  const [despuesFilas] = await api.leer(cfg.LIBRO_TESORERIA, [`${hoja(anio)}!B${TES_FILA_RESUMEN}:H`]);
  const despues = armarTesoreria(despuesFilas);
  const esperado = antes.saldoFinal + lista.reduce((a, m) => a + m.monto, 0);
  if (despues.movs.length !== antes.movs.length + lista.length || despues.saldoFinal !== esperado) {
    throw new Error(`Se escribió en la fila ${r} del libro, pero no se lee como movimiento. Revísala en la planilla.`);
  }

  const res = { saldo: despues.saldoFinal, compartido: true, aviso: "" };
  try {
    const [col] = await api.leer(cfg.COMPARTIDO, ["'BD TESORERÍA'!C1:C"]);
    const n = col.length + 1;
    const filasBd = lista.map((m, k) => [
      serialDeYmd(m.fecha),
      Number(m.fecha.slice(5, 7)),
      m.clasificacion,
      m.categoria,
      textoSeguro(m.detalle),
      m.monto,
      `=I${n + k - 1}+H${n + k}`,
    ]);
    await api.escribir(cfg.COMPARTIDO, `'BD TESORERÍA'!C${n}:I${n + lista.length - 1}`, filasBd);
  } catch (err) {
    console.error(err);
    res.compartido = false;
    res.aviso = "Quedó anotado en el libro, pero no se pudo actualizar el archivo compartido.";
  }
  return res;
}

/** Escribe el conteo de caja, el saldo del banco, los ahorros y los diezmos por
 * pagar en la pestaña Saldo. Los dos últimos se guardan en negativo, como están. */
async function guardarCuadratura({ billetes, banco, ahorros, diezmosPorPagar }) {
  const cfg = window.APP_CONFIG;
  const [S] = await window.SheetsApi.leer(cfg.LIBRO_TESORERIA, ["Saldo!A1:J24"]);
  const actual = armarSaldo(S);
  if (!actual.valido) throw new Error("La pestaña Saldo cambió de forma. Actualízala a mano en la planilla.");
  const data = [
    ...billetes.map((b) => ({ range: `Saldo!C${b.fila}`, values: [[b.cant]] })),
    { range: "Saldo!E5", values: [[banco]] },
    { range: "Saldo!E6", values: [[-Math.abs(ahorros)]] },
    { range: "Saldo!E7", values: [[-Math.abs(diezmosPorPagar)]] },
  ];
  await window.SheetsApi.escribirVarios(cfg.LIBRO_TESORERIA, data);
}

// ---------- Diezmos ----------

function mesDeEtiqueta(texto) {
  const t = sinTildes(texto);
  return MESES.findIndex((m) => t.includes(sinTildes(m)));
}

function armarDiezmos(filas, anio) {
  // filas parte en B5: índice i ↔ fila 5 + i; columnas B..J ↔ 0..8.
  const bloques = [];
  let actual = [];
  for (let i = DIE_FILA_DATOS - DIE_FILA_ENCABEZADO; i < filas.length; i++) {
    const f = filas[i] || [];
    const fila = DIE_FILA_ENCABEZADO + i;
    const b = String(f[0] ?? "");
    // Fila de total: "DEPOSITO 20 DE <mes siguiente>" (hay una escrita "DESPOSITO").
    if (/^\s*DE?S?POSITO/i.test(b)) {
      const mesDeposito = mesDeEtiqueta(b);
      if (mesDeposito >= 0) {
        const mes = (mesDeposito + 11) % 12;
        const entradas = actual.filter((x) => x.nombre && esNum(x.monto) && x.monto !== 0);
        bloques.push({
          mes,
          mesNombre: MESES[mes],
          mesDeposito,
          // El bloque de diciembre se deposita en enero del año siguiente.
          anioDeposito: mesDeposito === 0 ? Number(anio) + 1 : Number(anio),
          filaTotal: fila,
          filas: actual,
          entradas,
          total: entradas.reduce((a, x) => a + x.monto, 0),
        });
      }
      actual = [];
      continue;
    }
    actual.push({
      fila,
      fecha: ymdDeCelda(f[0]),
      nombre: String(f[1] || "").trim(),
      clasificacion: String(f[2] || "").trim(),
      monto: esNum(f[5]) ? f[5] : null,
    });
  }
  const nombres = [];
  for (const bl of bloques) for (const x of bl.filas) if (x.nombre && !nombres.includes(x.nombre)) nombres.push(x.nombre);
  // Lista de clasificaciones: columna J, filas 7 a 9.
  const clasificaciones = [2, 3, 4].map((i) => String(filas[i]?.[8] || "").trim()).filter(Boolean);
  return { bloques, nombres, clasificaciones: clasificaciones.length ? clasificaciones : ["Deposito", "Efectivo", "Directo a pastor"] };
}

async function leerDiezmos(anio) {
  const [filas] = await window.SheetsApi.leer(window.APP_CONFIG.LIBRO_DIEZMOS, [`${hoja(anio)}!B${DIE_FILA_ENCABEZADO}:J`]);
  return armarDiezmos(filas, anio);
}

/** Anota un diezmo en el bloque de su mes. `d`: { mes (0-11), fecha, nombre,
 * clasificacion, monto }. Con `forzar` acepta un segundo diezmo de la misma
 * persona en el mismo mes. */
async function guardarDiezmo(anio, d, forzar = false) {
  const cfg = window.APP_CONFIG;
  const api = window.SheetsApi;
  const [filas] = await api.leer(cfg.LIBRO_DIEZMOS, [`${hoja(anio)}!B${DIE_FILA_ENCABEZADO}:J`]);
  const { bloques } = armarDiezmos(filas, anio);
  const bloque = bloques.find((b) => b.mes === d.mes);
  if (!bloque) throw new Error(`No encontré el bloque de ${MESES[d.mes]} en el libro de diezmos ${anio}.`);

  const mismo = (x) => sinTildes(x.nombre) === sinTildes(d.nombre);
  if (!forzar && bloque.entradas.some(mismo)) {
    const e = new Error(`${d.nombre} ya tiene un diezmo anotado en ${MESES[d.mes]}.`);
    e.duplicado = true;
    throw e;
  }
  // Primero la fila que ya lleva su nombre sin monto; si no, la primera vacía.
  const destino = bloque.filas.find((x) => mismo(x) && !x.monto) || bloque.filas.find((x) => !x.nombre && !x.monto);
  if (!destino) throw new Error(`El bloque de ${MESES[d.mes]} no tiene filas libres. Hay que agregar filas en la planilla.`);

  const r = destino.fila;
  await api.escribir(cfg.LIBRO_DIEZMOS, `${hoja(anio)}!B${r}:G${r}`, [
    [serialDeYmd(d.fecha), textoSeguro(d.nombre), d.clasificacion, MESES[d.mes], Number(anio), d.monto],
  ]);

  const [despues] = await api.leer(cfg.LIBRO_DIEZMOS, [`${hoja(anio)}!B${DIE_FILA_ENCABEZADO}:J`]);
  const nuevo = armarDiezmos(despues, anio).bloques.find((b) => b.mes === d.mes);
  if (!nuevo || nuevo.total !== bloque.total + d.monto) {
    throw new Error(`Se escribió en la fila ${r} del libro de diezmos, pero el total del mes no calza. Revísala en la planilla.`);
  }

  const res = { total: nuevo.total, compartido: true, aviso: "" };
  try {
    // Al compartido va solo quién diezmó, nunca el monto.
    const [col] = await api.leer(cfg.COMPARTIDO, ["'BD DIEZMOS'!A1:A"]);
    const n = col.length + 1;
    await api.escribir(cfg.COMPARTIDO, `'BD DIEZMOS'!A${n}:C${n}`, [[MESES[d.mes], Number(anio), textoSeguro(d.nombre)]]);
  } catch (err) {
    console.error(err);
    res.compartido = false;
    res.aviso = "Quedó anotado en el libro, pero no se pudo actualizar el archivo compartido.";
  }
  return res;
}

// ---------- Trámite de la cuenta bancaria ----------

async function leerTramite() {
  const [B, P, D] = await window.SheetsApi.leer(window.APP_CONFIG.APP_DB, ["Tramite!A1:C", "Pendientes!A1:E", "Datos!A1:B"]);
  const txt = (v) => String(v ?? "").trim();
  return {
    bitacora: B.slice(1).filter((f) => txt(f[1])).map((f) => ({ fecha: ymdDeCelda(f[0]) || txt(f[0]), hecho: txt(f[1]), detalle: txt(f[2]) })),
    pendientes: P.slice(1).filter((f) => txt(f[1])).map((f) => ({ id: txt(f[0]), tarea: txt(f[1]), estado: txt(f[2]) || "Pendiente", nota: txt(f[3]), limite: txt(f[4]) })),
    datos: D.slice(1).filter((f) => txt(f[0])).map((f) => ({ clave: txt(f[0]), valor: txt(f[1]) })),
  };
}

async function marcarPendiente(id, estado) {
  const cfg = window.APP_CONFIG;
  const [col] = await window.SheetsApi.leer(cfg.APP_DB, ["Pendientes!A1:A"]);
  const i = col.findIndex((f) => String(f[0] ?? "").trim() === id);
  if (i < 1) throw new Error("No encontré ese pendiente en la planilla.");
  await window.SheetsApi.escribir(cfg.APP_DB, `Pendientes!C${i + 1}`, [[estado]], "RAW");
}

async function agregarBitacora(fecha, hecho, detalle) {
  // RAW: la fecha queda como texto AAAA-MM-DD, igual que el resto de esa pestaña.
  await window.SheetsApi.agregar(window.APP_CONFIG.APP_DB, "Tramite!A:C", [fecha, hecho, detalle], "RAW");
}

window.Libros = {
  MESES,
  sinTildes,
  leerTesoreria,
  leerDiezmos,
  leerTramite,
  guardarMovimientos,
  guardarDiezmo,
  guardarCuadratura,
  marcarPendiente,
  agregarBitacora,
};
})();
