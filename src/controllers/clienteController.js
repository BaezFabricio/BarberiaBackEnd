const { Op } = require('sequelize');
const sequelize = require('../../config/database');
const Cliente = require('../models/Cliente');
const Persona = require('../models/Persona');

const listar = async (req, res) => {
    try {
        const AgendaTurno = require('../models/AgendaTurno');
        const clientes = await Cliente.findAll({
            include: [{
                model: Persona,
                where: { idbarberia: req.usuario.idbarberia },
                attributes: ['nombre_completo', 'telefono', 'correo_electronico', 'fecha_registro']
            }],
            where: { estado: 'activo' },
            order: [[Persona, 'nombre_completo', 'ASC']]
        });

        // Contar turnos cobrados por cliente
        const ids = clientes.map(c => c.idcliente);
        const conteos = await AgendaTurno.findAll({
            attributes: ['idcliente', [sequelize.fn('COUNT', sequelize.col('idagenda')), 'total']],
            where: { idcliente: ids, idbarberia: req.usuario.idbarberia, estado: 'cobrado' },
            group: ['idcliente'],
            raw: true,
        });
        const mapaConteos = {};
        conteos.forEach(c => { mapaConteos[c.idcliente] = Number(c.total); });

        const resultado = clientes.map(c => ({
            ...c.toJSON(),
            total_turnos: mapaConteos[c.idcliente] ?? 0,
        }));

        res.json(resultado);
    } catch (error) {
        console.error('Error al listar clientes:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const crear = async (req, res) => {
    const { nombre_completo, telefono, correo_electronico, notas_cliente } = req.body;
    if (!nombre_completo || !telefono) {
        return res.status(400).json({ error: 'nombre_completo y telefono son obligatorios.' });
    }
    const t = await sequelize.transaction();
    try {
        const persona = await Persona.create(
            { idbarberia: req.usuario.idbarberia, nombre_completo, telefono, correo_electronico },
            { transaction: t }
        );
        const cliente = await Cliente.create(
            { idpersona: persona.idpersona, notas_cliente },
            { transaction: t }
        );
        await t.commit();
        res.status(201).json({ ...cliente.toJSON(), persona });
    } catch (error) {
        await t.rollback();
        console.error('Error al crear cliente:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const actualizar = async (req, res) => {
    try {
        const cliente = await Cliente.findOne({
            include: [{ model: Persona, where: { idbarberia: req.usuario.idbarberia } }],
            where: { idcliente: req.params.id }
        });
        if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado.' });

        const { nombre_completo, telefono, correo_electronico, notas_cliente } = req.body;
        await cliente.persona.update({ nombre_completo, telefono, correo_electronico });
        if (notas_cliente !== undefined) await cliente.update({ notas_cliente });

        res.json({ mensaje: 'Cliente actualizado.' });
    } catch (error) {
        console.error('Error al actualizar cliente:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const eliminar = async (req, res) => {
    try {
        const cliente = await Cliente.findOne({
            include: [{ model: Persona, where: { idbarberia: req.usuario.idbarberia } }],
            where: { idcliente: req.params.id }
        });
        if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado.' });
        await cliente.update({ estado: 'inactivo' });
        res.json({ mensaje: 'Cliente eliminado.' });
    } catch (error) {
        console.error('Error al eliminar cliente:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

module.exports = { listar, crear, actualizar, eliminar };
