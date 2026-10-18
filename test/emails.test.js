// El HTML de los emails no puede dejar pasar texto que escribe una persona. No se envía nada real:
// se reemplaza fetch y se mira lo que se habría mandado al proveedor (Brevo).
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const emails = require('../src/services/emailService');

const ATAQUE = '<img src=x onerror=alert(1)><a href="https://phishing.example">Pagá acá</a>';
const barberia = { nombre_negocio: `Barbería <b>Fénix</b>` };
const turno = { fecha: '2030-03-04', hora_inicio: '11:00:00' };
const servicio = { nombre_servicio: `Corte ${ATAQUE}`, precio: 8000 };

let enviado;
const fetchOriginal = global.fetch;
const brevoOriginal = process.env.BREVO_API_KEY;

beforeEach(() => {
  enviado = null;
  process.env.BREVO_API_KEY = 'clave-de-prueba';
  global.fetch = async (url, opciones) => { enviado = JSON.parse(opciones.body); return { ok: true, text: async () => '' }; };
});
afterEach(() => {
  global.fetch = fetchOriginal;
  if (brevoOriginal === undefined) delete process.env.BREVO_API_KEY; else process.env.BREVO_API_KEY = brevoOriginal;
});

const sinHtmlPeligroso = html => {
  assert.ok(!html.includes('<img src=x'), 'el HTML del atacante quedó vivo');
  assert.ok(!html.includes('href="https://phishing.example"'), 'el enlace del atacante quedó vivo');
  assert.ok(!html.includes('<b>Fénix</b>'), 'el nombre del negocio se interpretó como HTML');
};

describe('emails: el texto de las personas se escapa', () => {
  it('aviso al barbero: nombre, teléfono y servicio', async () => {
    await emails.enviarEmailBarberoNuevoTurno({
      barberia, turno, servicio, tokenCancelar: 'tok',
      cliente: { nombre_completo: ATAQUE, telefono: ATAQUE },
      barbero: { nombre_completo: ATAQUE, correo_electronico: 'barbero@test.example' },
    });
    assert.ok(enviado, 'no se intentó enviar el email');
    sinHtmlPeligroso(enviado.htmlContent);
    assert.ok(enviado.htmlContent.includes('&lt;img src=x'), 'el texto debería verse, pero escapado');
  });

  it('confirmación al cliente', async () => {
    await emails.enviarConfirmacionTurno({
      barberia, turno, servicio, tokenConfirmar: 't1', tokenCancelar: 't2',
      cliente: { nombre_completo: ATAQUE, correo_electronico: 'cliente@test.example' },
      barbero: { nombre_completo: ATAQUE },
    });
    sinHtmlPeligroso(enviado.htmlContent);
  });

  it('cancelación con un motivo escrito por una persona', async () => {
    await emails.enviarCancelacionTurno({
      barberia, turno, servicio, motivo: ATAQUE,
      cliente: { nombre_completo: ATAQUE, correo_electronico: 'cliente@test.example' },
    });
    sinHtmlPeligroso(enviado.htmlContent);
  });

  it('promoción: mensaje y nombre', async () => {
    await emails.enviarEmailPromo({ email: 'cliente@test.example', nombre: ATAQUE, mensaje: ATAQUE, barberia });
    sinHtmlPeligroso(enviado.htmlContent);
  });

  it('recordatorio', async () => {
    await emails.enviarEmailRecordatorio({
      barberia, turno, servicio,
      cliente: { nombre_completo: ATAQUE, correo_electronico: 'cliente@test.example' },
      barbero: { nombre_completo: ATAQUE },
    });
    sinHtmlPeligroso(enviado.htmlContent);
  });

  it('pedido de calificación', async () => {
    await emails.enviarEmailCalificacion({
      barberia, turno, linkCalificar: 'https://app.example/calificar/abc',
      cliente: { nombre_completo: ATAQUE, correo_electronico: 'cliente@test.example' },
      barbero: { nombre_completo: ATAQUE },
    });
    sinHtmlPeligroso(enviado.htmlContent);
  });

  it('el asunto no admite saltos de línea (inyección de cabeceras)', async () => {
    await emails.enviarEmailBarberoNuevoTurno({
      barberia, turno, servicio,
      cliente: { nombre_completo: 'Juan\r\nBcc: robo@example.com', telefono: '1' },
      barbero: { nombre_completo: 'B', correo_electronico: 'barbero@test.example' },
    });
    assert.ok(!/[\r\n]/.test(enviado.subject), `el asunto tiene saltos de línea: ${JSON.stringify(enviado.subject)}`);
  });

  it('control: un nombre normal con tildes se ve igual', async () => {
    await emails.enviarConfirmacionTurno({
      barberia: { nombre_negocio: 'Barbería Fénix' }, turno, servicio: { nombre_servicio: 'Corte y barba', precio: 8000 },
      cliente: { nombre_completo: 'José Ñandú', correo_electronico: 'cliente@test.example' },
      barbero: { nombre_completo: 'Martín' },
    });
    assert.ok(enviado.htmlContent.includes('José Ñandú') && enviado.htmlContent.includes('Corte y barba'));
  });
});
