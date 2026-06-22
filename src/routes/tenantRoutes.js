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
            attributes: ['idusuario', 'rol', 'rating_promedio', 'comision_porcentaje'],
        });
        if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado.' });
        res.json({
            idusuario: usuario.idusuario,
            rol: usuario.rol,
            rating_promedio: usuario.rating_promedio,
            comision_porcentaje: usuario.comision_porcentaje,
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
    res.json({
        idbarberia: req.tenant.idbarberia,
        nombre_negocio: req.tenant.nombre_negocio,
        subdominio: req.tenant.subdominio,
        logo_url: req.tenant.logo_url ?? null,
        color_primario: req.tenant.color_primario ?? '#d4a843',
    });
});

router.put('/mi-barberia', soloRoles('admin'), async (req, res) => {
    const { color_primario, nombre_negocio } = req.body;
    try {
        const updates = {};
        if (color_primario) updates.color_primario = color_primario;
        if (nombre_negocio) updates.nombre_negocio = nombre_negocio;
        await EmpresaBarberia.update(updates, { where: { idbarberia: req.usuario.idbarberia } });
        res.json({ mensaje: 'Configuración actualizada.' });
    } catch (err) {
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
            where: { estado: 'activo' },
            attributes: ['idusuario', 'rol', 'rating_promedio', 'comision_porcentaje']
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

// ── Turnos ───────────────────────────────────────────────────────────────────
router.get('/turnos', turnoCtrl.listar);           // ?fecha=YYYY-MM-DD  (admin ve todos)
router.get('/turnos/mis-turnos', turnoCtrl.listar); // ?fecha=YYYY-MM-DD  (barbero ve solo los suyos — el controller filtra por req.usuario)
router.post('/turnos', turnoCtrl.crear);
router.patch('/turnos/:id/estado', turnoCtrl.actualizarEstado);

// ── Productos ────────────────────────────────────────────────────────────────
router.get('/productos', productoCtrl.listar);
router.post('/productos', soloRoles('admin'), productoCtrl.crear);
router.put('/productos/:id', soloRoles('admin'), productoCtrl.actualizar);

// ── Upload de imágenes ────────────────────────────────────────────────────────

// Foto propia del barbero (cualquier barbero puede subir la suya)
router.post('/mi-perfil/foto', (req, res) => {
    makeUpload('barberos')(req, res, async (err) => {
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
    makeUpload('logos')(req, res, async (err) => {
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

// Foto de servicio
router.post('/servicios/:id/imagen', soloRoles('admin'), (req, res, next) => {
    makeUpload('servicios')(req, res, async (err) => {
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
    makeUpload('barberos')(req, res, async (err) => {
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
