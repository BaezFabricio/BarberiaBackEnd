const { Router } = require('express');
const { authMiddleware, soloRoles } = require('../middlewares/authMiddleware');
const tenantMiddleware = require('../middlewares/tenantMiddleware');

const servicioCtrl = require('../controllers/servicioController');
const clienteCtrl = require('../controllers/clienteController');
const turnoCtrl = require('../controllers/turnoController');
const productoCtrl = require('../controllers/productoController');
const sequelize = require('../../config/database');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const Usuario = require('../models/Usuario');
const Persona = require('../models/Persona');
const HorariosAtencion = require('../models/HorariosAtencion');
const EmpresaBarberia = require('../models/EmpresaBarberia');
const Servicio = require('../models/Servicio');
require('../models/PagoServicio'); // registra asociación AgendaTurno <-> PagoServicio
const VentaProducto = require('../models/VentaProducto');
const Producto = require('../models/Producto');
const Cliente = require('../models/Cliente');
const { makeUpload } = require('../middlewares/uploadMiddleware');

const router = Router();

// Todas las rutas aquí requieren JWT válido + tenant identificado
router.use(authMiddleware);
router.use(tenantMiddleware);

// ── Perfil del usuario autenticado ───────────────────────────────────────────
router.get('/mi-perfil', async (req, res) => {
    try {
        const usuario = await Usuario.findOne({
            where: { idusuario: req.usuario.idusuario },
            include: [{ model: Persona, attributes: ['nombre_completo', 'telefono', 'correo_electronico', 'foto_url'] }],
            attributes: ['idusuario', 'rol', 'rating_promedio', 'comision_porcentaje', 'puede_cobrar', 'puede_vender', 'especialidades'],
        });
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado.' });
        res.json({
            idusuario: usuario.idusuario,
            rol: usuario.rol,
            rating_promedio: usuario.rating_promedio,
            comision_porcentaje: usuario.comision_porcentaje,
            puede_cobrar: usuario.puede_cobrar,
            puede_vender: usuario.puede_vender,
            nombre_completo: usuario.persona.nombre_completo,
            telefono: usuario.persona.telefono,
            correo_electronico: usuario.persona.correo_electronico,
            foto_url: usuario.persona.foto_url ?? null,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error interno.' });
    }
});

// ── Editar datos personales ───────────────────────────────────────────────────
router.put('/mi-perfil', async (req, res) => {
    const { nombre_completo, telefono } = req.body;
    if (!nombre_completo) return res.status(400).json({ error: 'El nombre es obligatorio.' });
    try {
        const usuario = await Usuario.findByPk(req.usuario.idusuario);
        await Persona.update(
            { nombre_completo: nombre_completo.trim(), ...(telefono !== undefined ? { telefono: telefono.trim() } : {}) },
            { where: { idpersona: usuario.idpersona } },
        );
        res.json({ mensaje: 'Datos actualizados.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error interno.' });
    }
});

// ── Cambio de contraseña ──────────────────────────────────────────────────────
router.put('/mi-perfil/password', async (req, res) => {
    const { password_actual, password_nueva } = req.body;
    if (!password_actual || !password_nueva) return res.status(400).json({ error: 'Faltan campos.' });
    if (password_nueva.length < 6) return res.status(400).json({ error: 'La contraseña nueva debe tener al menos 6 caracteres.' });
    try {
        const usuario = await Usuario.findByPk(req.usuario.idusuario);
        const valida = await bcrypt.compare(password_actual, usuario.password_hash);
        if (!valida) return res.status(401).json({ error: 'La contraseña actual es incorrecta.' });
        await usuario.update({ password_hash: await bcrypt.hash(password_nueva, 10) });
        res.json({ mensaje: 'Contraseña actualizada.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error interno.' });
    }
});

// ── Info barbería actual ──────────────────────────────────────────────────────
router.get('/mi-barberia', (req, res) => {
    const t = req.tenant;
    res.json({
        idbarberia:          t.idbarberia,
        nombre_negocio:      t.nombre_negocio,
        subdominio:          t.subdominio,
        logo_url:            t.logo_url ?? null,
        color_primario:      t.color_primario ?? '#d4a843',
        // Info negocio
        telefono:            t.telefono ?? '',
        direccion:           t.direccion ?? '',
        correo_negocio:      t.correo_negocio ?? '',
        slogan:              t.slogan ?? '',
        color_portada:       t.color_portada ?? '#ffffff',
        color_nombre_1:      t.color_nombre_1 ?? '#ffffff',
        color_nombre_2:      t.color_nombre_2 ?? '#d4a843',
        texto_portada_1:     t.texto_portada_1 ?? '',
        texto_portada_2:     t.texto_portada_2 ?? '',
        color_header_1:      t.color_header_1 ?? '#ffffff',
        color_header_2:      t.color_header_2 ?? '#d4a843',
        fuente_header:       t.fuente_header ?? 'Cinzel',
        maps_embed:          t.maps_embed ?? '',
        // Horarios
        horario_lv_desde:    t.horario_lv_desde ?? '09:00',
        horario_lv_hasta:    t.horario_lv_hasta ?? '19:00',
        horario_sab_desde:   t.horario_sab_desde ?? '09:00',
        horario_sab_hasta:   t.horario_sab_hasta ?? '15:00',
        domingo_cerrado:     t.domingo_cerrado ?? true,
        // Reservas
        duracion_turno:      t.duracion_turno ?? 40,
        tiempo_cancelacion:  t.tiempo_cancelacion ?? 60,
        tiempo_confirmacion: t.tiempo_confirmacion ?? 60,
        reservas_online:     t.reservas_online ?? true,
        orden_llegada:       t.orden_llegada ?? true,
        dias_inactividad:    t.dias_inactividad ?? 60,
        // Redes sociales
        instagram:           t.instagram ?? '',
        facebook:            t.facebook ?? '',
        whatsapp_negocio:    t.whatsapp_negocio ?? '',
        // Config notificaciones
        notif_nueva_reserva: t.notif_nueva_reserva ?? true,
        notif_recordatorio:  t.notif_recordatorio ?? true,
        notif_barbero:       t.notif_barbero ?? true,
        // Notificaciones
        gmail_remitente:     t.gmail_remitente ?? '',
        whatsapp_barbero:    t.whatsapp_barbero ?? '',
        callmebot_apikey:    t.callmebot_apikey ?? '',
    });
});

router.put('/mi-barberia', soloRoles('admin'), async (req, res) => {
    const b = req.body;
    try {
        const fields = [
            'nombre_negocio','color_primario','telefono','direccion','correo_negocio','slogan','color_portada','color_nombre_1','color_nombre_2','texto_portada_1','texto_portada_2','color_header_1','color_header_2','fuente_header','maps_embed',
            'horario_lv_desde','horario_lv_hasta','horario_sab_desde','horario_sab_hasta','domingo_cerrado',
            'duracion_turno','tiempo_cancelacion','tiempo_confirmacion','reservas_online','orden_llegada','dias_inactividad',
            'instagram','facebook','whatsapp_negocio',
            'gmail_remitente','gmail_password','whatsapp_barbero','callmebot_apikey',
            'notif_nueva_reserva','notif_recordatorio','notif_barbero',
        ];
        const updates = {};
        fields.forEach(f => { if (b[f] !== undefined) updates[f] = b[f]; });
        await EmpresaBarberia.update(updates, { where: { idbarberia: req.usuario.idbarberia } });
        res.json({ mensaje: 'Configuración actualizada.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error interno.' });
    }
});

// ── Barberos ─────────────────────────────────────────────────────────────────
router.get('/barberos', async (req, res) => {
    try {
        const barberos = await Usuario.findAll({
            include: [{
                model: Persona,
                where: { idbarberia: req.usuario.idbarberia },
                attributes: ['nombre_completo', 'telefono', 'correo_electronico', 'foto_url']
            }],
            attributes: ['idusuario', 'rol', 'rating_promedio', 'comision_porcentaje', 'puede_cobrar', 'puede_vender', 'especialidades', 'estado']
        });
        res.json(barberos);
    } catch (error) {
        console.error('Error al listar barberos:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

router.post('/barberos', soloRoles('admin'), async (req, res) => {
    const { nombre_completo, telefono, correo_electronico, password, comision_porcentaje } = req.body;
    if (!nombre_completo || !telefono || !correo_electronico || !password) {
        return res.status(400).json({ error: 'nombre_completo, telefono, correo_electronico y password son obligatorios.' });
    }
    const t = await sequelize.transaction();
    try {
        const persona = await Persona.create(
            { idbarberia: req.usuario.idbarberia, nombre_completo, telefono, correo_electronico },
            { transaction: t }
        );
        const password_hash = await bcrypt.hash(password, 10);
        const usuario = await Usuario.create(
            { idpersona: persona.idpersona, rol: 'barbero', password_hash, comision_porcentaje: comision_porcentaje ?? 0 },
            { transaction: t }
        );
        await t.commit();
        res.status(201).json({ idusuario: usuario.idusuario, persona });
    } catch (error) {
        await t.rollback();
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ error: 'El correo ya está registrado.' });
        }
        console.error('Error al crear barbero:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

router.put('/barberos/:id', soloRoles('admin'), async (req, res) => {
    const { nombre_completo, telefono, correo_electronico, comision_porcentaje } = req.body;
    try {
        const barbero = await Usuario.findOne({
            include: [{ model: Persona, where: { idbarberia: req.usuario.idbarberia } }],
            where: { idusuario: req.params.id },
        });
        if (!barbero) return res.status(404).json({ error: 'Barbero no encontrado.' });
        const updates = {};
        if (nombre_completo) updates.nombre_completo = nombre_completo;
        if (telefono) updates.telefono = telefono;
        if (correo_electronico) updates.correo_electronico = correo_electronico;
        await Persona.update(updates, { where: { idpersona: barbero.idpersona } });
        const usuarioUpdates = {};
        if (comision_porcentaje !== undefined) usuarioUpdates.comision_porcentaje = comision_porcentaje;
        if (req.body.puede_cobrar !== undefined) usuarioUpdates.puede_cobrar = req.body.puede_cobrar;
        if (req.body.puede_vender !== undefined) usuarioUpdates.puede_vender = req.body.puede_vender;
        if (req.body.especialidades !== undefined) usuarioUpdates.especialidades = req.body.especialidades;
        if (Object.keys(usuarioUpdates).length) await barbero.update(usuarioUpdates);
        res.json({ mensaje: 'Barbero actualizado.' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error interno.' });
    }
});

router.patch('/barberos/:id/estado', soloRoles('admin'), async (req, res) => {
    try {
        const barbero = await Usuario.findOne({
            include: [{ model: Persona, where: { idbarberia: req.usuario.idbarberia } }],
            where: { idusuario: req.params.id }
        });
        if (!barbero) return res.status(404).json({ error: 'Barbero no encontrado.' });
        await barbero.update({ estado: req.body.estado });
        res.json({ mensaje: 'Estado actualizado.' });
    } catch (error) {
        console.error('Error al actualizar barbero:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

router.patch('/barberos/:id/password', soloRoles('admin'), async (req, res) => {
    try {
        const barbero = await Usuario.findOne({
            include: [{ model: Persona, where: { idbarberia: req.usuario.idbarberia } }],
            where: { idusuario: req.params.id }
        });
        if (!barbero) return res.status(404).json({ error: 'Barbero no encontrado.' });
        const bcrypt = require('bcryptjs');
        const hash = await bcrypt.hash(req.body.password, 10);
        await barbero.update({ password_hash: hash });
        res.json({ mensaje: 'Contraseña actualizada.' });
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

router.delete('/barberos/:id', soloRoles('admin'), async (req, res) => {
    try {
        const barbero = await Usuario.findOne({
            include: [{ model: Persona, where: { idbarberia: req.usuario.idbarberia } }],
            where: { idusuario: req.params.id }
        });
        if (!barbero) return res.status(404).json({ error: 'Barbero no encontrado.' });
        await barbero.persona.destroy();
        await barbero.destroy();
        res.json({ mensaje: 'Barbero eliminado.' });
    } catch (error) {
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// ── Horarios de barberos ──────────────────────────────────────────────────────
// GET /barberos/:id/horarios — devuelve los 7 días configurados para un barbero
router.get('/barberos/:id/horarios', soloRoles('admin'), async (req, res) => {
    try {
        const barbero = await Usuario.findOne({
            include: [{ model: Persona, where: { idbarberia: req.usuario.idbarberia } }],
            where: { idusuario: req.params.id },
        });
        if (!barbero) return res.status(404).json({ error: 'Barbero no encontrado.' });
        const horarios = await HorariosAtencion.findAll({
            where: { idusuario_barbero: req.params.id },
            order: [['dia_semana', 'ASC']],
        });
        res.json(horarios);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// PUT /barberos/:id/horarios — reemplaza todos los horarios del barbero de una vez
// Body: [{ dia_semana, hora_apertura, hora_cierre }]  (solo los días activos)
router.put('/barberos/:id/horarios', soloRoles('admin'), async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const barbero = await Usuario.findOne({
            include: [{ model: Persona, where: { idbarberia: req.usuario.idbarberia } }],
            where: { idusuario: req.params.id },
            transaction: t,
        });
        if (!barbero) { await t.rollback(); return res.status(404).json({ error: 'Barbero no encontrado.' }); }

        // Borrar todos los horarios existentes y reemplazar
        await HorariosAtencion.destroy({ where: { idusuario_barbero: req.params.id }, transaction: t });

        const nuevos = (req.body ?? []).map(h => ({
            idusuario_barbero: Number(req.params.id),
            dia_semana: h.dia_semana,
            hora_apertura: h.hora_apertura,
            hora_cierre: h.hora_cierre,
        }));
        if (nuevos.length > 0) {
            await HorariosAtencion.bulkCreate(nuevos, { transaction: t });
        }

        await t.commit();
        res.json({ mensaje: 'Horarios actualizados.' });
    } catch (err) {
        await t.rollback();
        console.error(err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// ── Servicios ────────────────────────────────────────────────────────────────
router.get('/servicios', servicioCtrl.listar);
router.post('/servicios', soloRoles('admin'), servicioCtrl.crear);
router.put('/servicios/:id', soloRoles('admin'), servicioCtrl.actualizar);
router.delete('/servicios/:id', soloRoles('admin'), servicioCtrl.eliminar);

// ── Clientes ─────────────────────────────────────────────────────────────────
router.get('/clientes', clienteCtrl.listar);
router.post('/clientes', clienteCtrl.crear);
router.put('/clientes/:id', clienteCtrl.actualizar);
router.delete('/clientes/:id', soloRoles('admin'), clienteCtrl.eliminar);

router.get('/clientes/inactivos', soloRoles('admin'), async (req, res) => {
    try {
        const AgendaTurno = require('../models/AgendaTurno');
        const barberia = await EmpresaBarberia.findOne({ where: { idbarberia: req.usuario.idbarberia } });
        const dias = barberia?.dias_inactividad ?? 60;
        const limite = new Date();
        limite.setDate(limite.getDate() - dias);
        const limiteStr = limite.toISOString().split('T')[0];

        // Clientes que tienen al menos un turno en esta barbería
        const turnosUnicos = await AgendaTurno.findAll({
            where: { idbarberia: req.usuario.idbarberia },
            attributes: ['idcliente'],
            group: ['idcliente'],
            raw: true,
        });
        const idsClientes = [...new Set(turnosUnicos.map(t => t.idcliente).filter(Boolean))];

        const clientes = await Cliente.findAll({
            where: { idcliente: idsClientes },
            include: [{ model: Persona, attributes: ['nombre_completo', 'telefono', 'correo_electronico'] }],
        });

        const inactivos = [];
        for (const c of clientes) {
            const ultimo = await AgendaTurno.findOne({
                where: {
                    idcliente: c.idcliente,
                    idbarberia: req.usuario.idbarberia,
                    estado: { [Op.in]: ['atendido', 'cobrado'] },
                },
                order: [['fecha', 'DESC']],
                attributes: ['fecha'],
            });
            const ultimaFecha = ultimo?.fecha ?? null;
            if (!ultimaFecha || ultimaFecha <= limiteStr) {
                inactivos.push({
                    idcliente: c.idcliente,
                    persona: c.persona,
                    ultima_visita: ultimaFecha,
                    dias_inactivo: ultimaFecha
                        ? Math.floor((Date.now() - new Date(ultimaFecha).getTime()) / (1000 * 60 * 60 * 24))
                        : null,
                });
            }
        }
        res.json({ dias_config: dias, inactivos });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno.' }); }
});

router.post('/clientes/enviar-promo', soloRoles('admin'), async (req, res) => {
    try {
        const { ids, mensaje } = req.body;
        if (!ids?.length || !mensaje) return res.status(400).json({ error: 'Faltan campos.' });
        const { enviarMensajeLibre } = require('../services/whatsappService');
        const { enviarEmailPromo } = require('../services/emailService');

        const clientes = await Cliente.findAll({
            where: { idcliente: ids },
            include: [{ model: Persona, attributes: ['nombre_completo', 'telefono', 'correo_electronico'] }],
        });
        const barberia = await EmpresaBarberia.findOne({ where: { idbarberia: req.usuario.idbarberia } });

        let enviados = 0;
        for (const c of clientes) {
            const tel = c.persona.telefono;
            const email = c.persona.correo_electronico;
            const nombre = c.persona.nombre_completo;
            const textoFinal = mensaje.replace('{nombre}', nombre.split(' ')[0]);
            if (tel) { try { await enviarMensajeLibre({ telefono: tel, mensaje: textoFinal, barberia }); enviados++; } catch {} }
            if (email) { try { await enviarEmailPromo({ email, nombre, mensaje: textoFinal, barberia }); } catch {} }
        }
        // Notificación
        const { registrar: registrarNotif } = require('../services/notificacionService');
        await registrarNotif({
            idbarberia: req.usuario.idbarberia,
            idusuario_barbero: req.usuario.idusuario,
            tipo: 'promocion',
            titulo: 'Promo enviada a clientes inactivos',
            mensaje: `Mensaje enviado a ${enviados} de ${clientes.length} clientes inactivos`,
        });

        res.json({ enviados, total: clientes.length });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno.' }); }
});

router.get('/clientes/:id/turnos', soloRoles('admin', 'barbero'), async (req, res) => {
    try {
        const AgendaTurno = require('../models/AgendaTurno');
        const turnos = await AgendaTurno.findAll({
            where: { idcliente: req.params.id, idbarberia: req.usuario.idbarberia },
            include: [
                { model: Servicio, attributes: ['nombre_servicio', 'precio'] },
                { model: Usuario, as: 'barbero', include: [{ model: Persona, attributes: ['nombre_completo'] }] },
            ],
            order: [['fecha', 'DESC'], ['hora_inicio', 'DESC']],
        });
        res.json(turnos);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error interno.' });
    }
});

// ── Turnos ───────────────────────────────────────────────────────────────────
router.get('/turnos', turnoCtrl.listar);           // ?fecha=YYYY-MM-DD  (admin ve todos)
router.get('/turnos/mis-turnos', turnoCtrl.listar); // ?fecha=YYYY-MM-DD  (barbero ve solo los suyos — el controller filtra por req.usuario)
router.post('/turnos', turnoCtrl.crear);
router.patch('/turnos/:id/estado', turnoCtrl.actualizarEstado);

// ── Pagos / Caja ─────────────────────────────────────────────────────────────
router.get('/pagos', soloRoles('admin', 'barbero'), async (req, res) => {
    try {
        const PagoServicio = require('../models/PagoServicio');
        const AgendaTurno  = require('../models/AgendaTurno');
        const Cliente      = require('../models/Cliente');
        const { desde, hasta } = req.query;
        const where = { idbarberia: req.usuario.idbarberia };
        if (desde || hasta) {
            where.fecha_pago = {};
            if (desde) where.fecha_pago[Op.gte] = new Date(desde + 'T00:00:00');
            if (hasta) where.fecha_pago[Op.lte] = new Date(hasta + 'T23:59:59');
        }
        const pagos = await PagoServicio.findAll({
            where,
            include: [{
                model: AgendaTurno,
                as: 'agenda_turno',
                include: [
                    { model: Servicio, attributes: ['nombre_servicio'] },
                    { model: Cliente, include: [{ model: Persona, attributes: ['nombre_completo'] }] },
                    { model: Usuario, as: 'barbero', include: [{ model: Persona, attributes: ['nombre_completo'] }] },
                ],
            }],
            order: [['fecha_pago', 'DESC']],
        });
        res.json(pagos);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno.' }); }
});

router.post('/pagos/migrar-cobrados', soloRoles('admin'), async (req, res) => {
    try {
        const PagoServicio = require('../models/PagoServicio');
        const AgendaTurno  = require('../models/AgendaTurno');
        const pagos = await PagoServicio.findAll({ where: { idbarberia: req.usuario.idbarberia }, attributes: ['idagenda'] });
        const ids = pagos.map(p => p.idagenda);
        if (!ids.length) return res.json({ actualizados: 0 });
        const [n] = await AgendaTurno.update(
            { estado: 'cobrado' },
            { where: { idagenda: ids, estado: 'atendido', idbarberia: req.usuario.idbarberia } }
        );
        res.json({ actualizados: n });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno.' }); }
});

router.get('/pagos/turnos-pendientes', soloRoles('admin', 'barbero'), async (req, res) => {
    try {
        const PagoServicio = require('../models/PagoServicio');
        const AgendaTurno  = require('../models/AgendaTurno');
        const Cliente      = require('../models/Cliente');
        const whereExtra = req.usuario.rol === 'barbero' ? { idusuario_barbero: req.usuario.idusuario } : {};
        const turnos = await AgendaTurno.findAll({
            where: { idbarberia: req.usuario.idbarberia, estado: 'atendido', ...whereExtra },
            include: [
                { model: Servicio, attributes: ['nombre_servicio', 'precio'] },
                { model: Cliente, include: [{ model: Persona, attributes: ['nombre_completo'] }] },
                { model: Usuario, as: 'barbero', include: [{ model: Persona, attributes: ['nombre_completo'] }] },
            ],
            order: [['fecha', 'DESC'], ['hora_inicio', 'DESC']],
        });
        res.json(turnos);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno.' }); }
});

router.post('/pagos', soloRoles('admin', 'barbero'), async (req, res) => {
    try {
        const PagoServicio = require('../models/PagoServicio');
        const AgendaTurno  = require('../models/AgendaTurno');
        const { idagenda, monto_pago, metodo_pago } = req.body;
        if (!idagenda || !monto_pago || !metodo_pago) return res.status(400).json({ error: 'Faltan campos.' });
        const turno = await AgendaTurno.findOne({ where: { idagenda, idbarberia: req.usuario.idbarberia } });
        if (!turno) return res.status(404).json({ error: 'Turno no encontrado.' });
        const ya = await PagoServicio.findOne({ where: { idagenda } });
        if (ya) return res.status(409).json({ error: 'Este turno ya tiene un pago registrado.' });
        const comision = req.usuario.comision_porcentaje ?? 0;
        const monto_comision_barbero = parseFloat(((monto_pago * comision) / 100).toFixed(2));
        const pago = await PagoServicio.create({
            idbarberia: req.usuario.idbarberia,
            idagenda,
            monto_pago,
            monto_comision_barbero,
            metodo_pago,
        });
        await turno.update({ estado: 'cobrado' });

        // Notificación
        const { registrar: registrarNotif } = require('../services/notificacionService');
        const fmt = n => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(n);
        await registrarNotif({
            idbarberia: req.usuario.idbarberia,
            idusuario_barbero: turno.idusuario_barbero,
            tipo: 'pago',
            titulo: 'Pago registrado',
            mensaje: `${fmt(monto_pago)} cobrado en ${metodo_pago} — turno #${idagenda}`,
        });

        res.status(201).json(pago);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno.' }); }
});

router.get('/pagos/resumen', soloRoles('admin'), async (req, res) => {
    try {
        const PagoServicio = require('../models/PagoServicio');
        const { desde, hasta } = req.query;
        const hoy = new Date().toISOString().split('T')[0];
        const desdeFecha = new Date((desde ?? hoy) + 'T00:00:00');
        const hastaFecha = new Date((hasta ?? hoy) + 'T23:59:59');
        const [pagos, ventas] = await Promise.all([
            PagoServicio.findAll({
                where: { idbarberia: req.usuario.idbarberia, fecha_pago: { [Op.between]: [desdeFecha, hastaFecha] } },
            }),
            VentaProducto.findAll({
                where: { idbarberia: req.usuario.idbarberia, fecha_venta: { [Op.between]: [desdeFecha, hastaFecha] } },
            }),
        ]);
        const sumar = (arr, campo) => arr.reduce((s, p) => s + parseFloat(p[campo] ?? 0), 0);
        const filtrar = (arr, campo, metodo) => arr.filter(p => p.metodo_pago === metodo).reduce((s, p) => s + parseFloat(p[campo] ?? 0), 0);
        const total = sumar(pagos, 'monto_pago') + sumar(ventas, 'monto_total');
        const efectivo = filtrar(pagos, 'monto_pago', 'efectivo') + filtrar(ventas, 'monto_total', 'efectivo');
        const transferencia = filtrar(pagos, 'monto_pago', 'transferencia') + filtrar(ventas, 'monto_total', 'transferencia');
        const tarjeta = filtrar(pagos, 'monto_pago', 'tarjeta') + filtrar(ventas, 'monto_total', 'tarjeta');
        res.json({ total, efectivo, transferencia, tarjeta, cantidad: pagos.length + ventas.length });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno.' }); }
});

// ── Ventas de productos ───────────────────────────────────────────────────────
router.get('/ventas', soloRoles('admin', 'barbero'), async (req, res) => {
    try {
        const { desde, hasta } = req.query;
        const where = { idbarberia: req.usuario.idbarberia };
        if (desde || hasta) {
            where.fecha_venta = {};
            if (desde) where.fecha_venta[Op.gte] = new Date(desde + 'T00:00:00');
            if (hasta) where.fecha_venta[Op.lte] = new Date(hasta + 'T23:59:59');
        }
        if (req.usuario.rol === 'barbero') where.idusuario_barbero = req.usuario.idusuario;
        const ventas = await VentaProducto.findAll({
            where,
            include: [
                { model: Producto, attributes: ['nombre_producto'] },
                { model: Cliente, required: false, include: [{ model: Persona, attributes: ['nombre_completo'] }] },
                { model: Usuario, as: 'barbero', include: [{ model: Persona, attributes: ['nombre_completo'] }] },
            ],
            order: [['fecha_venta', 'DESC']],
        });
        res.json(ventas);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno.' }); }
});

router.post('/ventas', soloRoles('admin', 'barbero'), async (req, res) => {
    const t = await sequelize.transaction();
    try {
        const { idproducto, cantidad, metodo_pago } = req.body;
        if (!idproducto || !cantidad || !metodo_pago) { await t.rollback(); return res.status(400).json({ error: 'Faltan campos.' }); }
        const producto = await Producto.findOne({ where: { idproducto, idbarberia: req.usuario.idbarberia }, transaction: t });
        if (!producto) { await t.rollback(); return res.status(404).json({ error: 'Producto no encontrado.' }); }
        if (producto.stock_actual < cantidad) { await t.rollback(); return res.status(400).json({ error: `Stock insuficiente. Disponible: ${producto.stock_actual}` }); }
        const monto_total = parseFloat((producto.precio_venta * cantidad).toFixed(2));
        await VentaProducto.create({
            idbarberia: req.usuario.idbarberia,
            idproducto,
            idusuario_barbero: req.usuario.idusuario,
            cantidad,
            precio_unitario_historico: producto.precio_venta,
            monto_total,
            metodo_pago,
        }, { transaction: t });
        await Producto.update(
            { stock_actual: producto.stock_actual - cantidad },
            { where: { idproducto }, transaction: t }
        );
        await t.commit();
        res.status(201).json({ mensaje: 'Venta registrada.', monto_total, stock_restante: producto.stock_actual - cantidad });
    } catch (err) { await t.rollback(); console.error(err); res.status(500).json({ error: 'Error interno.' }); }
});

// ── Reportes ─────────────────────────────────────────────────────────────────
router.get('/reportes', soloRoles('admin'), async (req, res) => {
    try {
        const AgendaTurno = require('../models/AgendaTurno');
        const PagoServicio = require('../models/PagoServicio');
        const hoy = new Date().toISOString().split('T')[0];
        const { desde = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0], hasta = hoy } = req.query;
        const desdeDT = new Date(desde + 'T00:00:00');
        const hastaDT = new Date(hasta + 'T23:59:59');
        const idbarberia = req.usuario.idbarberia;

        // Pagos del período
        const pagos = await PagoServicio.findAll({
            where: { idbarberia, fecha_pago: { [Op.between]: [desdeDT, hastaDT] } },
            include: [{ model: AgendaTurno, as: 'agenda_turno', include: [
                { model: Servicio, attributes: ['nombre_servicio'] },
                { model: Usuario, as: 'barbero', include: [{ model: Persona, attributes: ['nombre_completo'] }] },
            ]}],
        });

        // Ventas del período
        const ventas = await VentaProducto.findAll({
            where: { idbarberia, fecha_venta: { [Op.between]: [desdeDT, hastaDT] } },
            include: [{ model: Producto, attributes: ['nombre_producto'] }],
        });

        // Turnos del período
        const turnos = await AgendaTurno.findAll({
            where: { idbarberia, fecha: { [Op.between]: [desde, hasta] } },
            include: [
                { model: Servicio, attributes: ['nombre_servicio', 'precio'] },
                { model: Usuario, as: 'barbero', include: [{ model: Persona, attributes: ['nombre_completo'] }] },
            ],
        });

        // ── Resumen general ──
        const ingresos_servicios = pagos.reduce((s, p) => s + parseFloat(p.monto_pago), 0);
        const ingresos_productos = ventas.reduce((s, v) => s + parseFloat(v.monto_total), 0);
        const ingresos_total = ingresos_servicios + ingresos_productos;
        // Cobrados en el período = cantidad de pagos registrados
        const turnos_atendidos = pagos.length;
        // También sumar los marcados atendido (sin cobrar aún) en el período
        const atendidos_sin_cobrar = turnos.filter(t => t.estado === 'atendido').length;
        const ticket_promedio = turnos_atendidos > 0 ? ingresos_servicios / turnos_atendidos : 0;
        const productos_vendidos = ventas.reduce((s, v) => s + v.cantidad, 0);
        const turnos_ausentes = turnos.filter(t => t.estado === 'ausente').length;
        const turnos_cancelados = turnos.filter(t => t.estado === 'cancelado').length;

        // ── Ingresos por día ──
        const ingresosPorDia = {};
        pagos.forEach(p => {
            const dia = new Date(p.fecha_pago).toISOString().split('T')[0];
            ingresosPorDia[dia] = (ingresosPorDia[dia] ?? 0) + parseFloat(p.monto_pago);
        });
        ventas.forEach(v => {
            const dia = new Date(v.fecha_venta).toISOString().split('T')[0];
            ingresosPorDia[dia] = (ingresosPorDia[dia] ?? 0) + parseFloat(v.monto_total);
        });

        // ── Métodos de pago (servicios + productos) ──
        const metodos = { efectivo: 0, transferencia: 0, tarjeta: 0 };
        pagos.forEach(p => { metodos[p.metodo_pago] = (metodos[p.metodo_pago] ?? 0) + parseFloat(p.monto_pago); });
        ventas.forEach(v => { metodos[v.metodo_pago] = (metodos[v.metodo_pago] ?? 0) + parseFloat(v.monto_total); });

        // ── Turnos por estado (basado en pagos del período + turnos del período)
        const porEstado = {};
        // Cobrados en el período (por fecha de pago)
        pagos.forEach(p => { porEstado['cobrado'] = (porEstado['cobrado'] ?? 0) + 1; });
        // Resto de estados por fecha del turno
        turnos.filter(t => t.estado !== 'cobrado').forEach(t => { porEstado[t.estado] = (porEstado[t.estado] ?? 0) + 1; });

        // ── Ranking barberos ──
        const barberos = {};
        pagos.forEach(p => {
            const nombre = p.agenda_turno?.barbero?.persona?.nombre_completo ?? 'Sin nombre';
            if (!barberos[nombre]) barberos[nombre] = { turnos: 0, ingresos: 0 };
            barberos[nombre].ingresos += parseFloat(p.monto_pago);
            barberos[nombre].turnos += 1;
        });

        // ── Servicios más solicitados (contados desde pagos del período) ──
        const servicios = {};
        pagos.forEach(p => {
            const turno = p.agenda_turno;
            const nombre = turno?.servicio?.nombre_servicio ?? turno?.Servicio?.nombre_servicio ?? 'Sin nombre';
            if (nombre !== 'Sin nombre') servicios[nombre] = (servicios[nombre] ?? 0) + 1;
        });

        // ── Productos más vendidos ──
        const productos = {};
        ventas.forEach(v => {
            const nombre = v.producto?.nombre_producto ?? 'Sin nombre';
            if (!productos[nombre]) productos[nombre] = { cantidad: 0, ingresos: 0 };
            productos[nombre].cantidad += v.cantidad;
            productos[nombre].ingresos += parseFloat(v.monto_total);
        });

        // ── Gastos del período ──
        const Gastos = require('../models/Gastos');
        const gastosRows = await Gastos.findAll({
            where: { idbarberia, fecha_gasto: { [Op.between]: [desde, hasta] } },
            raw: true,
        });
        const gastos_total = gastosRows.reduce((s, g) => s + parseFloat(g.monto), 0);
        const ganancia_neta = ingresos_total - gastos_total;

        res.json({
            resumen: { ingresos_total, ingresos_servicios, ingresos_productos, turnos_atendidos, atendidos_sin_cobrar, ticket_promedio, productos_vendidos, turnos_ausentes, turnos_cancelados, gastos_total, ganancia_neta },
            ingresos_por_dia: Object.entries(ingresosPorDia).sort(([a],[b]) => a.localeCompare(b)).map(([fecha, total]) => ({ fecha, total })),
            metodos_pago: Object.entries(metodos).map(([metodo, total]) => ({ metodo, total })),
            turnos_por_estado: Object.entries(porEstado).map(([estado, cantidad]) => ({ estado, cantidad })),
            ranking_barberos: Object.entries(barberos).sort((a,b) => b[1].ingresos - a[1].ingresos).map(([nombre, d]) => ({ nombre, ...d })),
            servicios_top: Object.entries(servicios).sort((a,b) => b[1]-a[1]).slice(0,10).map(([nombre, cantidad]) => ({ nombre, cantidad })),
            productos_top: Object.entries(productos).sort((a,b) => b[1].cantidad-a[1].cantidad).slice(0,10).map(([nombre, d]) => ({ nombre, ...d })),
        });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno.' }); }
});

// ── Productos ────────────────────────────────────────────────────────────────
router.get('/productos', productoCtrl.listar);
router.post('/productos', soloRoles('admin'), productoCtrl.crear);
router.put('/productos/:id', soloRoles('admin'), productoCtrl.actualizar);

// ── Gastos ────────────────────────────────────────────────────────────────────
const Gastos = require('../models/Gastos');

router.get('/gastos', soloRoles('admin'), async (req, res) => {
    try {
        const { desde, hasta, categoria } = req.query;
        const where = { idbarberia: req.usuario.idbarberia };
        if (desde || hasta) {
            where.fecha_gasto = {};
            if (desde) where.fecha_gasto[Op.gte] = desde;
            if (hasta) where.fecha_gasto[Op.lte] = hasta;
        }
        if (categoria && categoria !== 'all') where.categoria_gasto = categoria;
        const data = await Gastos.findAll({ where, order: [['fecha_gasto', 'DESC']] });
        res.json(data);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno.' }); }
});

router.post('/gastos', soloRoles('admin'), async (req, res) => {
    try {
        const { descripcion, monto, categoria_gasto, fecha_gasto } = req.body;
        if (!descripcion || !monto || !categoria_gasto || !fecha_gasto)
            return res.status(400).json({ error: 'Faltan campos.' });
        const g = await Gastos.create({ idbarberia: req.usuario.idbarberia, descripcion, monto, categoria_gasto, fecha_gasto });
        res.status(201).json(g);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno.' }); }
});

router.put('/gastos/:id', soloRoles('admin'), async (req, res) => {
    try {
        const g = await Gastos.findOne({ where: { idgasto: req.params.id, idbarberia: req.usuario.idbarberia } });
        if (!g) return res.status(404).json({ error: 'No encontrado.' });
        const { descripcion, monto, categoria_gasto, fecha_gasto } = req.body;
        await g.update({ descripcion, monto, categoria_gasto, fecha_gasto });
        res.json(g);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno.' }); }
});

router.delete('/gastos/:id', soloRoles('admin'), async (req, res) => {
    try {
        const g = await Gastos.findOne({ where: { idgasto: req.params.id, idbarberia: req.usuario.idbarberia } });
        if (!g) return res.status(404).json({ error: 'No encontrado.' });
        await g.destroy();
        res.json({ mensaje: 'Eliminado.' });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno.' }); }
});

// ── Upload de imágenes ────────────────────────────────────────────────────────

// ── Notificaciones ───────────────────────────────────────────────────────────
const Notificaciones = require('../models/Notificaciones');

router.get('/notificaciones', async (req, res) => {
    try {
        const data = await Notificaciones.findAll({
            where: { idbarberia: req.usuario.idbarberia },
            order: [['fecha_creacion', 'DESC']],
            limit: 50,
        });
        res.json(data);
    } catch (err) { console.error(err); res.status(500).json({ error: 'Error interno.' }); }
});

router.patch('/notificaciones/:id/leer', async (req, res) => {
    try {
        await Notificaciones.update({ leido: true }, { where: { idnotificacion: req.params.id, idbarberia: req.usuario.idbarberia } });
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: 'Error interno.' }); }
});

router.patch('/notificaciones/leer-todas', async (req, res) => {
    try {
        await Notificaciones.update({ leido: true }, { where: { idbarberia: req.usuario.idbarberia } });
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: 'Error interno.' }); }
});

router.delete('/notificaciones/:id', async (req, res) => {
    try {
        await Notificaciones.destroy({ where: { idnotificacion: req.params.id, idbarberia: req.usuario.idbarberia } });
        res.json({ ok: true });
    } catch (err) { res.status(500).json({ error: 'Error interno.' }); }
});

// ── Prueba de notificaciones ──────────────────────────────────────────────────
router.post('/notificaciones/prueba-email', soloRoles('admin', 'owner'), async (req, res) => {
    try {
        const { enviarEmailPromo } = require('../services/emailService');
        const barberia = await EmpresaBarberia.findOne({ where: { idbarberia: req.usuario.idbarberia } });
        const destinatario = barberia?.gmail_remitente || req.usuario.correo_electronico;
        if (!destinatario)
            return res.status(400).json({ error: 'No hay correo configurado.' });
        await enviarEmailPromo({ email: destinatario, nombre: 'Administrador', mensaje: 'Este es un email de prueba desde tu sistema de barbería. ¡Todo funciona correctamente!', barberia: barberia ?? { nombre_negocio: 'BarberSystem', gmail_remitente: null, gmail_password: null } });
        res.json({ mensaje: 'Email de prueba enviado a ' + destinatario });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Error al enviar: ' + err.message }); }
});

router.post('/notificaciones/prueba-whatsapp', soloRoles('admin', 'owner'), async (req, res) => {
    try {
        const { enviarMensajeLibre } = require('../services/whatsappService');
        const barberia = await EmpresaBarberia.findOne({ where: { idbarberia: req.usuario.idbarberia } });
        if (!barberia?.whatsapp_barbero)
            return res.status(400).json({ error: 'No hay número de WhatsApp configurado.' });
        await enviarMensajeLibre({ telefono: barberia.whatsapp_barbero, mensaje: `✅ Prueba de WhatsApp desde ${barberia.nombre_negocio}. ¡Todo funciona!`, barberia });
        res.json({ mensaje: 'Mensaje de prueba enviado a ' + barberia.whatsapp_barbero });
    } catch (err) { console.error(err); res.status(500).json({ error: 'Error al enviar: ' + err.message }); }
});

// Foto propia del barbero (cualquier barbero puede subir la suya)
router.post('/mi-perfil/foto', (req, res) => {
    makeUpload('barberos').single(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen.' });
        try {
            const usuario = await Usuario.findByPk(req.usuario.idusuario);
            await Persona.update(
                { foto_url: req.file.path },
                { where: { idpersona: usuario.idpersona } }
            );
            res.json({ foto_url: req.file.path });
        } catch (e) {
            res.status(500).json({ error: 'Error al guardar la foto.' });
        }
    });
});

// Logo de la barbería
router.post('/mi-barberia/logo', soloRoles('admin'), (req, res, next) => {
    makeUpload('logos').single(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen.' });
        try {
            await EmpresaBarberia.update(
                { logo_url: req.file.path },
                { where: { idbarberia: req.usuario.idbarberia } }
            );
            res.json({ logo_url: req.file.path });
        } catch (e) {
            res.status(500).json({ error: 'Error al guardar el logo.' });
        }
    });
});

// ── Carrusel ──────────────────────────────────────────────────────────────────
const ImagenCarrusel = require('../models/ImagenCarrusel');

router.get('/carrusel', soloRoles('admin'), async (req, res) => {
    const imgs = await ImagenCarrusel.findAll({ where: { idbarberia: req.usuario.idbarberia }, order: [['orden', 'ASC'], ['idimagen', 'ASC']] });
    res.json(imgs);
});

router.post('/carrusel', soloRoles('admin'), (req, res) => {
    makeUpload('carrusel').multiple(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        const files = req.files ?? [];
        if (files.length === 0) return res.status(400).json({ error: 'No se recibieron imágenes.' });
        try {
            let count = await ImagenCarrusel.count({ where: { idbarberia: req.usuario.idbarberia } });
            const imgs = await Promise.all(files.map(f => ImagenCarrusel.create({ idbarberia: req.usuario.idbarberia, url: f.path, orden: count++ })));
            res.json(imgs);
        } catch (e) { res.status(500).json({ error: 'Error al guardar imágenes.' }); }
    });
});

router.delete('/carrusel/:id', soloRoles('admin'), async (req, res) => {
    try {
        const img = await ImagenCarrusel.findOne({ where: { idimagen: req.params.id, idbarberia: req.usuario.idbarberia } });
        if (!img) return res.status(404).json({ error: 'Imagen no encontrada.' });
        const { cloudinary } = require('../middlewares/uploadMiddleware');
        const publicId = img.url.split('/').slice(-2).join('/').replace(/\.[^.]+$/, '');
        try { await cloudinary.uploader.destroy(publicId); } catch {}
        await img.destroy();
        res.json({ mensaje: 'Imagen eliminada.' });
    } catch (e) { res.status(500).json({ error: 'Error al eliminar imagen.' }); }
});

// Foto de servicio
router.post('/servicios/:id/imagen', soloRoles('admin'), (req, res, next) => {
    makeUpload('servicios').single(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen.' });
        try {
            const servicio = await Servicio.findOne({ where: { idservicio: req.params.id, idbarberia: req.usuario.idbarberia } });
            if (!servicio) return res.status(404).json({ error: 'Servicio no encontrado.' });
            await servicio.update({ imagen_url: req.file.path });
            res.json({ imagen_url: req.file.path });
        } catch (e) {
            res.status(500).json({ error: 'Error al guardar la imagen.' });
        }
    });
});

// Foto de barbero
router.post('/barberos/:id/foto', soloRoles('admin'), (req, res, next) => {
    makeUpload('barberos').single(req, res, async (err) => {
        if (err) return res.status(400).json({ error: err.message });
        if (!req.file) return res.status(400).json({ error: 'No se recibió ninguna imagen.' });
        try {
            const barbero = await Usuario.findOne({
                include: [{ model: Persona, where: { idbarberia: req.usuario.idbarberia } }],
                where: { idusuario: req.params.id },
            });
            if (!barbero) return res.status(404).json({ error: 'Barbero no encontrado.' });
            await Persona.update(
                { foto_url: req.file.path },
                { where: { idpersona: barbero.idpersona } }
            );
            res.json({ foto_url: req.file.path });
        } catch (e) {
            res.status(500).json({ error: 'Error al guardar la foto.' });
        }
    });
});

module.exports = router;
