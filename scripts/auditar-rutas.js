// Auditor estático de rutas: `npm run auditar`.
// Lista todas las rutas y marca las que rompen las reglas de aislamiento y de acceso.
// ERROR corta la corrida (código de salida 1); AVISO es para revisar a mano.
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const leer = rel => fs.readFileSync(path.join(SRC, rel), 'utf8');
const RE_RUTA = /^router\.(get|post|put|patch|delete)\(\s*'([^']+)'(.*)$/;

function parsearRutas(archivo) {
  const texto = leer(archivo);
  const lineas = texto.split(/\r?\n/); // los archivos pueden venir con CRLF (Windows)
  const rutas = [];
  lineas.forEach((l, i) => {
    const m = l.match(RE_RUTA);
    if (m) rutas.push({ metodo: m[1].toUpperCase(), ruta: m[2], resto: m[3], linea: i + 1, idx: i });
  });
  rutas.forEach((r, k) => {
    const fin = k + 1 < rutas.length ? rutas[k + 1].idx : lineas.length;
    r.bloque = lineas.slice(r.idx, fin).join('\n');
    r.previas = lineas.slice(Math.max(0, r.idx - 1), r.idx).join('\n');
  });
  return { texto, lineas, rutas };
}

// Resuelve `servicioCtrl.actualizar` al texto de esa función en su controlador.
function cuerpoDeControlador(texto, resto) {
  const ref = resto.match(/(\w+Ctrl)\.(\w+)/);
  if (!ref) return '';
  const imp = texto.match(new RegExp(`const ${ref[1]}\\s*=\\s*require\\('\\.\\./controllers/(\\w+)'\\)`));
  if (!imp) return '';
  const src = leer(`controllers/${imp[1]}.js`);
  const ini = src.search(new RegExp(`const ${ref[2]}\\s*=\\s*async`));
  if (ini < 0) return '';
  const sig = src.slice(ini + 10).search(/\nconst \w+\s*=\s*async|\nmodule\.exports/);
  return src.slice(ini, sig < 0 ? undefined : ini + 10 + sig);
}

const hallazgos = [];
const filas = [];
const marcar = (nivel, ruta, msg) => hallazgos.push({ nivel, ruta, msg });

// ── Rutas protegidas ─────────────────────────────────────────────────────────
{
  const { texto, rutas } = parsearRutas('routes/tenantRoutes.js');
  const primera = texto.indexOf('router.get(');
  for (const guarda of ['router.use(authMiddleware)', 'router.use(tenantMiddleware)']) {
    const pos = texto.indexOf(guarda);
    if (pos < 0 || pos > primera) marcar('ERROR', 'tenantRoutes.js', `falta ${guarda} antes de la primera ruta`);
  }
  for (const r of rutas) {
    const id = `${r.metodo} ${r.ruta}`;
    const cuerpo = r.bloque + '\n' + cuerpoDeControlador(texto, r.resto);
    const roles = (r.bloque.split('\n')[0].match(/soloRoles\(([^)]*)\)/) || [])[1];
    const escritura = r.metodo !== 'GET';

    if (/:\w+/.test(r.ruta) && !/idbarberia/.test(cuerpo)) marcar('ERROR', id, `recibe un id y no se ve el filtro por idbarberia (línea ${r.linea})`);
    if (/\.(update|create)\(\s*req\.body\s*[,)]/.test(cuerpo)) marcar('ERROR', id, `usa req.body completo en update/create: asignación masiva (línea ${r.linea})`);
    // Id suelto (ej. findByPk(idservicio)): viene del body y no filtra por barbería.
    // Los accesos por propiedad (turno.idcliente, req.usuario.x) parten de un registro ya validado.
    if (/findByPk\(\s*[A-Za-z_]\w*\s*[,)]/.test(cuerpo)) marcar('ERROR', id, 'findByPk con un id suelto (del body): no filtra por barbería, usar findOne con idbarberia');
    if (escritura && !roles) marcar('AVISO', id, 'escritura abierta a cualquier rol autenticado: confirmar que es a propósito');
    if (/toISOString\(\)/.test(cuerpo)) marcar('AVISO', id, 'usa toISOString(): fecha en UTC, se corre el día después de las 21 hs en Argentina');

    filas.push({ acceso: 'sesión', metodo: r.metodo, ruta: r.ruta, rol: roles ? roles.replace(/['\s]/g, '') : 'cualquiera' });
  }
}

// ── Rutas públicas: cada una tiene que declarar su motivo ────────────────────
{
  const { rutas } = parsearRutas('routes/publicRoutes.js');
  for (const r of rutas) {
    const declarada = r.previas.match(/\/\/\s*PUBLICA:\s*(.+)/);
    if (!declarada) marcar('ERROR', `${r.metodo} /api/public${r.ruta}`, `ruta pública sin declarar: falta "// PUBLICA: <motivo>" encima (línea ${r.linea})`);
    filas.push({ acceso: 'PÚBLICA', metodo: r.metodo, ruta: `/api/public${r.ruta}`, rol: declarada ? declarada[1].trim() : '— sin declarar —' });
  }
}

// ── Informe ──────────────────────────────────────────────────────────────────
console.log(`\nRutas encontradas: ${filas.length}\n`);
const ancho = Math.max(...filas.map(f => f.ruta.length));
for (const f of filas) console.log(`${f.acceso.padEnd(8)} ${f.metodo.padEnd(6)} ${f.ruta.padEnd(ancho)}  ${f.rol}`);

const errores = hallazgos.filter(h => h.nivel === 'ERROR');
const avisos = hallazgos.filter(h => h.nivel === 'AVISO');
console.log(`\n── ERRORES (${errores.length}) ──`);
errores.forEach(h => console.log(`ERROR  ${h.ruta}\n         ${h.msg}`));
console.log(`\n── AVISOS (${avisos.length}) ──`);
avisos.forEach(h => console.log(`AVISO  ${h.ruta}\n         ${h.msg}`));
console.log(`\n${errores.length ? 'FALLA' : 'OK'}: ${errores.length} errores, ${avisos.length} avisos.\n`);
process.exit(errores.length ? 1 : 0);
