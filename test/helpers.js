// Arnés de pruebas de aislamiento entre barberías.
// Lanza el servidor real como proceso aparte, apuntando a la base DESCARTABLE
// del docker-compose.test.yml, y la siembra con dos barberías (A y B).
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const DB = { host: '127.0.0.1', port: 3308, user: 'root', password: 'test-root', database: 'barberia_test' };
const PORT = 3999;
const JWT_SECRET = 'secreto-solo-para-pruebas';
// Clave de prueba (no sirve para nada real).
const CLAVE_CIFRADO = 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0';
const PASSWORD = 'Prueba1234!';

// Las pruebas TRUNCAN todas las tablas: nunca deben poder correr contra otra base.
function exigirBaseDePrueba() {
  if (DB.host !== '127.0.0.1' || !DB.database.endsWith('_test')) {
    throw new Error('Las pruebas solo pueden correr contra una base local terminada en _test.');
  }
}

let servidor = null;
let logs = '';

// El servidor carga el .env de su carpeta con dotenv, que NO pisa variables ya definidas. Si ese .env
// tiene credenciales reales (Cloudinary, Resend, Brevo...), las pruebas podrían subir imágenes o mandar
// emails de verdad. Por eso cada variable que aparece en un .env se define vacía: dotenv la respeta.
function neutralizarDotenv(env) {
  try {
    const crudo = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
    for (const linea of crudo.split(/\r?\n/)) {
      const m = linea.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/);
      if (m && !(m[1] in env)) env[m[1]] = '';
    }
  } catch { /* no hay .env: nada que neutralizar */ }
  return env;
}

// Entorno mínimo y explícito: no se hereda nada del shell (ni un SINGLE_TENANT_ID suelto).
function entornoDePrueba() {
  exigirBaseDePrueba();
  return neutralizarDotenv({
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    PORT: String(PORT),
    DB_HOST: DB.host, DB_PORT: String(DB.port), DB_USER: DB.user, DB_PASSWORD: DB.password, DB_NAME: DB.database,
    JWT_SECRET,
    CLAVE_CIFRADO,
    NODE_ENV: 'test',
    TZ: 'UTC', // como en la nube: los arreglos de fechas no pueden depender de la zona del servidor
    WHATSAPP_ENABLED: 'false',
    LIMITE_RESERVAS_POR_MIN: '1000', // los límites reales se prueban aparte; acá no deben cortar otras pruebas
    LIMITE_LOGIN: '1000',
  });
}

async function iniciarServidor() {
  const env = entornoDePrueba();
  servidor = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  servidor.stdout.on('data', d => { logs += d; });
  servidor.stderr.on('data', d => { logs += d; });

  for (let i = 0; i < 60; i++) {
    try {
      const r = await pedir({ path: '/' });
      if (r.status > 0) return;
    } catch { /* todavía no escucha */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error('El servidor no arrancó en 30 s. Logs:\n' + logs);
}

function detenerServidor() {
  if (servidor) servidor.kill();
}

function pedir({ method = 'GET', path: ruta, token, body, host, headers: extra, timeoutMs, puerto = PORT, cuerpoCrudo }) {
  return new Promise((resolve, reject) => {
    const data = cuerpoCrudo !== undefined ? cuerpoCrudo : (body !== undefined ? JSON.stringify(body) : null);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (host) headers.Host = host;
    if (extra) Object.assign(headers, extra);
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request({ host: '127.0.0.1', port: puerto, method, path: ruta, headers }, res => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(raw); } catch { /* no era JSON */ }
        resolve({ status: res.statusCode, body: json, raw, headers: res.headers });
      });
    });
    if (timeoutMs) req.setTimeout(timeoutMs, () => req.destroy(new Error('sin respuesta')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function conectar() {
  exigirBaseDePrueba();
  // timezone Z: las fechas se escriben en UTC, igual que lo hace el servidor (Sequelize).
  return mysql.createConnection({ ...DB, timezone: 'Z' });
}

async function insertar(cn, sql, params) {
  const [r] = await cn.query(sql, params);
  return r.insertId;
}

// Crea una barbería completa. La marca (ZZALFA / ZZBETA) va en todos los textos
// para detectar fugas: si la marca de B aparece en una respuesta de A, hay fuga.
async function crearBarberia(cn, { clave, hash }) {
  const marca = `ZZ${clave.toUpperCase()}`;
  const idbarberia = await insertar(cn,
    'INSERT INTO empresa_barberia (nombre_negocio, subdominio, whatsapp_negocio) VALUES (?,?,?)',
    [`Barberia ${marca}`, clave.toLowerCase(), '5493700000000']);

  const persona = (nombre, correo, tel = '3704000000') => insertar(cn,
    'INSERT INTO persona (idbarberia, nombre_completo, telefono, correo_electronico) VALUES (?,?,?,?)',
    [idbarberia, `${nombre} ${marca}`, tel, correo]);

  const crearUsuario = async (rol, nombre) => {
    const correo = `${rol}@${clave.toLowerCase()}.test`;
    const idpersona = await persona(nombre, correo);
    const idusuario = await insertar(cn,
      'INSERT INTO usuario (idpersona, rol, password_hash, comision_porcentaje, puede_cobrar, puede_vender) VALUES (?,?,?,?,1,1)',
      [idpersona, rol, hash, 40]);
    return { idusuario, correo };
  };
  const admin = await crearUsuario('admin', 'Admin');
  const barbero = await crearUsuario('barbero', 'Barbero');
  await insertar(cn,
    'INSERT INTO horarios_atencion (idusuario_barbero, dia_semana, hora_apertura, hora_cierre) VALUES (?,?,?,?)',
    [barbero.idusuario, 1, '09:00:00', '18:00:00']);

  const idpersonaCli = await persona('Cliente', `cliente@${clave.toLowerCase()}.test`, '3704111111');
  const cliente = await insertar(cn, 'INSERT INTO cliente (idpersona) VALUES (?)', [idpersonaCli]);
  const servicio = await insertar(cn,
    'INSERT INTO servicio (idbarberia, nombre_servicio, precio, duracion_minutos) VALUES (?,?,?,?)',
    [idbarberia, `Corte ${marca}`, 8000, 40]);
  const producto = await insertar(cn,
    'INSERT INTO producto (idbarberia, nombre_producto, categoria, precio_venta, stock_actual) VALUES (?,?,?,?,?)',
    [idbarberia, `Cera ${marca}`, 'Cuidado', 3000, 10]);
  const turno = await insertar(cn,
    `INSERT INTO agenda_turno (idbarberia, idcliente, idusuario_barbero, idservicio, fecha, hora_inicio, hora_fin, estado, tipo_alta)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [idbarberia, cliente, barbero.idusuario, servicio, '2030-03-04', '11:00:00', '11:40:00', 'confirmado', 'web']);
  await insertar(cn,
    'INSERT INTO pago_servicio (idbarberia, idagenda, monto_pago, monto_comision_barbero, metodo_pago) VALUES (?,?,?,?,?)',
    [idbarberia, turno, 8000, 3200, 'efectivo']);
  const gasto = await insertar(cn,
    'INSERT INTO gastos (idbarberia, descripcion, monto, categoria_gasto, fecha_gasto) VALUES (?,?,?,?,?)',
    [idbarberia, `Gasto ${marca}`, 1500, 'Insumos', '2030-03-04']);

  return { clave, marca, idbarberia, subdominio: clave.toLowerCase(), admin, barbero, cliente, servicio, producto, turno, gasto };
}

async function sembrar(cn) {
  await cn.query('SET FOREIGN_KEY_CHECKS = 0');
  const [tablas] = await cn.query('SHOW TABLES');
  for (const fila of tablas) {
    const tabla = Object.values(fila)[0];
    if (tabla !== 'schema_migrations') await cn.query(`TRUNCATE TABLE \`${tabla}\``);
  }
  await cn.query('SET FOREIGN_KEY_CHECKS = 1');

  const hash = await bcrypt.hash(PASSWORD, 4);
  const A = await crearBarberia(cn, { clave: 'alfa', hash });
  const B = await crearBarberia(cn, { clave: 'beta', hash });
  return { A, B };
}

async function login(correo) {
  const r = await pedir({ method: 'POST', path: '/api/public/login', body: { correo_electronico: correo, password: PASSWORD } });
  if (r.status !== 200) throw new Error(`Login de ${correo} falló: ${r.status} ${r.raw}`);
  return r.body.token;
}

async function tokens({ A, B }) {
  A.adminToken = await login(A.admin.correo);
  A.barberoToken = await login(A.barbero.correo);
  B.adminToken = await login(B.admin.correo);
  B.barberoToken = await login(B.barbero.correo);
}

// Foto de todos los datos de una barbería: si un ataque cambia algo, la foto cambia
// (las columnas updatedAt se actualizan solas ante cualquier modificación).
async function fotoDe(cn, idbarberia) {
  const foto = {};
  const consultas = {
    empresa: ['SELECT * FROM empresa_barberia WHERE idbarberia = ?'],
    persona: ['SELECT * FROM persona WHERE idbarberia = ? ORDER BY idpersona'],
    usuario: ['SELECT u.* FROM usuario u JOIN persona p ON p.idpersona = u.idpersona WHERE p.idbarberia = ? ORDER BY u.idusuario'],
    cliente: ['SELECT c.* FROM cliente c JOIN persona p ON p.idpersona = c.idpersona WHERE p.idbarberia = ? ORDER BY c.idcliente'],
    horarios: ['SELECT h.* FROM horarios_atencion h JOIN usuario u ON u.idusuario = h.idusuario_barbero JOIN persona p ON p.idpersona = u.idpersona WHERE p.idbarberia = ? ORDER BY h.idhorario'],
    servicio: ['SELECT * FROM servicio WHERE idbarberia = ? ORDER BY idservicio'],
    producto: ['SELECT * FROM producto WHERE idbarberia = ? ORDER BY idproducto'],
    turnos: ['SELECT * FROM agenda_turno WHERE idbarberia = ? ORDER BY idagenda'],
    pagos: ['SELECT * FROM pago_servicio WHERE idbarberia = ? ORDER BY idpago'],
    ventas: ['SELECT * FROM venta_producto WHERE idbarberia = ? ORDER BY idventa'],
    gastos: ['SELECT * FROM gastos WHERE idbarberia = ? ORDER BY idgasto'],
  };
  for (const [nombre, [sql]] of Object.entries(consultas)) {
    const [filas] = await cn.query(sql, [idbarberia]);
    foto[nombre] = JSON.parse(JSON.stringify(filas));
  }
  return foto;
}

module.exports = {
  PORT,
  CLAVE_CIFRADO,
  entornoDePrueba,
  DB, PASSWORD, iniciarServidor, detenerServidor, pedir, conectar, insertar, sembrar, tokens, fotoDe,
  verLogs: () => logs,
};
