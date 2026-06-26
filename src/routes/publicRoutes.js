const { Router } = require('express');
const { Op } = require('sequelize');
const crypto = require('crypto');
const sequelize = require('../../config/database');
const { registro, login } = require('../controllers/authController');
const EmpresaBarberia = require('../models/EmpresaBarberia');
const Servicio = require('../models/Servicio');
const Usuario = require('../models/Usuario');
const Persona = require('../models/Persona');
const HorariosAtencion = require('../models/HorariosAtencion');
const AgendaTurno = require('../models/AgendaTurno');
const Cliente = require('../models/Cliente');
const TurnoToken = require('../models/TurnoToken');
const { enviarConfirmacionTurno, enviarCancelacionTurno } = require('../services/emailService');
const { notificarClienteNuevoTurno, notificarBarberoNuevoTurno } = require('../services/whatsappService');

const router = Router();

router.post('/registro', registro);
router.post('/login', login);

router.get('/carrusel', async (req, res) => {
    const { subdominio } = req.query;
    if (!subdominio) return res.json([]);
    try {
        const barberia = await EmpresaBarberia.findOne({ where: { subdominio, estado_cuenta: 'activo' } });
        if (!barberia) return res.json([]);
        const ImagenCarrusel = require('../models/ImagenCarrusel');
        const imgs = await ImagenCarrusel.findAll({ where: { idbarberia: barberia.idbarberia }, order: [['orden', 'ASC'], ['idimagen', 'ASC']] });
        res.json(imgs);
    } catch { res.json([]); }
});

// Devuelve los datos públicos de una barbería: info, servicios activos y barberos activos
router.get('/barberia', async (req, res) => {
  try {
    const { subdominio } = req.query;
    if (!subdominio) return res.status(400).json({ error: 'subdominio requerido' });

    const barberia = await EmpresaBarberia.findOne({ where: { subdominio, estado_cuenta: 'activo' } });
    if (!barberia) return res.status(404).json({ error: 'Barbería no encontrada' });

    const [servicios, barberos] = await Promise.all([
      Servicio.findAll({
        where: { idbarberia: barberia.idbarberia, estado: 'activo' },
        attributes: ['idservicio', 'nombre_servicio', 'descripcion', 'precio', 'duracion_minutos', 'imagen_url'],
      }),
      Usuario.findAll({
        where: { rol: 'barbero', estado: 'activo' },
        include: [{ model: Persona, where: { idbarberia: barberia.idbarberia }, attributes: ['nombre_completo', 'foto_url'] }],
        attributes: ['idusuario', 'rating_promedio', 'especialidades'],
      }),
    ]);

    return res.json({
      nombre_negocio: barberia.nombre_negocio,
      subdominio: barberia.subdominio,
      logo_url:            barberia.logo_url ?? null,
      color_primario:      barberia.color_primario ?? '#d4a843',
      telefono:            barberia.telefono ?? null,
      direccion:           barberia.direccion ?? null,
      correo_negocio:      barberia.correo_negocio ?? null,
      horario_lv_desde:    barberia.horario_lv_desde ?? '09:00',
      horario_lv_hasta:    barberia.horario_lv_hasta ?? '19:00',
      horario_sab_desde:   barberia.horario_sab_desde ?? '09:00',
      horario_sab_hasta:   barberia.horario_sab_hasta ?? '15:00',
      domingo_cerrado:     barberia.domingo_cerrado ?? true,
      instagram:           barberia.instagram ?? null,
      facebook:            barberia.facebook ?? null,
      whatsapp_negocio:    barberia.whatsapp_negocio ?? null,
      slogan:              barberia.slogan ?? null,
      color_portada:       barberia.color_portada ?? '#ffffff',
      color_nombre_1:      barberia.color_nombre_1 ?? '#ffffff',
      color_nombre_2:      barberia.color_nombre_2 ?? '#d4a843',
      texto_portada_1:     barberia.texto_portada_1 ?? null,
      texto_portada_2:     barberia.texto_portada_2 ?? null,
      color_header_1:      barberia.color_header_1 ?? '#ffffff',
      color_header_2:      barberia.color_header_2 ?? '#d4a843',
      fuente_header:       barberia.fuente_header ?? 'Cinzel',
      maps_embed:          barberia.maps_embed ?? null,
      reservas_online:     barberia.reservas_online ?? true,
      servicios,
      barberos: barberos.map(b => ({
        idusuario: b.idusuario,
        rating_promedio: b.rating_promedio,
        especialidades: b.especialidades ?? null,
        nombre_completo: b.persona?.nombre_completo ?? b.Persona?.nombre_completo ?? '',
        foto_url: b.persona?.foto_url ?? b.Persona?.foto_url ?? null,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// Devuelve los horarios disponibles de un barbero para una fecha y servicio
// ?subdominio=X&barbero_id=X&fecha=YYYY-MM-DD&idservicio=X
router.get('/disponibilidad', async (req, res) => {
  try {
    const { subdominio, barbero_id, fecha, idservicio } = req.query;
    if (!subdominio || !barbero_id || !fecha || !idservicio)
      return res.status(400).json({ error: 'Faltan parámetros: subdominio, barbero_id, fecha, idservicio' });

    const barberia = await EmpresaBarberia.findOne({ where: { subdominio, estado_cuenta: 'activo' } });
    if (!barberia) return res.status(404).json({ error: 'Barbería no encontrada' });

    const servicio = await Servicio.findOne({
      where: { idservicio, idbarberia: barberia.idbarberia, estado: 'activo' },
      attributes: ['duracion_minutos'],
    });
    if (!servicio) return res.status(404).json({ error: 'Servicio no encontrado' });

    const duracion = servicio.duracion_minutos;

    // Determinar día de semana (DB: 1=Lun ... 7=Dom, JS: 0=Dom ... 6=Sab)
    const fechaObj = new Date(fecha + 'T12:00:00');
    const jsDia = fechaObj.getDay(); // 0=Dom
    const dbDia = jsDia === 0 ? 7 : jsDia;

    // Verificar si el barbero tiene horarios configurados en algún día
    const totalConfigurado = await HorariosAtencion.count({ where: { idusuario_barbero: barbero_id } });

    const horariosDelDia = await HorariosAtencion.findAll({
      where: { idusuario_barbero: barbero_id, dia_semana: dbDia },
      order: [['hora_apertura', 'ASC']],
    });

    if (horariosDelDia.length === 0) {
      // Sin horarios para este día (o sin ninguno configurado) → no disponible
      return res.json({ slots: [] });
    }
    const rangos = horariosDelDia.map(h => ({ apertura: h.hora_apertura.slice(0, 5), cierre: h.hora_cierre.slice(0, 5) }));

    // Turnos ya ocupados ese día (no cancelados)
    const turnosOcupados = await AgendaTurno.findAll({
      where: {
        idusuario_barbero: barbero_id,
        idbarberia: barberia.idbarberia,
        fecha,
        estado: { [Op.notIn]: ['cancelado', 'archivado'] },
      },
      attributes: ['hora_inicio', 'hora_fin'],
    });

    const slots = generarSlots(rangos, duracion, turnosOcupados, fecha);
    return res.json({ slots });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error interno' });
  }
});

// Crea una reserva pública (sin autenticación)
router.post('/reserva', async (req, res) => {
  const t = await sequelize.transaction();
  try {
    const { subdominio, idservicio, idusuario_barbero, fecha, hora_inicio, nombre_cliente, correo_electronico } = req.body;
    // Normalizar teléfono: solo dígitos, sin código de país argentino
    let telefono_cliente = (req.body.telefono_cliente ?? '').replace(/\D/g, '');
    if (telefono_cliente.startsWith('549')) telefono_cliente = telefono_cliente.slice(3);
    else if (telefono_cliente.startsWith('54')) telefono_cliente = telefono_cliente.slice(2);
    if (telefono_cliente.startsWith('0')) telefono_cliente = telefono_cliente.slice(1);

    if (!subdominio || !idservicio || !idusuario_barbero || !fecha || !hora_inicio || !nombre_cliente || !telefono_cliente)
      return res.status(400).json({ error: 'Faltan campos obligatorios' });

    const barberia = await EmpresaBarberia.findOne({ where: { subdominio, estado_cuenta: 'activo' }, transaction: t });
    if (!barberia) { await t.rollback(); return res.status(404).json({ error: 'Barbería no encontrada' }); }
    if (barberia.reservas_online === false) { await t.rollback(); return res.status(403).json({ error: 'Las reservas online están desactivadas.' }); }

    const servicio = await Servicio.findOne({
      where: { idservicio, idbarberia: barberia.idbarberia, estado: 'activo' },
      transaction: t,
    });
    if (!servicio) { await t.rollback(); return res.status(404).json({ error: 'Servicio no encontrado' }); }

    const barbero = await Usuario.findOne({
      where: { idusuario: idusuario_barbero, rol: 'barbero' },
      include: [{ model: Persona, where: { idbarberia: barberia.idbarberia }, attributes: ['nombre_completo', 'telefono', 'foto_url'] }],
      transaction: t,
    });
    if (!barbero) { await t.rollback(); return res.status(404).json({ error: 'Barbero no encontrado' }); }

    // Calcular hora_fin
    const [h, m] = hora_inicio.split(':').map(Number);
    const finMin = h * 60 + m + servicio.duracion_minutos;
    const hora_fin = `${String(Math.floor(finMin / 60)).padStart(2, '0')}:${String(finMin % 60).padStart(2, '0')}`;

    // Verificar que el slot sigue disponible
    const conflicto = await AgendaTurno.findOne({
      where: {
        idusuario_barbero,
        idbarberia: barberia.idbarberia,
        fecha,
        estado: { [Op.in]: ['pendiente', 'confirmado'] },
        hora_inicio: { [Op.lt]: hora_fin },
        hora_fin:    { [Op.gt]: hora_inicio },
      },
      transaction: t,
    });
    if (conflicto) { await t.rollback(); return res.status(409).json({ error: 'Ese horario ya no está disponible' }); }

    // Crear o reusar persona/cliente — busca por email primero, luego por teléfono
    let persona = null;
    if (correo_electronico) {
      persona = await Persona.findOne({
        where: { correo_electronico, idbarberia: barberia.idbarberia },
        transaction: t,
      });
    }
    if (!persona) {
      persona = await Persona.create({
        idbarberia: barberia.idbarberia,
        nombre_completo: nombre_cliente,
        telefono: telefono_cliente,
        correo_electronico: correo_electronico || null,
        fecha_registro: new Date(),
      }, { transaction: t });
    } else {
      const updates = {};
      if (correo_electronico && !persona.correo_electronico) updates.correo_electronico = correo_electronico;
      if (telefono_cliente && telefono_cliente !== persona.telefono) updates.telefono = telefono_cliente;
      if (Object.keys(updates).length) await persona.update(updates, { transaction: t });
    }

    let cliente = await Cliente.findOne({ where: { idpersona: persona.idpersona }, transaction: t });
    if (!cliente) {
      cliente = await Cliente.create({
        idpersona: persona.idpersona,
        estado: 'activo',
      }, { transaction: t });
    }

    const turno = await AgendaTurno.create({
      idbarberia: barberia.idbarberia,
      idcliente: cliente.idcliente,
      idusuario_barbero,
      idservicio,
      fecha,
      hora_inicio,
      hora_fin,
      estado: 'pendiente',
      tipo_alta: 'web',
    }, { transaction: t });

    await t.commit();

    // Generar tokens de confirmar/cancelar (expiran en 48hs)
    const expira = new Date(Date.now() + 48 * 60 * 60 * 1000);
    const tokenConfirmar = crypto.randomBytes(32).toString('hex');
    const tokenCancelar  = crypto.randomBytes(32).toString('hex');
    await TurnoToken.bulkCreate([
      { idagenda: turno.idagenda, token: tokenConfirmar, tipo: 'confirmar', expira_en: expira },
      { idagenda: turno.idagenda, token: tokenCancelar,  tipo: 'cancelar',  expira_en: expira },
    ]);

    // Datos para notificaciones
    // Usar el teléfono del formulario para notificaciones (puede haber cambiado)
    const clienteData = { nombre_completo: persona.nombre_completo, telefono: telefono_cliente || persona.telefono, correo_electronico: persona.correo_electronico };
    const barberoData = {
      nombre_completo: barbero.Persona?.nombre_completo ?? barbero.persona?.nombre_completo ?? '',
      telefono: barbero.Persona?.telefono ?? barbero.persona?.telefono ?? null,
    };

    // Registrar notificación interna
    const { registrar: registrarNotif } = require('../services/notificacionService');
    await registrarNotif({
      idbarberia: barberia.idbarberia,
      idusuario_barbero: turno.idusuario_barbero,
      tipo: 'reserva',
      titulo: 'Nueva reserva online',
      mensaje: `${clienteData.nombre_completo} — ${servicio.nombre_servicio} el ${turno.fecha} a las ${turno.hora_inicio.slice(0,5)}`,
    });

    // Enviar notificaciones en background respetando configuración
    setImmediate(async () => {
      if (barberia.notif_nueva_reserva !== false) {
        try { await enviarConfirmacionTurno({ barberia, turno, cliente: clienteData, servicio, barbero: barberoData, tokenConfirmar, tokenCancelar }); } catch (e) { console.error('Email error:', e.message); }
        try { await notificarClienteNuevoTurno({ barberia, turno, cliente: clienteData, servicio, barbero: barberoData }); } catch (e) { console.error('WA cliente error:', e.message); }
      }
      if (barberia.notif_barbero !== false) {
        try { await notificarBarberoNuevoTurno({ barberia, turno, cliente: clienteData, servicio, barbero: barberoData }); } catch (e) { console.error('WA barbero error:', e.message); }
      }
    });

    return res.status(201).json({
      idagenda: turno.idagenda,
      fecha: turno.fecha,
      hora_inicio: turno.hora_inicio,
      hora_fin: turno.hora_fin,
      servicio: servicio.nombre_servicio,
    });
  } catch (err) {
    await t.rollback();
    console.error(err);
    return res.status(500).json({ error: 'Error al crear la reserva' });
  }
});

// Confirmar turno desde email
router.get('/turno/confirmar', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).send(paginaResultado('error', 'Token inválido.'));

    const registro = await TurnoToken.findOne({ where: { token, tipo: 'confirmar', usado: false } });
    if (!registro) return res.send(paginaResultado('error', 'El link ya fue usado o expiró.'));
    if (new Date() > registro.expira_en) return res.send(paginaResultado('error', 'El link expiró.'));

    await AgendaTurno.update({ estado: 'confirmado' }, { where: { idagenda: registro.idagenda } });
    await registro.update({ usado: true });

    res.send(paginaResultado('confirmar', '¡Turno confirmado! Te esperamos.'));
  } catch (err) {
    console.error(err);
    res.status(500).send(paginaResultado('error', 'Error interno.'));
  }
});

// Cancelar turno desde email
router.get('/turno/cancelar', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).send(paginaResultado('error', 'Token inválido.'));

    const registro = await TurnoToken.findOne({ where: { token, tipo: 'cancelar', usado: false } });
    if (!registro) return res.send(paginaResultado('error', 'El link ya fue usado o expiró.'));
    if (new Date() > registro.expira_en) return res.send(paginaResultado('error', 'El link expiró.'));

    const turno = await AgendaTurno.findByPk(registro.idagenda, {
      include: [
        { model: require('../models/Servicio'), attributes: ['nombre_servicio', 'precio'] },
        { model: require('../models/Cliente'), include: [{ model: Persona, attributes: ['nombre_completo', 'telefono', 'correo_electronico'] }] },
      ]
    });

    if (turno) {
      const barberia = await EmpresaBarberia.findByPk(turno.idbarberia);
      const minutos = barberia?.tiempo_cancelacion ?? 60;
      const fechaHoraTurno = new Date(`${turno.fecha}T${turno.hora_inicio}`);
      const limiteMs = minutos * 60 * 1000;
      if (new Date() > new Date(fechaHoraTurno.getTime() - limiteMs)) {
        return res.send(paginaResultado('error', `No se puede cancelar con menos de ${minutos} minutos de anticipación.`));
      }
    }

    await AgendaTurno.update({ estado: 'cancelado' }, { where: { idagenda: registro.idagenda } });
    await TurnoToken.update({ usado: true }, { where: { idagenda: registro.idagenda } });

    // Notificar cancelación por email
    if (turno) {
      const barberia = await EmpresaBarberia.findByPk(turno.idbarberia);
      const clienteData = {
        nombre_completo: turno.cliente?.persona?.nombre_completo ?? turno.cliente?.Persona?.nombre_completo ?? '',
        correo_electronico: turno.cliente?.persona?.correo_electronico ?? turno.cliente?.Persona?.correo_electronico ?? '',
      };
      setImmediate(async () => {
        try { await enviarCancelacionTurno({ barberia, turno, cliente: clienteData, servicio: turno.servicio ?? turno.Servicio }); }
        catch (e) { console.error('Email cancelacion error:', e.message); }
      });
    }

    res.send(paginaResultado('cancelar', 'Tu turno fue cancelado correctamente.'));
  } catch (err) {
    console.error(err);
    res.status(500).send(paginaResultado('error', 'Error interno.'));
  }
});

// ── Recuperar contraseña ──────────────────────────────────────────────────────
router.post('/recuperar-password', async (req, res) => {
    try {
        const { correo_electronico } = req.body;
        if (!correo_electronico) return res.status(400).json({ error: 'Email requerido.' });

        const persona = await Persona.findOne({ where: { correo_electronico } });
        if (!persona) return res.json({ mensaje: 'Si el email existe, recibirás un link.' });

        const usuario = await Usuario.findOne({ where: { idpersona: persona.idpersona, rol: 'admin' } });
        if (!usuario) return res.json({ mensaje: 'Si el email existe, recibirás un link.' });

        const token = crypto.randomBytes(32).toString('hex');
        const expira = new Date(Date.now() + 60 * 60 * 1000); // 1 hora
        await usuario.update({ reset_token: token, reset_token_expira: expira });

        const { enviarEmailRecuperacion } = require('../services/emailService');
        const BASE_URL = process.env.FRONTEND_URL ?? 'http://localhost:3001';
        await enviarEmailRecuperacion({ correo: correo_electronico, nombre: persona.nombre_completo, token, BASE_URL });

        res.json({ mensaje: 'Si el email existe, recibirás un link.' });
    } catch (err) {
        console.error('recuperar-password error:', err.message);
        res.status(500).json({ error: 'Error interno.' });
    }
});

router.post('/resetear-password', async (req, res) => {
    try {
        const { token, password_nueva } = req.body;
        if (!token || !password_nueva) return res.status(400).json({ error: 'Datos incompletos.' });
        if (password_nueva.length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres.' });

        const usuario = await Usuario.findOne({ where: { reset_token: token } });
        if (!usuario || !usuario.reset_token_expira) return res.status(400).json({ error: 'Token inválido.' });
        if (new Date() > usuario.reset_token_expira) return res.status(400).json({ error: 'El link expiró. Solicitá uno nuevo.' });

        const bcrypt = require('bcryptjs');
        await usuario.update({ password_hash: await bcrypt.hash(password_nueva, 10), reset_token: null, reset_token_expira: null });
        res.json({ mensaje: 'Contraseña actualizada correctamente.' });
    } catch (err) {
        console.error('resetear-password error:', err.message);
        res.status(500).json({ error: 'Error interno.' });
    }
});

function paginaResultado(tipo, mensaje) {
  const colores = { confirmar: '#16a34a', cancelar: '#dc2626', error: '#d97706' };
  const iconos  = { confirmar: '✓', cancelar: '✗', error: '!' };
  const color = colores[tipo] ?? '#6b7280';
  const icono = iconos[tipo] ?? '?';
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Turno</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f4f4f5;font-family:Arial,sans-serif;}
.card{background:#fff;border-radius:16px;padding:48px 40px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.08);max-width:400px;width:90%;}
.icon{width:64px;height:64px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:bold;color:#fff;margin:0 auto 20px;background:${color};}
h1{font-size:20px;color:#111827;margin-bottom:8px;}p{font-size:14px;color:#6b7280;}
</style></head><body><div class="card"><div class="icon">${icono}</div><h1>${mensaje}</h1><p>Podés cerrar esta ventana.</p></div></body></html>`;
}

// Genera slots disponibles a partir de múltiples rangos horarios por día
// rangos: [{ apertura: 'HH:MM', cierre: 'HH:MM' }]
function generarSlots(rangos, duracionMin, turnosOcupados, fecha) {
  const ahora = new Date();
  const esHoy = fecha === ahora.toISOString().split('T')[0];
  const minutoActual = ahora.getHours() * 60 + ahora.getMinutes() + 30;

  const ocupados = turnosOcupados.map(t => {
    const [th, tm] = t.hora_inicio.slice(0, 5).split(':').map(Number);
    const [fh, fm] = t.hora_fin.slice(0, 5).split(':').map(Number);
    return { start: th * 60 + tm, end: fh * 60 + fm };
  });

  const slots = [];
  for (const rango of rangos) {
    const [oh, om] = rango.apertura.split(':').map(Number);
    const [ch, cm] = rango.cierre.split(':').map(Number);
    const inicio = oh * 60 + om;
    const fin = ch * 60 + cm;

    for (let min = inicio; min + duracionMin <= fin; min += duracionMin) {
      if (esHoy && min < minutoActual) continue;
      const slotEnd = min + duracionMin;
      const libre = !ocupados.some(o => min < o.end && slotEnd > o.start);
      if (libre) {
        slots.push(`${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`);
      }
    }
  }
  return slots;
}

module.exports = router;
