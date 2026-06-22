const sequelize = require('../../config/database');
const AgendaTurno = require('../models/AgendaTurno');
const Servicio = require('../models/Servicio');
const Cliente = require('../models/Cliente');
const Persona = require('../models/Persona');
const Usuario = require('../models/Usuario');

const listar = async (req, res) => {
    const { fecha } = req.query; // ?fecha=YYYY-MM-DD (opcional)
    const { Op } = require('sequelize');
    const where = { idbarberia: req.usuario.idbarberia, estado: { [Op.ne]: 'archivado' } };
    if (fecha) where.fecha = fecha;
    // El barbero solo ve sus propios turnos
    if (req.usuario.rol === 'barbero') where.idusuario_barbero = req.usuario.idusuario;

    try {
        const turnos = await AgendaTurno.findAll({
            where,
            include: [
                { model: Servicio, attributes: ['nombre_servicio', 'precio', 'duracion_minutos'] },
                {
                    model: Cliente,
                    required: false,
                    include: [{ model: Persona, attributes: ['nombre_completo', 'telefono'] }]
                },
                {
                    model: Usuario,
                    as: 'barbero',
                    include: [{ model: Persona, attributes: ['nombre_completo'] }]
                }
            ],
            order: [['fecha', 'ASC'], ['hora_inicio', 'ASC']]
        });
        res.json(turnos);
    } catch (error) {
        console.error('Error al listar turnos:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const crear = async (req, res) => {
    const { idcliente, nombre_cliente, telefono_cliente, idusuario_barbero, idservicio, fecha, hora_inicio, hora_fin, tipo_alta } = req.body;
    if (!idusuario_barbero || !idservicio || !fecha || !hora_inicio || !hora_fin) {
        return res.status(400).json({ error: 'idusuario_barbero, idservicio, fecha, hora_inicio y hora_fin son obligatorios.' });
    }
    const t = await sequelize.transaction();
    try {
        let clienteId = idcliente || null;

        // Si vino un nombre de cliente nuevo (walk-in), lo creamos en el momento
        if (!clienteId && nombre_cliente) {
            const persona = await Persona.create(
                { idbarberia: req.usuario.idbarberia, nombre_completo: nombre_cliente, telefono: telefono_cliente || 'Sin teléfono' },
                { transaction: t }
            );
            const cliente = await Cliente.create({ idpersona: persona.idpersona }, { transaction: t });
            clienteId = cliente.idcliente;
        }

        const turno = await AgendaTurno.create({
            idbarberia: req.usuario.idbarberia,
            idcliente: clienteId,
            idusuario_barbero, idservicio, fecha, hora_inicio, hora_fin,
            tipo_alta: tipo_alta || 'orden_de_llegada'
        }, { transaction: t });

        await t.commit();
        res.status(201).json(turno);
    } catch (error) {
        await t.rollback();
        console.error('Error al crear turno:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const actualizarEstado = async (req, res) => {
    const { estado } = req.body;
    const estadosValidos = ['pendiente', 'confirmado', 'atendido', 'ausente', 'cancelado', 'archivado'];
    if (!estadosValidos.includes(estado)) {
        return res.status(400).json({ error: `Estado inválido. Valores permitidos: ${estadosValidos.join(', ')}` });
    }
    try {
        const turno = await AgendaTurno.findOne({
            where: { idagenda: req.params.id, idbarberia: req.usuario.idbarberia }
        });
        if (!turno) return res.status(404).json({ error: 'Turno no encontrado.' });

        await turno.update({ estado });
        res.json({ mensaje: 'Estado actualizado.', turno });
    } catch (error) {
        console.error('Error al actualizar turno:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

module.exports = { listar, crear, actualizarEstado };
