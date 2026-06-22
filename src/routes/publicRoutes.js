const { Router } = require('express');
const { Op } = require('sequelize');
const sequelize = require('../../config/database');
const { registro, login } = require('../controllers/authController');
const EmpresaBarberia = require('../models/EmpresaBarberia');
const Servicio = require('../models/Servicio');
const Usuario = require('../models/Usuario');
const Persona = require('../models/Persona');
const HorariosAtencion = require('../models/HorariosAtencion');
const AgendaTurno = require('../models/AgendaTurno');
const Cliente = require('../models/Cliente');

const router = Router();

router.post('/registro', registro);
router.post('/login', login);

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
        attributes: ['idusuario', 'rating_promedio'],
      }),
    ]);

    return res.json({
      nombre_negocio: barberia.nombre_negocio,
      subdominio: barberia.subdominio,
      logo_url: barberia.logo_url ?? null,
      color_primario: barberia.color_primario ?? '#d4a843',
      servicios,
      barberos: barberos.map(b => ({
        idusuario: b.idusuario,
        rating_promedio: b.rating_promedio,
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

    let rangos;
    if (horariosDelDia.length > 0) {
      // Día configurado con uno o más rangos
      rangos = horariosDelDia.map(h => ({ apertura: h.hora_apertura.slice(0, 5), cierre: h.hora_cierre.slice(0, 5) }));
    } else if (totalConfigurado === 0) {
      // Barbero sin ningún horario configurado todavía → fallback para desarrollo
      rangos = [{ apertura: '09:00', cierre: '19:00' }];
    } else {
      // Barbero tiene horarios en otros días pero no en este → no trabaja hoy
      return res.json({ slots: [] });
    }

    // Turnos ya ocupados ese día (no cancelados)
    const turnosOcupados = await AgendaTurno.findAll({
      where: {
        idusuario_barbero: barbero_id,
        idbarberia: barberia.idbarberia,
        fecha,
        estado: { [Op.notIn]: ['cancelado'] },
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
    const { subdominio, idservicio, idusuario_barbero, fecha, hora_inicio, nombre_cliente, telefono_cliente, correo_electronico } = req.body;

    if (!subdominio || !idservicio || !idusuario_barbero || !fecha || !hora_inicio || !nombre_cliente || !telefono_cliente)
      return res.status(400).json({ error: 'Faltan campos obligatorios' });

    const barberia = await EmpresaBarberia.findOne({ where: { subdominio, estado_cuenta: 'activo' }, transaction: t });
    if (!barberia) { await t.rollback(); return res.status(404).json({ error: 'Barbería no encontrada' }); }

    const servicio = await Servicio.findOne({
      where: { idservicio, idbarberia: barberia.idbarberia, estado: 'activo' },
      transaction: t,
    });
    if (!servicio) { await t.rollback(); return res.status(404).json({ error: 'Servicio no encontrado' }); }

    const barbero = await Usuario.findOne({
      where: { idusuario: idusuario_barbero, rol: 'barbero' },
      include: [{ model: Persona, where: { idbarberia: barberia.idbarberia } }],
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
        estado: { [Op.notIn]: ['cancelado'] },
        [Op.or]: [
          { hora_inicio: { [Op.between]: [hora_inicio, hora_fin] } },
          { hora_fin: { [Op.between]: [hora_inicio, hora_fin] } },
          { hora_inicio: { [Op.lte]: hora_inicio }, hora_fin: { [Op.gte]: hora_fin } },
        ],
      },
      transaction: t,
    });
    if (conflicto) { await t.rollback(); return res.status(409).json({ error: 'Ese horario ya no está disponible' }); }

    // Crear o reusar persona/cliente
    // Buscar persona por teléfono dentro de esta barbería
    let persona = await Persona.findOne({
      where: { telefono: telefono_cliente, idbarberia: barberia.idbarberia },
      transaction: t,
    });
    if (!persona) {
      persona = await Persona.create({
        idbarberia: barberia.idbarberia,
        nombre_completo: nombre_cliente,
        telefono: telefono_cliente,
        correo_electronico: correo_electronico || null,
        fecha_registro: new Date(),
      }, { transaction: t });
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
