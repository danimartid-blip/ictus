// Pantallas de la app. Los datos y las reglas de los libros viven en libros.js.

const $ = (id) => document.getElementById(id);
const L = window.Libros;
const MESES = L.MESES;

const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const plata = (n) => (n < 0 ? "−$" : "$") + Math.abs(Math.round(n)).toLocaleString("es-CL");
const fechaCorta = (ymd) => (ymd && /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? `${ymd.slice(8)}-${ymd.slice(5, 7)}-${ymd.slice(0, 4)}` : ymd || "");
const diaMes = (ymd) => `${Number(ymd.slice(8))} ${MESES[Number(ymd.slice(5, 7)) - 1].slice(0, 3).toLowerCase()}`;
const soloNumero = (s) => Number(String(s ?? "").replace(/[^\d]/g, "")) || 0;

function hoyYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function ultimoDomingo() {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// anio: el que se está mirando. anios: pestañas de año visibles del libro.
const E = { anio: null, anios: [], tes: null, diez: null, tram: null, errores: {}, mesFiltro: "todo" };

const esAnioActual = () => E.anio === E.anios[0];

// ---------- Avisos y hoja inferior ----------

let toastTimer = null;
function showToast(msg, tipo = "") {
  const t = $("toast");
  t.textContent = msg;
  t.className = `toast ${tipo}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), tipo === "error" ? 7000 : 3500);
}

function mostrarHoja(html) {
  $("hojaCuerpo").innerHTML = html;
  $("hoja").hidden = false;
  $("hojaFondo").hidden = false;
  document.body.classList.add("sin-scroll");
}
function cerrarHoja() {
  $("hoja").hidden = true;
  $("hojaFondo").hidden = true;
  document.body.classList.remove("sin-scroll");
}

/** Corre una escritura con el botón bloqueado. Pase lo que pase el botón vuelve. */
async function conBoton(btn, textoOcupado, fn) {
  const texto = btn.textContent;
  btn.disabled = true;
  btn.textContent = textoOcupado;
  try {
    await fn();
  } catch (err) {
    console.error(err);
    showToast(err.message || "No se pudo guardar.", "error");
  } finally {
    btn.disabled = false;
    btn.textContent = texto;
  }
}

// ---------- Carga ----------

async function cargar() {
  if (!E.anios.length) {
    const titulos = await window.SheetsApi.pestanas(window.APP_CONFIG.LIBRO_TESORERIA);
    E.anios = titulos.map((t) => t.trim()).filter((t) => /^20\d{2}$/.test(t)).sort().reverse();
    if (!E.anios.length) throw new Error("No encontré pestañas de año en el Libro de tesorería.");
    E.anio = E.anios[0];
    $("selAnio").innerHTML = E.anios.map((a) => `<option>${esc(a)}</option>`).join("");
  }
  E.errores = {};
  const intento = async (clave, fn) => {
    try {
      E[clave] = await fn();
    } catch (err) {
      console.error(err);
      E[clave] = null;
      E.errores[clave] = err.message || String(err);
    }
  };
  await Promise.all([
    intento("tes", () => L.leerTesoreria(E.anio)),
    intento("diez", () => L.leerDiezmos(E.anio)),
    intento("tram", () => L.leerTramite()),
  ]);
}

async function recargar() {
  await cargar();
  pintar();
}

// ---------- Cálculos de pantalla ----------

/** Cuánta plata existe según la pestaña Saldo, contra lo que dice el libro. */
function cuadratura() {
  const c = E.tes?.cuadratura;
  if (!c || !c.valido || !esAnioActual()) return null;
  const real = c.caja + c.banco + c.ahorros + c.diezmosPorPagar;
  return { ...c, real, diferencia: real - E.tes.saldoFinal };
}

function porMes(movs) {
  const meses = [];
  for (const m of movs) {
    const k = m.fecha.slice(0, 7);
    let g = meses.find((x) => x.k === k);
    if (!g) meses.push((g = { k, ingresos: 0, gastos: 0, ahorro: 0 }));
    const clas = L.sinTildes(m.clasificacion);
    if (clas === "ingresos") g.ingresos += m.monto;
    else if (clas === "ahorro") g.ahorro += m.monto;
    else g.gastos += m.monto;
  }
  return meses.sort((a, b) => (a.k < b.k ? -1 : 1));
}

/** El bloque de diezmos que se está juntando: el primero cuyo depósito del 20
 * todavía no pasa. */
function bloqueAbierto() {
  const bloques = E.diez?.bloques || [];
  const hoy = hoyYmd();
  return (
    bloques.find((b) => `${b.anioDeposito}-${String(b.mesDeposito + 1).padStart(2, "0")}-20` >= hoy) ||
    [...bloques].reverse().find((b) => b.entradas.length) ||
    null
  );
}

// ---------- Vistas ----------

const avisoError = (clave, que) =>
  E.errores[clave] ? `<div class="aviso-error"><strong>No se pudo leer ${que}.</strong><p>${esc(E.errores[clave])}</p></div>` : "";

function filaMov(m) {
  const clas = L.sinTildes(m.clasificacion);
  return `<li class="mov">
    <div class="mov-fecha">${esc(diaMes(m.fecha))}</div>
    <div class="mov-cuerpo"><div class="mov-det">${esc(m.detalle || m.categoria)}</div><div class="mov-cat">${esc(m.categoria)}${clas === "ahorro" ? " · Ahorro" : ""}</div></div>
    <div class="mov-monto ${m.monto < 0 ? "neg" : "pos"}">${plata(m.monto)}<small>${plata(m.saldo)}</small></div>
  </li>`;
}

function tarjetaCuadratura() {
  const q = cuadratura();
  if (!q) {
    if (E.tes && esAnioActual()) return `<div class="card"><p class="nota">La pestaña Saldo del libro cambió de forma y no se puede leer la cuadratura desde aquí.</p></div>`;
    return "";
  }
  const ok = q.diferencia === 0;
  return `<div class="card">
    <div class="card-titulo"><h3>Caja y banco</h3><span class="pill ${ok ? "ok" : "alerta"}">${ok ? "✓ Cuadrado" : "✕ No cuadra"}</span></div>
    <dl class="cuentas">
      <div><dt>Caja en efectivo</dt><dd>${plata(q.caja)}</dd></div>
      <div><dt>Banco</dt><dd>${plata(q.banco)}</dd></div>
      <div><dt>Ahorros apartados</dt><dd>${plata(q.ahorros)}</dd></div>
      <div><dt>Diezmos por pagar</dt><dd>${plata(q.diezmosPorPagar)}</dd></div>
      <div class="total"><dt>Plata de tesorería</dt><dd>${plata(q.real)}</dd></div>
      <div><dt>Saldo del libro</dt><dd>${plata(E.tes.saldoFinal)}</dd></div>
      ${ok ? "" : `<div class="dif"><dt>Diferencia</dt><dd>${plata(q.diferencia)}</dd></div>`}
    </dl>
    ${ok ? "" : `<p class="nota">${q.diferencia > 0 ? "Hay más plata que la que dice el libro: puede faltar anotar un ingreso." : "Hay menos plata que la que dice el libro: puede faltar anotar un gasto, o actualizar el banco o la caja."}</p>`}
    <button class="btn-sec" data-accion="cuadrar">Actualizar caja y banco</button>
  </div>`;
}

function vistaInicio() {
  const t = E.tes;
  let html = avisoError("tes", "el Libro de tesorería");
  if (t) {
    const ultimo = t.movs[t.movs.length - 1];
    const dias = ultimo ? Math.floor((new Date(hoyYmd()) - new Date(ultimo.fecha)) / 86400000) : 0;
    html += `<div class="card saldo">
      <div class="saldo-rotulo">Saldo de tesorería ${esc(E.anio)}</div>
      <div class="saldo-monto">${plata(t.saldoFinal)}</div>
      <div class="saldo-pie">${ultimo ? `Último movimiento: ${esc(fechaCorta(ultimo.fecha))}` : "Sin movimientos este año"}</div>
      ${esAnioActual() && dias > 10 ? `<div class="aviso-suave">Hace ${dias} días que no se anota nada.</div>` : ""}
    </div>`;
    html += tarjetaCuadratura();

    const meses = porMes(t.movs);
    const tope = Math.max(1, ...meses.map((m) => Math.max(m.ingresos, -(m.gastos + m.ahorro))));
    html += `<h2>Año ${esc(E.anio)}</h2><div class="tiles">
      <div class="tile"><span>Entradas</span><b class="pos">${plata(t.entradas)}</b></div>
      <div class="tile"><span>Gastos</span><b class="neg">${plata(t.gastos)}</b></div>
      <div class="tile"><span>Ahorro</span><b>${plata(-t.ahorro)}</b></div>
    </div>`;
    if (meses.length) {
      html += `<div class="card"><div class="barras">${meses
        .map(
          (m) => `<div class="barra-mes" title="${esc(MESES[Number(m.k.slice(5)) - 1])}">
            <div class="barra-par"><i class="b-in" style="height:${Math.round((m.ingresos / tope) * 100)}%"></i><i class="b-out" style="height:${Math.round((-(m.gastos + m.ahorro) / tope) * 100)}%"></i></div>
            <span>${esc(MESES[Number(m.k.slice(5)) - 1].slice(0, 3))}</span>
          </div>`
        )
        .join("")}</div><div class="leyenda"><span><i class="b-in"></i>Entradas</span><span><i class="b-out"></i>Gastos y ahorro</span></div></div>`;
    }
  }

  const b = bloqueAbierto();
  if (b) {
    html += `<h2>Diezmos</h2><a class="card enlace" href="#diezmos">
      <div class="card-titulo"><h3>Diezmos de ${esc(b.mesNombre)}</h3><b>${plata(b.total)}</b></div>
      <p class="nota">${b.entradas.length} ${b.entradas.length === 1 ? "persona" : "personas"} · se transfiere el 20 de ${esc(MESES[b.mesDeposito].toLowerCase())}</p>
    </a>`;
  }

  const pend = (E.tram?.pendientes || []).filter((p) => p.estado !== "Hecho");
  if (pend.length) {
    html += `<h2>Cuenta bancaria</h2><a class="card enlace" href="#tramite">
      <div class="card-titulo"><h3>${esc(pend[0].tarea)}</h3></div>
      <p class="nota">${pend.length} ${pend.length === 1 ? "pendiente" : "pendientes"} del trámite</p>
    </a>`;
  }

  if (t?.movs.length) {
    html += `<h2>Últimos movimientos</h2><div class="card lista"><ul>${t.movs.slice(-6).reverse().map(filaMov).join("")}</ul></div>
      <a class="link-mas" href="#movimientos">Ver todos</a>`;
  }
  return html;
}

function vistaMovimientos() {
  const t = E.tes;
  if (!t) return avisoError("tes", "el Libro de tesorería");
  const meses = porMes(t.movs);
  if (E.mesFiltro !== "todo" && !meses.some((m) => m.k === E.mesFiltro)) E.mesFiltro = "todo";
  const movs = E.mesFiltro === "todo" ? t.movs : t.movs.filter((m) => m.fecha.startsWith(E.mesFiltro));
  const g = E.mesFiltro === "todo" ? { ingresos: t.entradas, gastos: t.gastos, ahorro: t.ahorro } : meses.find((m) => m.k === E.mesFiltro);
  const neto = g.ingresos + g.gastos + g.ahorro;

  // Por categoría, para ver en qué se fue la plata.
  const cats = [];
  for (const m of movs) {
    const k = `${m.clasificacion}|${m.categoria}`;
    let c = cats.find((x) => x.k === k);
    if (!c) cats.push((c = { k, clasificacion: m.clasificacion, categoria: m.categoria, monto: 0 }));
    c.monto += m.monto;
  }
  cats.sort((a, b) => Math.abs(b.monto) - Math.abs(a.monto));

  return `<div class="chips">
      <button class="chip-f ${E.mesFiltro === "todo" ? "activo" : ""}" data-mes="todo">Todo ${esc(E.anio)}</button>
      ${[...meses].reverse().map((m) => `<button class="chip-f ${E.mesFiltro === m.k ? "activo" : ""}" data-mes="${esc(m.k)}">${esc(MESES[Number(m.k.slice(5)) - 1])}</button>`).join("")}
    </div>
    <div class="tiles">
      <div class="tile"><span>Entradas</span><b class="pos">${plata(g.ingresos)}</b></div>
      <div class="tile"><span>Gastos y ahorro</span><b class="neg">${plata(g.gastos + g.ahorro)}</b></div>
      <div class="tile"><span>Resultado</span><b class="${neto < 0 ? "neg" : "pos"}">${plata(neto)}</b></div>
    </div>
    <h2>Por categoría</h2>
    <div class="card lista"><ul>${cats
      .map((c) => `<li class="mov"><div class="mov-cuerpo"><div class="mov-det">${esc(c.categoria)}</div><div class="mov-cat">${esc(c.clasificacion)}</div></div><div class="mov-monto ${c.monto < 0 ? "neg" : "pos"}">${plata(c.monto)}</div></li>`)
      .join("") || `<li class="vacio">Sin movimientos.</li>`}</ul></div>
    <h2>Movimientos <span class="cuenta">${movs.length}</span></h2>
    <div class="card lista"><ul>${[...movs].reverse().map(filaMov).join("") || `<li class="vacio">Sin movimientos.</li>`}</ul></div>`;
}

function vistaDiezmos() {
  const d = E.diez;
  if (!d) return avisoError("diez", "el Libro de diezmos");
  const abierto = bloqueAbierto();
  const visibles = d.bloques.filter((b) => b.entradas.length || b === abierto).reverse();
  if (!visibles.length) return `<div class="card"><p class="nota">No hay diezmos anotados en ${esc(E.anio)}.</p></div>`;
  const totalAnio = d.bloques.reduce((a, b) => a + b.total, 0);
  return `<div class="tiles dos">
      <div class="tile"><span>Diezmos ${esc(E.anio)}</span><b>${plata(totalAnio)}</b></div>
      <div class="tile"><span>Meses con diezmos</span><b>${d.bloques.filter((b) => b.entradas.length).length}</b></div>
    </div>
    ${visibles
      .map(
        (b) => `<div class="card">
        <div class="card-titulo"><h3>${esc(b.mesNombre)}</h3>${b === abierto ? `<span class="pill info">Recibiendo</span>` : ""}<b>${plata(b.total)}</b></div>
        <p class="nota">Se transfiere el 20 de ${esc(MESES[b.mesDeposito].toLowerCase())}: ${plata(b.total * 0.9)} a pastores locales y ${plata(b.total * 0.1)} a pastores no locales.</p>
        <ul class="personas">${b.entradas
          .map((x) => `<li><span>${esc(x.nombre)}<small>${esc(x.fecha ? fechaCorta(x.fecha) : "sin fecha")}${x.clasificacion && L.sinTildes(x.clasificacion) !== "deposito" ? " · " + esc(x.clasificacion) : ""}</small></span><b>${plata(x.monto)}</b></li>`)
          .join("") || `<li class="vacio">Todavía no llega ninguno.</li>`}</ul>
      </div>`
      )
      .join("")}`;
}

function vistaTramite() {
  const t = E.tram;
  if (!t) return avisoError("tram", "el seguimiento del trámite");
  const pend = t.pendientes;
  return `<h2 class="primero">Lo que falta <span class="cuenta">${pend.filter((p) => p.estado !== "Hecho").length} de ${pend.length}</span></h2>
    <div class="card lista"><ul>${pend
      .map(
        (p) => `<li class="pend ${p.estado === "Hecho" ? "hecho" : ""}">
          <button class="check" data-pend="${esc(p.id)}" aria-label="${p.estado === "Hecho" ? "Volver a pendiente" : "Marcar como hecho"}">${p.estado === "Hecho" ? "✓" : ""}</button>
          <div><div class="mov-det">${esc(p.tarea)}</div>${p.nota ? `<div class="mov-cat">${esc(p.nota)}</div>` : ""}${p.limite ? `<div class="mov-cat">Plazo: ${esc(fechaCorta(p.limite))}</div>` : ""}</div>
        </li>`
      )
      .join("") || `<li class="vacio">Nada pendiente.</li>`}</ul></div>
    <h2>Bitácora</h2>
    <div class="card lista"><ul>${[...t.bitacora]
      .reverse()
      .map((b) => `<li class="bit"><div class="mov-fecha">${esc(fechaCorta(b.fecha))}</div><div><div class="mov-det">${esc(b.hecho)}</div>${b.detalle ? `<div class="mov-cat">${esc(b.detalle)}</div>` : ""}</div></li>`)
      .join("") || `<li class="vacio">Sin registros.</li>`}</ul></div>
    <h2>Datos</h2>
    <div class="card"><dl class="cuentas datos">${t.datos.map((d) => `<div><dt>${esc(d.clave)}</dt><dd>${esc(d.valor)}</dd></div>`).join("")}</dl></div>`;
}

const VISTAS = { inicio: vistaInicio, movimientos: vistaMovimientos, diezmos: vistaDiezmos, tramite: vistaTramite };

function vistaActual() {
  const v = location.hash.replace("#", "");
  return VISTAS[v] ? v : "inicio";
}

function pintar() {
  const v = vistaActual();
  $("vista").innerHTML = VISTAS[v]();
  document.querySelectorAll(".tabs a").forEach((a) => a.classList.toggle("activo", a.dataset.tab === v));
  // Se anota solo en el año en curso: el compartido lleva un saldo corrido.
  const puede = v === "tramite" ? !!E.tram : esAnioActual() && (v === "diezmos" ? !!E.diez : !!E.tes);
  $("fab").hidden = !puede;
}

// ---------- Formularios ----------

function formMovimiento() {
  const cats = E.tes.categorias;
  // Con value explícito: el texto de un <option> pierde los espacios del final.
  const opciones = (clas) => (cats[clas] || []).map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  mostrarHoja(`<h3>Anotar en tesorería</h3>
    <div class="segmento" id="segTipo">
      <button type="button" class="activo" data-tipo="domingo">Ofrenda del domingo</button>
      <button type="button" data-tipo="Ingresos">Ingreso</button>
      <button type="button" data-tipo="Gastos">Gasto</button>
      <button type="button" data-tipo="Ahorro">Ahorro</button>
    </div>
    <form id="formMov">
      <label>Fecha<input type="date" name="fecha" required value="${ultimoDomingo()}" max="${E.anio}-12-31" min="${E.anio}-01-01"></label>
      <div id="camposDomingo">
        <label>Presencial<input inputmode="numeric" name="presencial" placeholder="$0" autocomplete="off"></label>
        <label>Por transferencia<input inputmode="numeric" name="transferencia" placeholder="$0" autocomplete="off"></label>
      </div>
      <div id="camposOtro" hidden>
        <label>Categoría<select name="categoria"></select></label>
        <label>Detalle<input name="detalle" list="listaDetalles" autocomplete="off" placeholder="Qué fue"></label>
        <datalist id="listaDetalles"></datalist>
        <label>Monto<input inputmode="numeric" name="monto" placeholder="$0" autocomplete="off"></label>
        <label class="check-linea"><input type="checkbox" name="invertir"> Signo contrario (una devolución o una colecta de paso)</label>
      </div>
      <p class="nota" id="resumenMov"></p>
      <button class="btn-primary" type="submit">Guardar</button>
    </form>`);

  let tipo = "domingo";
  const f = $("formMov");
  const detallesDe = (cat) => {
    const vistos = [];
    for (const m of [...E.tes.movs].reverse()) if (m.categoria === cat && m.detalle && !vistos.includes(m.detalle)) vistos.push(m.detalle);
    return vistos.slice(0, 12);
  };
  const refrescar = () => {
    $("camposDomingo").hidden = tipo !== "domingo";
    $("camposOtro").hidden = tipo === "domingo";
    if (tipo !== "domingo") {
      $("listaDetalles").innerHTML = detallesDe(f.categoria.value).map((d) => `<option value="${esc(d)}">`).join("");
    }
    const lista = armar();
    $("resumenMov").textContent = lista.length
      ? `Saldo después de guardar: ${plata(E.tes.saldoFinal + lista.reduce((a, m) => a + m.monto, 0))}`
      : "";
  };
  const armar = () => {
    const fecha = f.fecha.value;
    if (tipo === "domingo") {
      const out = [];
      // Mismo texto que usa el libro (incluida la falta en "Tranferencia").
      if (soloNumero(f.transferencia.value)) out.push({ fecha, clasificacion: "Ingresos", categoria: "Ofrendas dominicales", detalle: "Ofrenda por Tranferencia", monto: soloNumero(f.transferencia.value) });
      if (soloNumero(f.presencial.value)) out.push({ fecha, clasificacion: "Ingresos", categoria: "Ofrendas dominicales", detalle: "Ofrenda Presencial Satelite", monto: soloNumero(f.presencial.value) });
      return out;
    }
    const n = soloNumero(f.monto.value);
    if (!n) return [];
    let monto = tipo === "Ingresos" ? n : -n;
    if (f.invertir.checked) monto = -monto;
    return [{ fecha, clasificacion: tipo, categoria: f.categoria.value, detalle: f.detalle.value.trim(), monto }];
  };

  $("segTipo").addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    tipo = b.dataset.tipo;
    $("segTipo").querySelectorAll("button").forEach((x) => x.classList.toggle("activo", x === b));
    if (tipo !== "domingo") {
      f.categoria.innerHTML = opciones(tipo);
      if (f.fecha.value === ultimoDomingo()) f.fecha.value = hoyYmd().startsWith(E.anio) ? hoyYmd() : f.fecha.value;
    }
    refrescar();
  });
  f.addEventListener("input", refrescar);
  f.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const lista = armar();
    if (!f.fecha.value || !f.fecha.value.startsWith(E.anio)) return showToast(`La fecha tiene que ser de ${E.anio}.`, "error");
    if (!lista.length) return showToast("Falta el monto.", "error");
    if (tipo !== "domingo" && !lista[0].detalle) return showToast("Falta el detalle.", "error");
    conBoton(f.querySelector("button[type=submit]"), "Guardando…", async () => {
      const res = await L.guardarMovimientos(E.anio, lista);
      cerrarHoja();
      await recargar();
      const q = cuadratura();
      showToast(res.aviso || `Anotado. Saldo: ${plata(res.saldo)}${q && q.diferencia !== 0 ? ". Falta actualizar caja o banco." : ""}`, res.aviso ? "error" : "");
    });
  });
  refrescar();
}

function formDiezmo() {
  const d = E.diez;
  const abierto = bloqueAbierto();
  mostrarHoja(`<h3>Anotar un diezmo</h3>
    <form id="formDie">
      <label>Mes al que corresponde<select name="mes">${d.bloques.map((b) => `<option value="${b.mes}" ${b === abierto ? "selected" : ""}>${esc(b.mesNombre)}</option>`).join("")}</select></label>
      <label>Quién<select name="nombre">${d.nombres.map((n) => `<option>${esc(n)}</option>`).join("")}<option value="__otro">Otra persona…</option></select></label>
      <label id="campoOtro" hidden>Nombre<input name="otro" autocomplete="off"></label>
      <label>Fecha en que llegó<input type="date" name="fecha" required value="${hoyYmd()}"></label>
      <label>Cómo llegó<select name="clasificacion">${d.clasificaciones.map((c) => `<option ${L.sinTildes(c) === "deposito" ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
      <label>Monto<input inputmode="numeric" name="monto" placeholder="$0" autocomplete="off"></label>
      <button class="btn-primary" type="submit">Guardar</button>
    </form>`);
  const f = $("formDie");
  f.nombre.addEventListener("change", () => ($("campoOtro").hidden = f.nombre.value !== "__otro"));
  f.addEventListener("submit", (ev) => {
    ev.preventDefault();
    const nombre = f.nombre.value === "__otro" ? f.otro.value.trim() : f.nombre.value;
    const dato = { mes: Number(f.mes.value), fecha: f.fecha.value, nombre, clasificacion: f.clasificacion.value, monto: soloNumero(f.monto.value) };
    if (!nombre) return showToast("Falta el nombre.", "error");
    if (!dato.monto) return showToast("Falta el monto.", "error");
    conBoton(f.querySelector("button[type=submit]"), "Guardando…", async () => {
      let res;
      try {
        res = await L.guardarDiezmo(E.anio, dato);
      } catch (err) {
        if (!err.duplicado || !confirm(`${err.message} ¿Anotar otro igual?`)) throw err;
        res = await L.guardarDiezmo(E.anio, dato, true);
      }
      cerrarHoja();
      await recargar();
      showToast(res.aviso || `Anotado. ${MESES[dato.mes]} lleva ${plata(res.total)}.`, res.aviso ? "error" : "");
    });
  });
}

function formCuadrar() {
  const q = cuadratura();
  if (!q) return;
  const abierto = bloqueAbierto();
  mostrarHoja(`<h3>Caja y banco</h3>
    <p class="nota">Cuenta los billetes y mira el saldo de la cuenta. Tiene que dar lo mismo que el libro.</p>
    <form id="formCua">
      <div class="billetes">${q.billetes
        .map((b) => `<label>${plata(b.denom)}<input inputmode="numeric" name="b${b.fila}" value="${b.cant}" autocomplete="off"></label>`)
        .join("")}</div>
      <label>Saldo del banco<input inputmode="numeric" name="banco" value="${Math.round(q.banco)}" autocomplete="off"></label>
      <label>Ahorros apartados (están en el banco)<input inputmode="numeric" name="ahorros" value="${Math.abs(q.ahorros)}" autocomplete="off"></label>
      <label>Diezmos por pagar (están en el banco)<input inputmode="numeric" name="diezmos" value="${Math.abs(q.diezmosPorPagar)}" autocomplete="off"></label>
      ${abierto ? `<p class="nota">En el libro de diezmos, ${esc(abierto.mesNombre)} lleva ${plata(abierto.total)}.</p>` : ""}
      <dl class="cuentas" id="resCua"></dl>
      <button class="btn-primary" type="submit">Guardar</button>
    </form>`);
  const f = $("formCua");
  const leerForm = () => ({
    billetes: q.billetes.map((b) => ({ fila: b.fila, denom: b.denom, cant: soloNumero(f[`b${b.fila}`].value) })),
    banco: soloNumero(f.banco.value),
    ahorros: soloNumero(f.ahorros.value),
    diezmosPorPagar: soloNumero(f.diezmos.value),
  });
  const refrescar = () => {
    const v = leerForm();
    const caja = v.billetes.reduce((a, b) => a + b.denom * b.cant, 0);
    const real = caja + v.banco - v.ahorros - v.diezmosPorPagar;
    const dif = real - E.tes.saldoFinal;
    $("resCua").innerHTML = `<div><dt>Caja en efectivo</dt><dd>${plata(caja)}</dd></div>
      <div class="total"><dt>Plata de tesorería</dt><dd>${plata(real)}</dd></div>
      <div><dt>Saldo del libro</dt><dd>${plata(E.tes.saldoFinal)}</dd></div>
      <div class="${dif === 0 ? "ok" : "dif"}"><dt>Diferencia</dt><dd>${dif === 0 ? "✓ $0" : plata(dif)}</dd></div>`;
  };
  f.addEventListener("input", refrescar);
  f.addEventListener("submit", (ev) => {
    ev.preventDefault();
    conBoton(f.querySelector("button[type=submit]"), "Guardando…", async () => {
      await L.guardarCuadratura(leerForm());
      cerrarHoja();
      await recargar();
      const d = cuadratura();
      showToast(d && d.diferencia === 0 ? "Guardado. Cuadra con el libro." : `Guardado. Diferencia: ${plata(d ? d.diferencia : 0)}`);
    });
  });
  refrescar();
}

function formBitacora() {
  mostrarHoja(`<h3>Anotar en la bitácora</h3>
    <form id="formBit">
      <label>Fecha<input type="date" name="fecha" required value="${hoyYmd()}"></label>
      <label>Qué pasó<input name="hecho" autocomplete="off" placeholder="Respondió el Ministerio"></label>
      <label>Detalle<textarea name="detalle" rows="3"></textarea></label>
      <button class="btn-primary" type="submit">Guardar</button>
    </form>`);
  const f = $("formBit");
  f.addEventListener("submit", (ev) => {
    ev.preventDefault();
    if (!f.hecho.value.trim()) return showToast("Falta qué pasó.", "error");
    conBoton(f.querySelector("button[type=submit]"), "Guardando…", async () => {
      await L.agregarBitacora(f.fecha.value, f.hecho.value.trim(), f.detalle.value.trim());
      cerrarHoja();
      await recargar();
      showToast("Anotado en la bitácora.");
    });
  });
}

async function alternarPendiente(btn) {
  const p = E.tram.pendientes.find((x) => x.id === btn.dataset.pend);
  if (!p) return;
  const antes = p.estado;
  // Se pinta al tiro y, si el guardado falla, vuelve a como estaba.
  p.estado = antes === "Hecho" ? "Pendiente" : "Hecho";
  pintar();
  try {
    await L.marcarPendiente(p.id, p.estado);
  } catch (err) {
    console.error(err);
    p.estado = antes;
    pintar();
    showToast("No se pudo guardar el cambio.", "error");
  }
}

// ---------- Arranque ----------

function conectar() {
  window.addEventListener("hashchange", () => {
    pintar();
    window.scrollTo(0, 0);
  });
  $("hojaFondo").addEventListener("click", cerrarHoja);
  $("selAnio").addEventListener("change", async (ev) => {
    E.anio = ev.target.value;
    E.mesFiltro = "todo";
    $("vista").innerHTML = `<div class="cargando">Cargando ${esc(E.anio)}…</div>`;
    await recargar();
  });
  $("btnActualizar").addEventListener("click", async (ev) => {
    const b = ev.currentTarget;
    b.disabled = true;
    b.classList.add("girando");
    try {
      await recargar();
      showToast("Actualizado.");
    } catch (err) {
      showToast(err.message || "No se pudo actualizar.", "error");
    } finally {
      b.disabled = false;
      b.classList.remove("girando");
    }
  });
  $("btnSalir").addEventListener("click", () => {
    if (!confirm("¿Cerrar la sesión de Google en esta app?")) return;
    window.SheetsAuth.logout();
    location.replace("login.html");
  });
  $("fab").addEventListener("click", () => {
    const v = vistaActual();
    if (v === "diezmos") formDiezmo();
    else if (v === "tramite") formBitacora();
    else formMovimiento();
  });
  $("vista").addEventListener("click", (ev) => {
    const mes = ev.target.closest("[data-mes]");
    if (mes) {
      E.mesFiltro = mes.dataset.mes;
      return pintar();
    }
    if (ev.target.closest("[data-accion=cuadrar]")) return formCuadrar();
    const pend = ev.target.closest("[data-pend]");
    if (pend) alternarPendiente(pend);
  });
}

async function init() {
  // Vista previa local con datos de prueba: sin login y sin tocar las planillas.
  if (!window.__DATOS_PRUEBA__ && !window.SheetsAuth.requireAuthOrRedirect()) return;
  conectar();
  try {
    await cargar();
    pintar();
  } catch (err) {
    console.error(err);
    $("vista").innerHTML = `<div class="aviso-error"><strong>No se pudieron cargar los libros.</strong><p>${esc(err.message || err)}</p>
      <button class="btn-sec" onclick="window.SheetsAuth.logout();location.replace('login.html')">Volver a entrar</button></div>`;
  }
}

init();
