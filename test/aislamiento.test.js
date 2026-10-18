// Pruebas de seguridad de la producción de AR Studio (una sola barbería con el código multi-tenant heredado).
//   docker compose -f ../docker-compose.test.yml up -d --wait
//   npm run test:aislamiento
const { describe, it, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const bcrypt = require('bcryptjs');
const H = require('./helpers');

const DENEGADO = [403, 404];
const HOST_DE = v => `${v.subdominio}.test.local`; // el middleware toma el subdominio del Host

// A y B son objetos fijos: la siembra repite los mismos ids, así que los tokens siguen valiendo.
const A = {};
const B = {};
const TOKENS = {};
let cn;

async function reseed() {
  const s = await H.sembrar(cn);
  Object.assign(A, s.A, TOKENS.A);
  Object.assign(B, s.B, TOKENS.B);
}

const llamar = (token, method, path, body, host) => H.pedir({ method, path, token, body, host });

before(async () => {
  cn = await H.conectar();
  // El servidor arranca primero: migra la base vacía (así también se prueba una instalación nueva).
  await H.iniciarServidor();
  const s = await H.sembrar(cn);
  Object.assign(A, s.A);
  Object.assign(B, s.B);
  await H.tokens({ A, B });
  TOKENS.A = { adminToken: A.adminToken, barberoToken: A.barberoToken };
  TOKENS.B = { adminToken: B.adminToken, barberoToken: B.barberoToken };
});

beforeEach(reseed);

after(async () => {
  H.detenerServidor();
  if (cn) await cn.end();
});

// ─────────────────────────────────────────────────────────────────────────────
describe('0. Controles básicos de sesión y rol', () => {
  for (const [m, p] of [['GET', '/api/servicios'], ['GET', '/api/turnos'], ['GET', '/api/reportes'], ['POST', '/api/turnos'], ['PUT', '/api/mi-barberia']]) {
    it(`sin sesión: ${m} ${p} -> 401`, async () => {
      const r = await llamar(null, m, p, {});
      assert.equal(r.status, 401, r.raw);
    });
  }

  it('token inválido -> 401', async () => {
    const r = await llamar('esto.no.es.un.token', 'GET', '/api/servicios');
    assert.equal(r.status, 401, r.raw);
  });

  for (const [m, p, body] of [
    ['POST', '/api/servicios', { nombre_servicio: 'x', precio: 1, duracion_minutos: 30 }],
    ['POST', '/api/productos', { nombre_producto: 'x', categoria: 'x', precio_venta: 1 }],
    ['PUT', '/api/mi-barberia', { nombre_negocio: 'hack' }],
    ['GET', '/api/reportes'],
    ['GET', '/api/comisiones'],
    ['GET', '/api/gastos'],
    ['POST', '/api/barberos', { nombre_completo: 'x', telefono: '1', correo_electronico: 'x@x.test', password: 'Abcd1234!' }],
    ['DELETE', '/api/gastos/1'],
  ]) {
    it(`barbero en ruta de admin: ${m} ${p} -> 403`, async () => {
      const r = await llamar(A.barberoToken, m, p, body);
      assert.equal(r.status, 403, r.raw);
    });
  }

  it('control: el admin de A ve sus propios datos', async () => {
    for (const [p, texto] of [['/api/servicios', A.marca], ['/api/clientes', A.marca], ['/api/gastos', A.marca], ['/api/turnos?fecha=2030-03-04', A.marca]]) {
      const r = await llamar(A.adminToken, 'GET', p);
      assert.equal(r.status, 200, `${p}: ${r.raw.slice(0, 200)}`);
      assert.ok(r.raw.includes(texto), `${p} no devolvió datos propios`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('1. Asignación masiva: idbarberia en el body no mueve registros', () => {
  it('PUT /api/servicios/:id con idbarberia de B', async () => {
    const r = await llamar(A.adminToken, 'PUT', `/api/servicios/${A.servicio}`, { nombre_servicio: `Editado ${A.marca}`, idbarberia: B.idbarberia });
    const [[fila]] = await cn.query('SELECT idbarberia FROM servicio WHERE idservicio = ?', [A.servicio]);
    assert.equal(fila.idbarberia, A.idbarberia, `el servicio de A pasó a la barbería ${fila.idbarberia} (status ${r.status})`);
  });

  it('PUT /api/productos/:id con idbarberia de B', async () => {
    const r = await llamar(A.adminToken, 'PUT', `/api/productos/${A.producto}`, { nombre_producto: `Editado ${A.marca}`, idbarberia: B.idbarberia });
    const [[fila]] = await cn.query('SELECT idbarberia FROM producto WHERE idproducto = ?', [A.producto]);
    assert.equal(fila.idbarberia, A.idbarberia, `el producto de A pasó a la barbería ${fila.idbarberia} (status ${r.status})`);
  });

  it('PUT /api/servicios/:id no permite cambiar el id propio', async () => {
    await llamar(A.adminToken, 'PUT', `/api/servicios/${A.servicio}`, { nombre_servicio: `Editado ${A.marca}`, idservicio: 99999 });
    const [[fila]] = await cn.query('SELECT COUNT(*) AS n FROM servicio WHERE idservicio = 99999');
    assert.equal(fila.n, 0, 'se pudo reescribir la clave primaria');
  });

  it('control: la edición legítima sigue funcionando', async () => {
    const r = await llamar(A.adminToken, 'PUT', `/api/servicios/${A.servicio}`, { nombre_servicio: `Nuevo ${A.marca}`, precio: 9000 });
    assert.equal(r.status, 200, r.raw);
    const [[fila]] = await cn.query('SELECT nombre_servicio, precio FROM servicio WHERE idservicio = ?', [A.servicio]);
    assert.equal(fila.nombre_servicio, `Nuevo ${A.marca}`);
    assert.equal(Number(fila.precio), 9000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('1b. Validación de datos que vienen del cliente (dinero, estado, barbero ajeno)', () => {
  const stockDe = async id => (await cn.query('SELECT stock_actual FROM producto WHERE idproducto = ?', [id]))[0][0].stock_actual;

  it('POST /api/ventas con cantidad negativa -> 400 y el stock no cambia', async () => {
    const r = await llamar(A.adminToken, 'POST', '/api/ventas', { idproducto: A.producto, cantidad: -5, metodo_pago: 'efectivo' });
    assert.equal(r.status, 400, `devolvió ${r.status}: ${r.raw.slice(0, 160)}`);
    assert.equal(await stockDe(A.producto), 10, 'el stock cambió');
  });

  it('POST /api/ventas con cantidad decimal -> 400', async () => {
    const r = await llamar(A.adminToken, 'POST', '/api/ventas', { idproducto: A.producto, cantidad: 1.5, metodo_pago: 'efectivo' });
    assert.equal(r.status, 400, `devolvió ${r.status}: ${r.raw.slice(0, 160)}`);
  });

  it('control: una venta legítima descuenta el stock', async () => {
    const r = await llamar(A.adminToken, 'POST', '/api/ventas', { idproducto: A.producto, cantidad: 2, metodo_pago: 'efectivo' });
    assert.equal(r.status, 201, r.raw.slice(0, 200));
    assert.equal(await stockDe(A.producto), 8);
  });

  it('POST /api/gastos con un barbero de B -> 404 y no se crea el gasto', async () => {
    const r = await llamar(A.adminToken, 'POST', '/api/gastos', { descripcion: 'x', monto: 10, categoria_gasto: 'x', fecha_gasto: '2030-01-01', idusuario_barbero: B.barbero.idusuario });
    assert.equal(r.status, 404, `devolvió ${r.status}: ${r.raw.slice(0, 160)}`);
    const [[f]] = await cn.query("SELECT COUNT(*) AS n FROM gastos WHERE idbarberia = ? AND descripcion = 'x'", [A.idbarberia]);
    assert.equal(f.n, 0);
  });

  it('PUT /api/gastos/:id con un barbero de B -> 404', async () => {
    const r = await llamar(A.adminToken, 'PUT', `/api/gastos/${A.gasto}`, { descripcion: 'x', monto: 10, categoria_gasto: 'x', fecha_gasto: '2030-01-01', idusuario_barbero: B.barbero.idusuario });
    assert.equal(r.status, 404, `devolvió ${r.status}: ${r.raw.slice(0, 160)}`);
  });

  it('PATCH /api/barberos/:id/estado con un valor inventado -> 400', async () => {
    const r = await llamar(A.adminToken, 'PATCH', `/api/barberos/${A.barbero.idusuario}/estado`, { estado: 'borrado' });
    assert.equal(r.status, 400, `devolvió ${r.status}: ${r.raw.slice(0, 160)}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('2. Crear turno con ids de otra barbería', () => {
  const base = { hora_inicio: '15:00', hora_fin: '15:40', nombre_cliente: 'Cliente de paso', telefono_cliente: '3704222222' };
  const turnosEn = async fecha => {
    const [[f]] = await cn.query('SELECT COUNT(*) AS n FROM agenda_turno WHERE idbarberia = ? AND fecha = ?', [A.idbarberia, fecha]);
    return f.n;
  };

  const casos = [
    ['idservicio de B', '2030-03-05', () => ({ idservicio: B.servicio, idusuario_barbero: A.barbero.idusuario })],
    ['idusuario_barbero de B', '2030-03-06', () => ({ idservicio: A.servicio, idusuario_barbero: B.barbero.idusuario })],
    ['idcliente de B', '2030-03-07', () => ({ idservicio: A.servicio, idusuario_barbero: A.barbero.idusuario, idcliente: B.cliente, nombre_cliente: undefined })],
    ['servicios_ids con un servicio de B', '2030-03-08', () => ({ idservicio: A.servicio, idusuario_barbero: A.barbero.idusuario, servicios_ids: [A.servicio, B.servicio] })],
  ];

  for (const [nombre, fecha, ids] of casos) {
    it(`rechaza ${nombre}`, async () => {
      const r = await llamar(A.adminToken, 'POST', '/api/turnos', { ...base, fecha, ...ids() });
      assert.ok([400, 403, 404].includes(r.status), `esperaba 400/403/404 y devolvió ${r.status}: ${r.raw.slice(0, 200)}`);
      assert.equal(await turnosEn(fecha), 0, 'igual se creó el turno');
      const agenda = await llamar(A.adminToken, 'GET', `/api/turnos?fecha=${fecha}`);
      assert.ok(!agenda.raw.includes(B.marca), 'la agenda de A muestra datos de B');
    });
  }

  it('control: crear un turno con datos propios -> 201', async () => {
    const fecha = '2030-03-12';
    const r = await llamar(A.adminToken, 'POST', '/api/turnos', { ...base, fecha, idservicio: A.servicio, idusuario_barbero: A.barbero.idusuario });
    assert.equal(r.status, 201, r.raw.slice(0, 300));
    assert.equal(await turnosEn(fecha), 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('3. El tenant efectivo es el del token (middleware)', () => {
  it('token de A con el host de B no puede leer la config de B -> 403', async () => {
    const r = await llamar(A.adminToken, 'GET', '/api/mi-barberia', undefined, HOST_DE(B));
    assert.equal(r.status, 403, `devolvió ${r.status}: ${r.raw.slice(0, 160)}`);
    assert.ok(!r.raw.includes(B.marca), 'se filtró la configuración de B');
  });

  it('token de A con el host de B no puede operar datos de A -> 403', async () => {
    const r = await llamar(A.adminToken, 'GET', '/api/servicios', undefined, HOST_DE(B));
    assert.equal(r.status, 403, `devolvió ${r.status}: ${r.raw.slice(0, 160)}`);
  });

  it('control: token de A con el host de A -> 200', async () => {
    const r = await llamar(A.adminToken, 'GET', '/api/mi-barberia', undefined, HOST_DE(A));
    assert.equal(r.status, 200, r.raw.slice(0, 200));
    assert.ok(r.raw.includes(A.marca));
  });

  it('control: token de A sin host de barbería (dominio propio / localhost) -> 200', async () => {
    const r = await llamar(A.adminToken, 'GET', '/api/mi-barberia');
    assert.equal(r.status, 200, r.raw.slice(0, 200));
    assert.ok(r.raw.includes(A.marca) && !r.raw.includes(B.marca));
  });

  it('A suspendida: su token con el host de B (activa) no la reactiva -> 403', async () => {
    await cn.query("UPDATE empresa_barberia SET estado_cuenta = 'suspendido' WHERE idbarberia = ?", [A.idbarberia]);
    const r = await llamar(A.adminToken, 'GET', '/api/servicios', undefined, HOST_DE(B));
    assert.equal(r.status, 403, `una barbería suspendida siguió operando (status ${r.status})`);
  });

  it('A suspendida: su token con su propio host -> 403 con suspendida:true', async () => {
    await cn.query("UPDATE empresa_barberia SET estado_cuenta = 'suspendido' WHERE idbarberia = ?", [A.idbarberia]);
    const r = await llamar(A.adminToken, 'GET', '/api/servicios', undefined, HOST_DE(A));
    assert.equal(r.status, 403, r.raw);
    assert.equal(r.body?.suspendida, true);
  });

  it('A suspendida no afecta a B', async () => {
    await cn.query("UPDATE empresa_barberia SET estado_cuenta = 'suspendido' WHERE idbarberia = ?", [A.idbarberia]);
    const r = await llamar(B.adminToken, 'GET', '/api/servicios', undefined, HOST_DE(B));
    assert.equal(r.status, 200, r.raw.slice(0, 200));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Ataques por id: el admin de una barbería contra los recursos de la otra.
const dias = [{ dia_semana: 1, hora_apertura: '09:00', hora_cierre: '18:00' }];
const ATAQUES = [
  { m: 'PUT', p: v => `/api/servicios/${v.servicio}`, b: { nombre_servicio: 'hack', precio: 1, duracion_minutos: 30 } },
  { m: 'DELETE', p: v => `/api/servicios/${v.servicio}` },
  { m: 'PUT', p: v => `/api/productos/${v.producto}`, b: { nombre_producto: 'hack', stock_actual: 0 } },
  { m: 'DELETE', p: v => `/api/productos/${v.producto}` },
  { m: 'PUT', p: v => `/api/clientes/${v.cliente}`, b: { nombre_completo: 'hack', telefono: '1' } },
  { m: 'DELETE', p: v => `/api/clientes/${v.cliente}` },
  { m: 'GET', p: v => `/api/clientes/${v.cliente}/turnos`, vacioOk: true },
  { m: 'PATCH', p: v => `/api/turnos/${v.turno}/estado`, b: { estado: 'cancelado' } },
  { m: 'PATCH', p: v => `/api/turnos/${v.turno}/cancelar`, b: {} },
  { m: 'PUT', p: v => `/api/barberos/${v.barbero.idusuario}`, b: { nombre_completo: 'hack' } },
  { m: 'PATCH', p: v => `/api/barberos/${v.barbero.idusuario}/estado`, b: { estado: 'inactivo' } },
  { m: 'PATCH', p: v => `/api/barberos/${v.barbero.idusuario}/password`, b: { password: 'Hackeado123!' } },
  { m: 'PATCH', p: v => `/api/barberos/${v.barbero.idusuario}/rol`, b: { rol: 'admin' } },
  { m: 'DELETE', p: v => `/api/barberos/${v.barbero.idusuario}` },
  { m: 'GET', p: v => `/api/barberos/${v.barbero.idusuario}/horarios` },
  { m: 'PUT', p: v => `/api/barberos/${v.barbero.idusuario}/horarios`, b: dias },
  { m: 'PUT', p: v => `/api/gastos/${v.gasto}`, b: { descripcion: 'hack', monto: 1, categoria_gasto: 'x', fecha_gasto: '2030-01-01' } },
  { m: 'DELETE', p: v => `/api/gastos/${v.gasto}` },
];

for (const [atacante, victima, etiqueta] of [[A, B, 'A contra B'], [B, A, 'B contra A']]) {
  describe(`4. ${etiqueta}: leer, editar y borrar recursos ajenos por id`, () => {
    for (const a of ATAQUES) {
      it(`${a.m} ${a.p({ servicio: ':id', producto: ':id', cliente: ':id', turno: ':id', gasto: ':id', barbero: { idusuario: ':id' } })}`, async () => {
        const antes = await H.fotoDe(cn, victima.idbarberia);
        const r = await llamar(atacante.adminToken, a.m, a.p(victima), a.b);
        const vacio = a.vacioOk && r.status === 200 && Array.isArray(r.body) && r.body.length === 0;
        assert.ok(DENEGADO.includes(r.status) || vacio, `esperaba 403/404 y devolvió ${r.status}: ${r.raw.slice(0, 160)}`);
        assert.deepStrictEqual(await H.fotoDe(cn, victima.idbarberia), antes, 'los datos de la barbería víctima cambiaron');
      });
    }
  });

  describe(`5. ${etiqueta}: los listados no mezclan datos`, () => {
    const listados = [
      '/api/servicios', '/api/servicios/stats', '/api/productos', '/api/clientes', '/api/clientes/inactivos',
      '/api/turnos', '/api/turnos/mis-turnos', '/api/gastos', '/api/pagos', '/api/pagos/turnos-pendientes',
      '/api/pagos/resumen', '/api/ventas', '/api/barberos', '/api/reportes', '/api/comisiones', '/api/retiros',
      '/api/notificaciones', '/api/carrusel', '/api/galeria', '/api/mi-perfil', '/api/mi-horario',
    ];
    for (const p of listados) {
      it(`GET ${p}`, async () => {
        const r = await llamar(atacante.adminToken, 'GET', p);
        assert.ok(r.status < 500, `error del servidor ${r.status}: ${r.raw.slice(0, 200)}`);
        assert.ok(!r.raw.includes(victima.marca), `la respuesta contiene datos de ${victima.marca}`);
      });
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
describe('6. El token se revalida contra la base en cada pedido', () => {
  it('un barbero desactivado pierde el acceso aunque su token no haya vencido -> 401', async () => {
    await cn.query("UPDATE usuario SET estado = 'inactivo' WHERE idusuario = ?", [A.barbero.idusuario]);
    const r = await llamar(A.barberoToken, 'GET', '/api/turnos/mis-turnos');
    assert.equal(r.status, 401, `siguió operando (status ${r.status})`);
  });

  it('un admin degradado a barbero pierde los permisos de admin al instante -> 403', async () => {
    await cn.query("UPDATE usuario SET rol = 'barbero' WHERE idusuario = ?", [A.admin.idusuario]);
    const r = await llamar(A.adminToken, 'POST', '/api/servicios', { nombre_servicio: 'x', precio: 1, duracion_minutos: 30 });
    assert.equal(r.status, 403, `siguió siendo admin (status ${r.status})`);
  });

  it('un usuario eliminado no puede seguir usando su token -> 401', async () => {
    await cn.query('SET FOREIGN_KEY_CHECKS = 0');
    await cn.query('DELETE FROM usuario WHERE idusuario = ?', [A.barbero.idusuario]);
    await cn.query('SET FOREIGN_KEY_CHECKS = 1');
    const r = await llamar(A.barberoToken, 'GET', '/api/turnos/mis-turnos');
    assert.equal(r.status, 401, `siguió operando (status ${r.status})`);
  });

  it('control: un usuario activo sigue entrando', async () => {
    const r = await llamar(A.barberoToken, 'GET', '/api/turnos/mis-turnos');
    assert.equal(r.status, 200, r.raw.slice(0, 200));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('7. Login: el usuario se busca dentro de la barbería', () => {
  const CORREO = 'comun@test.test';
  const CLAVE_A = 'ClaveDeAlfa123!';
  const CLAVE_B = 'ClaveDeBeta123!';

  // El mismo correo existe en las dos barberías, con contraseñas distintas.
  beforeEach(async () => {
    for (const [v, clave] of [[A, CLAVE_A], [B, CLAVE_B]]) {
      const [p] = await cn.query('INSERT INTO persona (idbarberia, nombre_completo, telefono, correo_electronico) VALUES (?,?,?,?)', [v.idbarberia, `Comun ${v.marca}`, '3704000001', CORREO]);
      await cn.query('INSERT INTO usuario (idpersona, rol, password_hash) VALUES (?,?,?)', [p.insertId, 'barbero', bcrypt.hashSync(clave, 4)]);
    }
  });

  const entrar = (correo, password, subdominio) =>
    H.pedir({ method: 'POST', path: '/api/public/login', body: { correo_electronico: correo, password }, headers: subdominio ? { 'X-Tenant-Subdomain': subdominio } : undefined });

  it('con el subdominio de A y la clave de A entra a A', async () => {
    const r = await entrar(CORREO, CLAVE_A, A.subdominio);
    assert.equal(r.status, 200, r.raw);
    assert.equal(r.body.idbarberia, A.idbarberia);
  });

  it('con el subdominio de B y la clave de B entra a B', async () => {
    const r = await entrar(CORREO, CLAVE_B, B.subdominio);
    assert.equal(r.status, 200, r.raw);
    assert.equal(r.body.idbarberia, B.idbarberia);
  });

  it('con el subdominio de B la clave de A no sirve -> 401', async () => {
    const r = await entrar(CORREO, CLAVE_A, B.subdominio);
    assert.equal(r.status, 401, r.raw);
  });

  it('sin barbería y con el correo repetido -> 400 (no adivina)', async () => {
    const r = await entrar(CORREO, CLAVE_A);
    assert.equal(r.status, 400, r.raw);
  });

  it('sin barbería y con un correo único entra igual (dominio propio / desarrollo)', async () => {
    const r = await entrar(A.admin.correo, H.PASSWORD);
    assert.equal(r.status, 200, r.raw);
    assert.equal(r.body.idbarberia, A.idbarberia);
  });

  it('un subdominio que no es de ninguna barbería no bloquea el login', async () => {
    const r = await entrar(A.admin.correo, H.PASSWORD, 'dominio-propio');
    assert.equal(r.status, 200, r.raw);
  });

  it('contraseña incorrecta y correo inexistente dan el mismo 401', async () => {
    const mala = await entrar(A.admin.correo, 'incorrecta', A.subdominio);
    const nada = await entrar('nadie@test.test', 'incorrecta', A.subdominio);
    assert.equal(mala.status, 401);
    assert.equal(nada.status, 401);
    assert.deepEqual(mala.body, nada.body);
  });

  it('un usuario desactivado no puede iniciar sesión -> 401', async () => {
    await cn.query("UPDATE usuario SET estado = 'inactivo' WHERE idusuario = ?", [A.barbero.idusuario]);
    const r = await entrar(A.barbero.correo, H.PASSWORD, A.subdominio);
    assert.equal(r.status, 401, r.raw);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Recuperar y resetear contraseña comparten un cupo de 5 pedidos cada 15 minutos por IP:
// los de reseteo van primero (4) y el de límite al final.
describe('8. Restablecer contraseña', () => {
  const hash = t => crypto.createHash('sha256').update(t).digest('hex');
  const sembrarToken = (guardado, expira) =>
    cn.query('UPDATE usuario SET reset_token = ?, reset_token_expira = ? WHERE idusuario = ?', [guardado, expira, A.admin.idusuario]);
  const resetear = (token, password_nueva) => llamar(null, 'POST', '/api/public/resetear-password', { token, password_nueva });
  const enUnaHora = () => new Date(Date.now() + 60 * 60 * 1000);

  it('un token válido cambia la contraseña y no se puede usar dos veces', async () => {
    await sembrarToken(hash('token-de-prueba'), enUnaHora());
    const primero = await resetear('token-de-prueba', 'NuevaClave123!');
    assert.equal(primero.status, 200, primero.raw);
    const segundo = await resetear('token-de-prueba', 'OtraClave12345!');
    assert.equal(segundo.status, 400, 'el token se pudo usar dos veces');
    const entra = await H.pedir({ method: 'POST', path: '/api/public/login', body: { correo_electronico: A.admin.correo, password: 'NuevaClave123!' } });
    assert.equal(entra.status, 200, 'no entra con la contraseña nueva');
  });

  it('un token vencido -> 400', async () => {
    await sembrarToken(hash('token-vencido'), new Date(Date.now() - 60 * 1000));
    const r = await resetear('token-vencido', 'NuevaClave123!');
    assert.equal(r.status, 400, r.raw);
  });

  it('el token guardado en claro no sirve: en la base solo vive el hash -> 400', async () => {
    await sembrarToken('token-en-claro', enUnaHora());
    const r = await resetear('token-en-claro', 'NuevaClave123!');
    assert.equal(r.status, 400, `aceptó el valor crudo de la base (status ${r.status})`);
  });

  it('una contraseña de menos de 8 caracteres -> 400', async () => {
    await sembrarToken(hash('token-corto'), enUnaHora());
    const r = await resetear('token-corto', 'corta');
    assert.equal(r.status, 400, r.raw);
  });

  it('pasado el cupo de intentos responde 429', async () => {
    const estados = [];
    for (let i = 0; i < 8; i++) {
      const r = await llamar(null, 'POST', '/api/public/recuperar-password', { correo_electronico: 'nadie@alfa.test' });
      estados.push(r.status);
    }
    assert.ok(estados.includes(429), `nunca se limitó: ${estados.join(', ')}`);
    assert.ok(estados.filter(s => s !== 429).every(s => s === 200), `respuestas inesperadas: ${estados.join(', ')}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// El servidor de prueba corre en UTC, como en la nube.
describe('9. El día argentino no se corre en reportes ni cobros', () => {
  const pago = (idbarberia, idagenda, monto, fechaUtc) => cn.query(
    'INSERT INTO pago_servicio (idbarberia, idagenda, monto_pago, monto_comision_barbero, metodo_pago, fecha_pago) VALUES (?,?,?,?,?,?)',
    [idbarberia, idagenda, monto, 1, 'efectivo', fechaUtc]);

  it('un cobro de las 22:30 argentinas aparece en SU día, no en el siguiente', async () => {
    // 2030-03-05 01:30 UTC = 2030-03-04 22:30 en Argentina
    await pago(A.idbarberia, A.turno, 12345, '2030-03-05 01:30:00');
    const suDia = await llamar(A.adminToken, 'GET', '/api/pagos?desde=2030-03-04&hasta=2030-03-04');
    assert.equal(suDia.status, 200, suDia.raw.slice(0, 200));
    assert.ok(suDia.raw.includes('12345'), 'el cobro de las 22:30 no apareció en su día');
    const diaSiguiente = await llamar(A.adminToken, 'GET', '/api/pagos?desde=2030-03-05&hasta=2030-03-05');
    assert.ok(!diaSiguiente.raw.includes('12345'), 'el cobro apareció en el día siguiente');
  });

  it('un cobro de las 00:30 argentinas ya es del día siguiente', async () => {
    // 2030-03-05 03:30 UTC = 2030-03-05 00:30 en Argentina
    await pago(A.idbarberia, A.turno, 54321, '2030-03-05 03:30:00');
    const diaAnterior = await llamar(A.adminToken, 'GET', '/api/pagos?desde=2030-03-04&hasta=2030-03-04');
    assert.ok(!diaAnterior.raw.includes('54321'), 'el cobro de las 00:30 cayó en el día anterior');
    const suDia = await llamar(A.adminToken, 'GET', '/api/pagos?desde=2030-03-05&hasta=2030-03-05');
    assert.ok(suDia.raw.includes('54321'), 'el cobro de las 00:30 no apareció en su día');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2030-03-04 es lunes: el barbero sembrado atiende de 09:00 a 18:00 y duran 40 min los servicios.
describe('10. Reserva pública: horarios reales y sin doble reserva', () => {
  const DIA = '2030-03-04';
  const reservar = (extra = {}, i = 0) => H.pedir({
    method: 'POST',
    path: '/api/public/reserva',
    body: {
      subdominio: A.subdominio, idservicio: A.servicio, idusuario_barbero: A.barbero.idusuario,
      fecha: DIA, hora_inicio: '09:00', nombre_cliente: `Cliente ${i}`, telefono_cliente: `37040010${String(i).padStart(2, '0')}`,
      ...extra,
    },
  });
  const ocupados = async (hora = '09:00:00') => {
    const [[f]] = await cn.query(
      "SELECT COUNT(*) AS n FROM agenda_turno WHERE idbarberia = ? AND fecha = ? AND hora_inicio = ? AND estado IN ('pendiente','confirmado')",
      [A.idbarberia, DIA, hora]);
    return f.n;
  };

  it('control: una reserva en un horario real -> 201', async () => {
    const r = await reservar();
    assert.equal(r.status, 201, r.raw.slice(0, 200));
    assert.equal(await ocupados(), 1);
  });

  it('8 pedidos simultáneos al mismo horario: se crea uno solo', async () => {
    const respuestas = await Promise.all(Array.from({ length: 8 }, (_, i) => reservar({}, i)));
    const estados = respuestas.map(r => r.status);
    assert.equal(await ocupados(), 1, `se reservó el mismo horario ${await ocupados()} veces (respuestas: ${estados.join(', ')})`);
    assert.equal(estados.filter(s => s === 201).length, 1, `respuestas: ${estados.join(', ')}`);
    assert.ok(estados.filter(s => s !== 201).every(s => s === 409), `las demás debían ser 409: ${estados.join(', ')}`);
  });

  for (const [nombre, extra] of [
    ['de madrugada, fuera del horario de atención', { hora_inicio: '03:00' }],
    ['en un horario que no coincide con los ofrecidos', { hora_inicio: '09:17' }],
    ['un día en el que el barbero no atiende (martes)', { fecha: '2030-03-05' }],
    ['en una fecha que ya pasó', { fecha: '2020-01-06' }],
    ['con una fecha inválida', { fecha: 'mañana' }],
    ['con una hora inválida', { hora_inicio: '25:99' }],
  ]) {
    it(`rechaza una reserva ${nombre} -> 400`, async () => {
      const r = await reservar(extra);
      assert.equal(r.status, 400, `devolvió ${r.status}: ${r.raw.slice(0, 160)}`);
      const [[f]] = await cn.query('SELECT COUNT(*) AS n FROM agenda_turno WHERE idbarberia = ? AND fecha <> ?', [A.idbarberia, '2030-03-04']);
      assert.equal(f.n, 0, 'igual se creó el turno');
    });
  }

  it('rechaza un barbero de otra barbería -> 404', async () => {
    const r = await reservar({ idusuario_barbero: B.barbero.idusuario });
    assert.equal(r.status, 404, r.raw.slice(0, 160));
  });

  it('GET /disponibilidad con el barbero de otra barbería -> 404', async () => {
    const r = await H.pedir({ path: `/api/public/disponibilidad?subdominio=${A.subdominio}&barbero_id=${B.barbero.idusuario}&fecha=${DIA}&idservicio=${A.servicio}` });
    assert.equal(r.status, 404, `devolvió ${r.status}: ${r.raw.slice(0, 160)}`);
  });

  it('control: GET /disponibilidad con un barbero propio ofrece horarios', async () => {
    const r = await H.pedir({ path: `/api/public/disponibilidad?subdominio=${A.subdominio}&barbero_id=${A.barbero.idusuario}&fecha=${DIA}&idservicio=${A.servicio}` });
    assert.equal(r.status, 200, r.raw.slice(0, 160));
    assert.ok(r.body.slots.includes('09:00'), `slots: ${r.body.slots.join(',')}`);
  });
});

describe('11. Turnos cargados por el admin: tampoco se pisan', () => {
  it('8 altas simultáneas del mismo horario: se crea una sola', async () => {
    const alta = i => llamar(A.adminToken, 'POST', '/api/turnos', {
      idservicio: A.servicio, idusuario_barbero: A.barbero.idusuario, fecha: '2030-03-04',
      hora_inicio: '16:00', hora_fin: '16:40', nombre_cliente: `Paso ${i}`, telefono_cliente: '3704005555',
    });
    const estados = (await Promise.all(Array.from({ length: 8 }, (_, i) => alta(i)))).map(r => r.status);
    const [[f]] = await cn.query("SELECT COUNT(*) AS n FROM agenda_turno WHERE idbarberia = ? AND fecha = '2030-03-04' AND hora_inicio = '16:00:00'", [A.idbarberia]);
    assert.equal(f.n, 1, `se creó ${f.n} veces (respuestas: ${estados.join(', ')})`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('12. Pedidos mal formados no agotan las conexiones', () => {
  it('12 reservas con datos faltantes y la API sigue respondiendo', { timeout: 60000 }, async () => {
    const estados = [];
    for (let i = 0; i < 12; i++) {
      const r = await H.pedir({ method: 'POST', path: '/api/public/reserva', body: { subdominio: A.subdominio }, timeoutMs: 4000 }).catch(() => ({ status: 'sin respuesta' }));
      estados.push(r.status);
    }
    assert.ok(estados.every(s => s === 400), `respuestas: ${estados.join(', ')}`);
    const sigue = await H.pedir({ path: `/api/public/barberia?subdominio=${A.subdominio}`, timeoutMs: 4000 }).catch(() => ({ status: 'sin respuesta' }));
    assert.equal(sigue.status, 200, 'la API quedó sin conexiones a la base');
  });

  it('un id con forma de objeto no se interpreta como filtro -> 400', async () => {
    const r = await H.pedir({ method: 'POST', path: '/api/public/reserva', body: { subdominio: A.subdominio, idservicio: { gt: 0 }, idusuario_barbero: A.barbero.idusuario, fecha: '2030-03-04', hora_inicio: '09:00', nombre_cliente: 'x', telefono_cliente: '3704000000' } });
    assert.equal(r.status, 400, `devolvió ${r.status}: ${r.raw.slice(0, 160)}`);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('16. Subida de imágenes', () => {
  const http = require('node:http');
  const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');

  const subir = (ruta, token, { campo = 'imagen', nombre = 'foto.png', tipo = 'image/png', contenido = PNG } = {}) => new Promise((resolve, reject) => {
    const limite = `----prueba${Date.now()}`;
    const cuerpo = Buffer.concat([
      Buffer.from(`--${limite}\r\nContent-Disposition: form-data; name="${campo}"; filename="${nombre}"\r\nContent-Type: ${tipo}\r\n\r\n`),
      contenido,
      Buffer.from(`\r\n--${limite}--\r\n`),
    ]);
    const headers = { 'Content-Type': `multipart/form-data; boundary=${limite}`, 'Content-Length': cuerpo.length };
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request({ host: '127.0.0.1', port: H.PORT, method: 'POST', path: ruta, headers }, res => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => { let body = null; try { body = JSON.parse(raw); } catch { /* no era JSON */ } resolve({ status: res.statusCode, body, raw }); });
    });
    req.on('error', reject);
    req.end(cuerpo);
  });

  for (const [nombre, tipo, archivo] of [['un texto', 'text/plain', 'nota.txt'], ['un SVG (puede llevar scripts)', 'image/svg+xml', 'dibujo.svg'], ['un ejecutable', 'application/x-msdownload', 'virus.exe']]) {
    it(`rechaza ${nombre} antes de subir nada -> 400`, async () => {
      const r = await subir(`/api/servicios/${A.servicio}/imagen`, A.adminToken, { tipo, nombre: archivo });
      assert.equal(r.status, 400, r.raw);
      assert.match(r.body.error, /JPG, PNG o WebP/);
    });
  }

  it('el servicio de otra barbería se rechaza ANTES de subir la imagen -> 404', async () => {
    const r = await subir(`/api/servicios/${B.servicio}/imagen`, A.adminToken);
    assert.equal(r.status, 404, `devolvió ${r.status}: ${r.raw.slice(0, 160)} (si fuera 400/500 ya habría intentado subirla)`);
  });

  it('el barbero de otra barbería se rechaza ANTES de subir la foto -> 404', async () => {
    const r = await subir(`/api/barberos/${B.barbero.idusuario}/foto`, A.adminToken);
    assert.equal(r.status, 404, `devolvió ${r.status}: ${r.raw.slice(0, 160)}`);
  });

  it('sin sesión -> 401 y un barbero en una ruta de admin -> 403', async () => {
    assert.equal((await subir(`/api/servicios/${A.servicio}/imagen`, null)).status, 401);
    assert.equal((await subir(`/api/servicios/${A.servicio}/imagen`, A.barberoToken)).status, 403);
    assert.equal((await subir('/api/carrusel', A.barberoToken, { campo: 'imagenes' })).status, 403);
  });

  it('un error al subir no revela detalles internos de Cloudinary', async () => {
    // el entorno de prueba no tiene credenciales: la subida falla y el cliente solo ve un mensaje genérico
    const r = await subir(`/api/servicios/${A.servicio}/imagen`, A.adminToken);
    assert.equal(r.status, 400, r.raw);
    assert.equal(r.body.error, 'No se pudo subir la imagen.');
    assert.ok(!/cloud|api_key|api_secret|cloudinary/i.test(r.raw), `se filtró un detalle: ${r.raw}`);
  });

  it('el carrusel tiene un tope de imágenes por barbería -> 409 antes de subir', async () => {
    for (let i = 0; i < 12; i++) await cn.query('INSERT INTO imagenes_carrusel (idbarberia, url, orden) VALUES (?,?,?)', [A.idbarberia, `https://res.cloudinary.com/x/image/upload/v1/barberia/${A.idbarberia}/carrusel/f${i}.jpg`, i]);
    const r = await subir('/api/carrusel', A.adminToken, { campo: 'imagenes' });
    assert.equal(r.status, 409, r.raw);
    assert.match(r.body.error, /máximo de 12/);
    const otra = await subir('/api/carrusel', B.adminToken, { campo: 'imagenes' });
    assert.notEqual(otra.status, 409, 'el tope de A afectó a B');
  });

  it('la galería tiene un tope de imágenes por barbería -> 409 antes de subir', async () => {
    for (let i = 0; i < 40; i++) await cn.query("INSERT INTO imagenes_galeria (idbarberia, url_imagen, tipo_seccion) VALUES (?,?,'landing_galeria')", [A.idbarberia, `https://res.cloudinary.com/x/image/upload/v1/barberia/${A.idbarberia}/galeria/f${i}.jpg`]);
    const r = await subir('/api/galeria', A.adminToken, { campo: 'imagenes' });
    assert.equal(r.status, 409, r.raw);
    assert.match(r.body.error, /máximo de 40/);
  });

  it('publicIdDesdeUrl entiende la carpeta por barbería y las carpetas anteriores', () => {
    const { publicIdDesdeUrl } = require('../src/middlewares/uploadMiddleware');
    assert.equal(publicIdDesdeUrl('https://res.cloudinary.com/demo/image/upload/v1712345678/barberia/7/galeria/abc123.jpg'), 'barberia/7/galeria/abc123');
    assert.equal(publicIdDesdeUrl('https://res.cloudinary.com/demo/image/upload/v1/barberia/galeria/xyz.webp'), 'barberia/galeria/xyz');
    assert.equal(publicIdDesdeUrl('https://res.cloudinary.com/demo/image/upload/barberia/logos/l.png'), 'barberia/logos/l');
    assert.equal(publicIdDesdeUrl('no-es-una-url'), null);
    assert.equal(publicIdDesdeUrl(null), null);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('17. Errores y CORS', () => {
  const { spawn } = require('node:child_process');
  const path = require('node:path');

  it('un JSON mal formado -> 400 en JSON, sin trazas internas', async () => {
    const r = await H.pedir({ method: 'POST', path: '/api/public/login', cuerpoCrudo: '{"correo_electronico": ' });
    assert.equal(r.status, 400, r.raw.slice(0, 200));
    assert.ok(r.body?.error, 'la respuesta no era JSON');
    assert.ok(!/\bat\s+\S+\s+\(|node_modules|\.js:\d+/.test(r.raw), `se filtró una traza: ${r.raw.slice(0, 200)}`);
  });

  it('un pedido demasiado grande -> 413 en JSON', async () => {
    const r = await H.pedir({ method: 'POST', path: '/api/public/login', body: { correo_electronico: 'x@x.test', password: 'x'.repeat(300 * 1024) } });
    assert.equal(r.status, 413, r.raw.slice(0, 200));
    assert.ok(r.body?.error);
  });

  it('una ruta que no existe -> 404 en JSON', async () => {
    const r = await H.pedir({ path: '/no-existe' });
    assert.equal(r.status, 404, r.raw.slice(0, 200));
    assert.equal(r.body?.error, 'Ruta no encontrada.');
  });

  it('un origen desconocido -> 403 en JSON (en desarrollo localhost sí se permite)', async () => {
    const mal = await H.pedir({ path: '/api/public/galeria', headers: { Origin: 'https://sitio-malo.example' } });
    assert.equal(mal.status, 403, mal.raw.slice(0, 200));
    assert.equal(mal.body?.error, 'Origen no permitido.');
    const bien = await H.pedir({ path: `/api/public/galeria?subdominio=${A.subdominio}`, headers: { Origin: 'http://localhost:3001' } });
    assert.equal(bien.status, 200, bien.raw.slice(0, 200));
  });

  describe('servidor en modo producción', () => {
    const PUERTO = 3997;
    let proceso;
    const llamarProd = (ruta, origen, metodo = 'GET') => H.pedir({ method: metodo, path: ruta, puerto: PUERTO, headers: origen ? { Origin: origen } : undefined });

    before(async () => {
      proceso = spawn(process.execPath, ['server.js'], {
        cwd: path.join(__dirname, '..'),
        env: {
          ...H.entornoDePrueba(), PORT: String(PUERTO), NODE_ENV: 'production',
          FRONTEND_URL: 'https://app.ejemplo.com',
          ORIGEN_PERMITIDO_REGEX: '^https://[a-z0-9-]+\\.ejemplo\\.com$',
          DOMINIO_BASE: 'barberias.example.org',
        },
        stdio: 'ignore',
      });
      for (let i = 0; i < 60; i++) {
        try { if ((await H.pedir({ path: '/', puerto: PUERTO })).status === 200) return; } catch { /* todavía no escucha */ }
        await new Promise(r => setTimeout(r, 500));
      }
      throw new Error('el servidor en modo producción no arrancó');
    });
    after(() => { if (proceso) proceso.kill(); });

    it('el origen configurado en FRONTEND_URL se permite y se devuelve en la cabecera', async () => {
      const r = await llamarProd(`/api/public/galeria?subdominio=${A.subdominio}`, 'https://app.ejemplo.com');
      assert.equal(r.status, 200, r.raw.slice(0, 160));
      assert.equal(r.headers['access-control-allow-origin'], 'https://app.ejemplo.com');
    });

    it('un subdominio que cumple la expresión permitida se acepta', async () => {
      const r = await llamarProd(`/api/public/galeria?subdominio=${A.subdominio}`, 'https://mi-barberia.ejemplo.com');
      assert.equal(r.status, 200, r.raw.slice(0, 160));
    });

    for (const origen of ['https://ejemplo.com.atacante.com', 'https://atacante.com/https://x.ejemplo.com', 'http://localhost:3001', 'https://sitio-malo.example']) {
      it(`rechaza ${origen} -> 403`, async () => {
        const r = await llamarProd('/api/public/galeria', origen);
        assert.equal(r.status, 403, r.raw.slice(0, 160));
        assert.equal(r.headers['access-control-allow-origin'], undefined);
      });
    }

    it('DOMINIO_BASE acepta el dominio y un nivel de subdominio por https', async () => {
      for (const origen of ['https://barberias.example.org', 'https://fenix.barberias.example.org']) {
        const r = await llamarProd(`/api/public/galeria?subdominio=${A.subdominio}`, origen);
        assert.equal(r.status, 200, `${origen}: ${r.raw.slice(0, 120)}`);
      }
    });

    for (const origen of ['http://fenix.barberias.example.org', 'https://a.b.barberias.example.org', 'https://barberias.example.org.atacante.com', 'https://xbarberias.example.org']) {
      it(`DOMINIO_BASE rechaza ${origen} -> 403`, async () => {
        const r = await llamarProd('/api/public/galeria', origen);
        assert.equal(r.status, 403, r.raw.slice(0, 160));
      });
    }

    it('sin cabecera Origin (herramientas que no son un navegador) se atiende normal', async () => {
      const r = await llamarProd(`/api/public/galeria?subdominio=${A.subdominio}`, null);
      assert.equal(r.status, 200, r.raw.slice(0, 160));
    });

    it('la consulta previa (preflight) de un origen permitido se responde', async () => {
      const r = await H.pedir({ method: 'OPTIONS', path: '/api/servicios', puerto: PUERTO, headers: { Origin: 'https://app.ejemplo.com', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } });
      assert.ok([200, 204].includes(r.status), `devolvió ${r.status}`);
      assert.equal(r.headers['access-control-allow-origin'], 'https://app.ejemplo.com');
      assert.equal(r.headers['access-control-allow-credentials'], undefined, 'no deberían habilitarse credenciales');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('18. El mapa de la barbería solo admite la URL de embed de Google Maps', () => {
  const guardarMapa = valor => llamar(A.adminToken, 'PUT', '/api/mi-barberia', { maps_embed: valor });
  const mapaEnBase = async () => (await cn.query('SELECT maps_embed AS v FROM empresa_barberia WHERE idbarberia = ?', [A.idbarberia]))[0][0].v;

  for (const [nombre, valor] of [
    ['un javascript:', 'javascript:alert(document.cookie)'],
    ['un data: con HTML', 'data:text/html,<script>alert(1)</script>'],
    ['un iframe pegado entero', '<iframe src="https://www.google.com/maps/embed?pb=!1m18"></iframe>'],
    ['http sin cifrar', 'http://www.google.com/maps/embed?pb=!1m18'],
    ['otro dominio', 'https://sitio-malo.example/maps/embed?pb=!1m18'],
    ['un dominio que solo empieza parecido', 'https://www.google.com.sitio-malo.example/maps/embed?pb=1'],
    ['una URL con comillas', 'https://www.google.com/maps/embed?pb=1" onload="alert(1)'],
  ]) {
    it(`rechaza ${nombre} -> 400 y no se guarda`, async () => {
      const r = await guardarMapa(valor);
      assert.equal(r.status, 400, r.raw);
      assert.equal(await mapaEnBase(), null, 'se guardó un valor peligroso');
    });
  }

  it('acepta la URL de embed de Google Maps', async () => {
    const url = 'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3541.5!2d-58.17!3d-26.18';
    assert.equal((await guardarMapa(url)).status, 200);
    assert.equal(await mapaEnBase(), url);
  });

  it('un valor vacío borra el mapa', async () => {
    await guardarMapa('https://www.google.com/maps/embed?pb=1');
    assert.equal((await guardarMapa('')).status, 200);
    assert.ok(!(await mapaEnBase()));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('20. Solo producción: el alta de barberías está cerrada', () => {
  const alta = extra => H.pedir({
    method: 'POST',
    path: '/api/public/registro',
    body: {
      nombre_negocio: 'Barbería Intrusa', subdominio: 'intrusa', nombre_completo: 'Intruso', telefono: '3704123456',
      correo_electronico: 'intruso@intrusa.test', password: 'ClaveSegura123', ...extra,
    },
  });

  it('cualquiera que intente registrar una barbería recibe 403 y no se crea nada', async () => {
    const r = await alta();
    assert.equal(r.status, 403, `devolvió ${r.status}: ${r.raw.slice(0, 160)}`);
    const [[f]] = await cn.query("SELECT COUNT(*) AS n FROM empresa_barberia WHERE subdominio = 'intrusa'");
    assert.equal(f.n, 0, 'se creó una barbería');
    const [[p]] = await cn.query("SELECT COUNT(*) AS n FROM persona WHERE correo_electronico = 'intruso@intrusa.test'");
    assert.equal(p.n, 0, 'se creó el usuario');
  });

  it('un código de invitación inventado tampoco sirve', async () => {
    const r = await alta({ codigo_invitacion: 'cualquiera' });
    assert.equal(r.status, 403, r.raw.slice(0, 160));
  });
});

describe('21. Solo producción: el subdominio del landing', () => {
  it('un subdominio armado como objeto no se interpreta como filtro -> 404', async () => {
    const r = await H.pedir({ path: '/api/public/barberia?subdominio[like]=%25' });
    assert.equal(r.status, 404, r.raw.slice(0, 200));
  });

  it('cada subdominio devuelve SU barbería y nada de la otra', async () => {
    const a = await H.pedir({ path: `/api/public/barberia?subdominio=${A.subdominio}` });
    const b = await H.pedir({ path: `/api/public/barberia?subdominio=${B.subdominio}` });
    assert.equal(a.status, 200, a.raw.slice(0, 200));
    assert.ok(a.raw.includes(A.marca) && !a.raw.includes(B.marca), 'el landing de A mezcla datos de B');
    assert.ok(b.raw.includes(B.marca) && !b.raw.includes(A.marca), 'el landing de B mezcla datos de A');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('22. Política de contraseñas (8 a 72 caracteres) en todos los caminos', () => {
  const MALAS = [
    ['corta', 'corta'],
    ['de 7 caracteres', 'Abcdef1'],
    ['de más de 72 caracteres', 'x'.repeat(73)],
    ['vacía', ''],
    ['un número', 12345678],
    ['un objeto', { length: 99 }],
    ['una lista', ['Abcdefg1', 'Abcdefg2']],
  ];
  const nuevoBarbero = (extra = {}) => llamar(A.adminToken, 'POST', '/api/barberos', {
    nombre_completo: 'Barbero Nuevo', telefono: '3704555000', correo_electronico: 'nuevo@alfa.test', password: 'ClaveSegura123', ...extra,
  });

  for (const [nombre, valor] of MALAS) {
    it(`crear un barbero con una contraseña ${nombre} -> 400 y no se crea`, async () => {
      const r = await nuevoBarbero({ password: valor });
      assert.equal(r.status, 400, `devolvió ${r.status}: ${r.raw.slice(0, 160)}`);
      const [[f]] = await cn.query("SELECT COUNT(*) AS n FROM persona WHERE correo_electronico = 'nuevo@alfa.test'");
      assert.equal(f.n, 0, 'se creó igual');
    });

    it(`cambiarle la contraseña a un barbero a ${nombre} -> 400 y la anterior sigue valiendo`, async () => {
      const r = await llamar(A.adminToken, 'PATCH', `/api/barberos/${A.barbero.idusuario}/password`, { password: valor });
      assert.equal(r.status, 400, `devolvió ${r.status}: ${r.raw.slice(0, 160)}`);
      const entra = await H.pedir({ method: 'POST', path: '/api/public/login', headers: { 'X-Tenant-Subdomain': A.subdominio }, body: { correo_electronico: A.barbero.correo, password: H.PASSWORD } });
      assert.equal(entra.status, 200, 'la contraseña anterior dejó de servir');
    });

    it(`cambiar la propia contraseña a ${nombre} -> 400`, async () => {
      const r = await llamar(A.adminToken, 'PUT', '/api/mi-perfil/password', { password_actual: H.PASSWORD, password_nueva: valor });
      assert.equal(r.status, 400, `devolvió ${r.status}: ${r.raw.slice(0, 160)}`);
    });
  }

  it('sin el campo password al cambiarle la clave a un barbero -> 400 (antes era un 500)', async () => {
    const r = await llamar(A.adminToken, 'PATCH', `/api/barberos/${A.barbero.idusuario}/password`, {});
    assert.equal(r.status, 400, r.raw.slice(0, 160));
  });

  it('una contraseña propia actual que no es texto -> 400', async () => {
    const r = await llamar(A.adminToken, 'PUT', '/api/mi-perfil/password', { password_actual: { $ne: '' }, password_nueva: 'ClaveNueva123' });
    assert.equal(r.status, 400, r.raw.slice(0, 160));
  });

  it('control: contraseñas válidas funcionan en los tres caminos', async () => {
    const alta = await nuevoBarbero({ password: 'ClaveSegura123' });
    assert.equal(alta.status, 201, alta.raw.slice(0, 200));
    const cambio = await llamar(A.adminToken, 'PATCH', `/api/barberos/${A.barbero.idusuario}/password`, { password: 'OtraClave1234' });
    assert.equal(cambio.status, 200, cambio.raw.slice(0, 160));
    const entra = await H.pedir({ method: 'POST', path: '/api/public/login', headers: { 'X-Tenant-Subdomain': A.subdominio }, body: { correo_electronico: A.barbero.correo, password: 'OtraClave1234' } });
    assert.equal(entra.status, 200, 'no entra con la contraseña nueva');
    const propio = await llamar(A.adminToken, 'PUT', '/api/mi-perfil/password', { password_actual: H.PASSWORD, password_nueva: 'ClavePropia1234' });
    assert.equal(propio.status, 200, propio.raw.slice(0, 160));
  });
});
