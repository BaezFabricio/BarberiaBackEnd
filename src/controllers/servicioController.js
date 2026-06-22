const Servicio = require('../models/Servicio');

const listar = async (req, res) => {
    try {
        const servicios = await Servicio.findAll({
            where: { idbarberia: req.usuario.idbarberia },
            order: [['nombre_servicio', 'ASC']]
        });
        res.json(servicios);
    } catch (error) {
        console.error('Error al listar servicios:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const crear = async (req, res) => {
    const { nombre_servicio, descripcion, precio, duracion_minutos } = req.body;
    if (!nombre_servicio || !precio || !duracion_minutos) {
        return res.status(400).json({ error: 'nombre_servicio, precio y duracion_minutos son obligatorios.' });
    }
    try {
        const servicio = await Servicio.create({
            idbarberia: req.usuario.idbarberia,
            nombre_servicio, descripcion, precio, duracion_minutos
        });
        res.status(201).json(servicio);
    } catch (error) {
        console.error('Error al crear servicio:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const actualizar = async (req, res) => {
    try {
        const servicio = await Servicio.findOne({
            where: { idservicio: req.params.id, idbarberia: req.usuario.idbarberia }
        });
        if (!servicio) return res.status(404).json({ error: 'Servicio no encontrado.' });

        await servicio.update(req.body);
        res.json(servicio);
    } catch (error) {
        console.error('Error al actualizar servicio:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const eliminar = async (req, res) => {
    try {
        const servicio = await Servicio.findOne({
            where: { idservicio: req.params.id, idbarberia: req.usuario.idbarberia }
        });
        if (!servicio) return res.status(404).json({ error: 'Servicio no encontrado.' });

        await servicio.update({ estado: 'inactivo' });
        res.json({ mensaje: 'Servicio desactivado.' });
    } catch (error) {
        console.error('Error al eliminar servicio:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

module.exports = { listar, crear, actualizar, eliminar };
