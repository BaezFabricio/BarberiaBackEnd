const nodemailer = require('nodemailer');
const { Resend } = require('resend');

function crearTransporte(gmail, password) {
    return nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 465,
        secure: true,
        auth: { user: gmail, pass: password },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
    });
}

async function enviarEmail({ from, to, subject, html, barberia }) {
    // Gmail tiene prioridad cuando está configurado — Resend con onboarding@resend.dev
    // solo puede enviar al email del dueño de la cuenta, no a clientes externos.
    if (barberia?.gmail_remitente && barberia?.gmail_password) {
        const transporte = crearTransporte(barberia.gmail_remitente, barberia.gmail_password);
        await transporte.sendMail({
            from: `${barberia.nombre_negocio} <${barberia.gmail_remitente}>`,
            to, subject, html,
        });
    } else if (process.env.RESEND_API_KEY) {
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({ from, to, subject, html });
    } else {
        throw new Error('No hay servicio de email configurado');
    }
}

async function enviarConfirmacionTurno({ barberia, turno, cliente, servicio, barbero, tokenConfirmar, tokenCancelar }) {
    if (!cliente?.correo_electronico) return;
    if (!process.env.RESEND_API_KEY && (!barberia.gmail_remitente || !barberia.gmail_password)) return;

    const fechaFormateada = new Date(turno.fecha + 'T12:00:00').toLocaleDateString('es-AR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const BASE_URL = process.env.BACKEND_URL ?? 'http://localhost:3000';
    const urlConfirmar = `${BASE_URL}/api/public/turno/confirmar?token=${tokenConfirmar}`;
    const urlCancelar  = `${BASE_URL}/api/public/turno/cancelar?token=${tokenCancelar}`;

    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr><td style="background:#1a1a1f;padding:28px 32px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">
            ${barberia.nombre_negocio}
          </h1>
          <p style="margin:6px 0 0;color:#d4a843;font-size:13px;">Confirmación de turno</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          <p style="margin:0 0 20px;font-size:15px;color:#374151;">
            Hola <strong>${cliente.nombre_completo}</strong>, tu turno fue registrado exitosamente.
          </p>

          <!-- Detalles -->
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;padding:20px;margin-bottom:28px;">
            <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Servicio</td>
                <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;">${servicio.nombre_servicio}</td></tr>
            <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Barbero</td>
                <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;">${barbero.nombre_completo}</td></tr>
            <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Fecha</td>
                <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;">${fechaFormateada}</td></tr>
            <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Hora</td>
                <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;">${turno.hora_inicio.slice(0,5)} hs</td></tr>
            <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Precio</td>
                <td style="padding:6px 0;font-size:14px;color:#d4a843;font-weight:700;text-align:right;">$${Number(servicio.precio).toLocaleString('es-AR')}</td></tr>
          </table>

          ${tokenConfirmar ? `
          <!-- Botones -->
          <p style="margin:0 0 16px;font-size:14px;color:#374151;">¿Podés asistir? Confirmá o cancelá tu turno:</p>
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="48%" align="center">
                <a href="${urlConfirmar}" style="display:block;background:#16a34a;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:700;text-align:center;">
                  ✓ Confirmar turno
                </a>
              </td>
              <td width="4%"></td>
              <td width="48%" align="center">
                <a href="${urlCancelar}" style="display:block;background:#dc2626;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:700;text-align:center;">
                  ✗ Cancelar turno
                </a>
              </td>
            </tr>
          </table>
          <p style="margin:24px 0 0;font-size:12px;color:#9ca3af;text-align:center;">
            Los botones expiran en 48 horas. Si tenés dudas contactá al negocio directamente.
          </p>` : `
          <p style="margin:24px 0 0;font-size:13px;color:#6b7280;text-align:center;">
            Si tenés alguna duda, contactá al negocio directamente.
          </p>`}
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#f9fafb;padding:16px 32px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">${barberia.nombre_negocio} · Sistema de turnos online</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await enviarEmail({
        from: `${barberia.nombre_negocio} <onboarding@resend.dev>`,
        to: cliente.correo_electronico,
        subject: `Tu turno en ${barberia.nombre_negocio} — ${fechaFormateada}`,
        html, barberia,
    });
}

async function enviarCancelacionTurno({ barberia, turno, cliente, servicio, motivo }) {
    if (!process.env.RESEND_API_KEY && (!barberia.gmail_remitente || !barberia.gmail_password)) return;
    if (!cliente.correo_electronico) return;

    const fechaFormateada = new Date(turno.fecha + 'T12:00:00').toLocaleDateString('es-AR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:#1a1a1f;padding:28px 32px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;">${barberia.nombre_negocio}</h1>
          <p style="margin:6px 0 0;color:#dc2626;font-size:13px;">Turno cancelado</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="font-size:15px;color:#374151;">
            Hola <strong>${cliente.nombre_completo}</strong>, lamentablemente tu turno del <strong>${fechaFormateada}</strong> a las <strong>${turno.hora_inicio.slice(0,5)} hs</strong> para <strong>${servicio.nombre_servicio}</strong> fue cancelado.
          </p>
          ${motivo ? `
          <div style="background:#fef2f2;border-left:4px solid #dc2626;border-radius:4px;padding:12px 16px;margin:20px 0;">
            <p style="margin:0;font-size:13px;color:#7f1d1d;font-weight:600;">Motivo:</p>
            <p style="margin:4px 0 0;font-size:14px;color:#991b1b;">${motivo}</p>
          </div>` : ''}
          <p style="font-size:14px;color:#6b7280;">Podés reservar otro turno desde nuestra página cuando quieras. Disculpá las molestias.</p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">${barberia.nombre_negocio} · Sistema de turnos online</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await enviarEmail({
        from: `${barberia.nombre_negocio} <onboarding@resend.dev>`,
        to: cliente.correo_electronico,
        subject: `Turno cancelado — ${barberia.nombre_negocio}`,
        html, barberia,
    });
}

async function enviarEmailPromo({ email, nombre, mensaje, barberia }) {
    if (!process.env.RESEND_API_KEY && (!barberia.gmail_remitente || !barberia.gmail_password)) return;
    const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f5f5f5;padding:20px">
  <table width="600" align="center" style="background:#fff;border-radius:8px;overflow:hidden">
    <tr><td style="background:#1a1a1a;padding:24px;text-align:center">
      <h2 style="color:#d4a843;margin:0">${barberia.nombre_negocio}</h2>
    </td></tr>
    <tr><td style="padding:32px">
      <p style="font-size:16px;color:#333">Hola ${nombre.split(' ')[0]},</p>
      <p style="font-size:15px;color:#444;white-space:pre-line">${mensaje}</p>
      <p style="color:#888;font-size:13px;margin-top:32px">— El equipo de ${barberia.nombre_negocio}</p>
    </td></tr>
  </table>
</body></html>`;
    await enviarEmail({
        from: `${barberia.nombre_negocio} <onboarding@resend.dev>`,
        to: email,
        subject: `Una propuesta para vos — ${barberia.nombre_negocio}`,
        html, barberia,
    });
}

async function enviarEmailBarberoNuevoTurno({ barberia, turno, cliente, servicio, barbero }) {
    if (!process.env.RESEND_API_KEY && (!barberia.gmail_remitente || !barberia.gmail_password)) return;
    if (!barbero.correo_electronico) return;

    const fechaFormateada = new Date(turno.fecha + 'T12:00:00').toLocaleDateString('es-AR', {
        weekday: 'long', day: 'numeric', month: 'long'
    });

    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:#1a1a1f;padding:28px 32px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">${barberia.nombre_negocio}</h1>
          <p style="margin:6px 0 0;color:#d4a843;font-size:13px;">Nuevo turno asignado</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 20px;font-size:15px;color:#374151;">
            Hola <strong>${barbero.nombre_completo}</strong>, tenés un nuevo turno reservado.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;padding:20px;margin-bottom:20px;">
            <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Cliente</td>
                <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;">${cliente.nombre_completo}</td></tr>
            <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Teléfono</td>
                <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;">${cliente.telefono}</td></tr>
            <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Servicio</td>
                <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;">${servicio.nombre_servicio}</td></tr>
            <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Fecha</td>
                <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;">${fechaFormateada}</td></tr>
            <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Hora</td>
                <td style="padding:6px 0;font-size:14px;color:#d4a843;font-weight:700;text-align:right;">${turno.hora_inicio.slice(0,5)} hs</td></tr>
          </table>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">${barberia.nombre_negocio} · Sistema de turnos online</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await enviarEmail({
        from: `${barberia.nombre_negocio} <onboarding@resend.dev>`,
        to: barbero.correo_electronico,
        subject: `Nuevo turno — ${cliente.nombre_completo} el ${fechaFormateada}`,
        html, barberia,
    });
}

async function enviarEmailRecuperacion({ correo, nombre, token, BASE_URL, barberia }) {
    const url = `${BASE_URL}/recuperar-password/resetear?token=${token}`;
    const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff;">
      <h2 style="font-size:20px;color:#111827;margin-bottom:8px;">Recuperar contraseña</h2>
      <p style="color:#6b7280;font-size:14px;margin-bottom:24px;">Hola ${nombre}, recibimos una solicitud para resetear tu contraseña.</p>
      <a href="${url}" style="display:inline-block;background:#d4a843;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:14px;">Cambiar contraseña</a>
      <p style="color:#9ca3af;font-size:12px;margin-top:24px;">Este link expira en 1 hora. Si no solicitaste este cambio, ignorá este mensaje.</p>
    </div>`;
    await enviarEmail({ from: 'BarberSystem <onboarding@resend.dev>', to: correo, subject: 'Recuperar contraseña', html, barberia });
}

async function enviarEmailRecordatorio({ barberia, turno, cliente, servicio, barbero }) {
    if (!cliente?.correo_electronico) return;
    if (!process.env.RESEND_API_KEY && (!barberia.gmail_remitente || !barberia.gmail_password)) return;

    const fechaFormateada = new Date(turno.fecha + 'T12:00:00').toLocaleDateString('es-AR', {
        weekday: 'long', day: 'numeric', month: 'long'
    });

    const html = `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:#1a1a1f;padding:28px 32px;text-align:center;">
          <h1 style="margin:0;color:#ffffff;font-size:22px;font-weight:700;">${barberia.nombre_negocio}</h1>
          <p style="margin:6px 0 0;color:#d4a843;font-size:13px;">Recordatorio de turno</p>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 20px;font-size:15px;color:#374151;">
            Hola <strong>${cliente.nombre_completo}</strong>, te recordamos que mañana tenés un turno.
          </p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:8px;padding:20px;margin-bottom:20px;">
            <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Servicio</td>
                <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;">${servicio?.nombre_servicio ?? ''}</td></tr>
            <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Barbero</td>
                <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;">${barbero?.nombre_completo ?? ''}</td></tr>
            <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Fecha</td>
                <td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600;text-align:right;">${fechaFormateada}</td></tr>
            <tr><td style="padding:6px 0;font-size:14px;color:#6b7280;">Hora</td>
                <td style="padding:6px 0;font-size:14px;color:#d4a843;font-weight:700;text-align:right;">${turno.hora_inicio.slice(0,5)} hs</td></tr>
          </table>
          <p style="font-size:13px;color:#6b7280;text-align:center;">Si no podés asistir, contactá al negocio para cancelar tu turno.</p>
        </td></tr>
        <tr><td style="background:#f9fafb;padding:16px 32px;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0;font-size:12px;color:#9ca3af;">${barberia.nombre_negocio} · Sistema de turnos online</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    await enviarEmail({
        from: `${barberia.nombre_negocio} <onboarding@resend.dev>`,
        to: cliente.correo_electronico,
        subject: `Recordatorio: tu turno mañana — ${barberia.nombre_negocio}`,
        html, barberia,
    });
}

module.exports = { enviarConfirmacionTurno, enviarCancelacionTurno, enviarEmailPromo, enviarEmailRecuperacion, enviarEmailBarberoNuevoTurno, enviarEmailRecordatorio };
