const sequelize = require('../../config/database');
const AgendaTurno = require('../models/AgendaTurno');
const Servicio = require('../models/Servicio');
const Cliente = require('../models/Cliente');
const Persona = require('../models/Persona');
const Usuario = require('../models/Usuario');

const { registrar: registrarNotif } = require('../services/notificacionService');
const EmpresaBarberia = require('../models/EmpresaBarberia');
const { enviarConfirmacionTurno } = require('../services/emailService');
const { enviarMensajeLibre } = require('../services/whatsappService');

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
    const { idcliente, nombre_cliente, correo_electronico, idservicio, fecha, hora_inicio, hora_fin, tipo_alta } = req.body;
    const idusuario_barbero = req.body.idusuario_barbero ?? req.usuario.idusuario;
    let telefono_cliente = (req.body.telefono_cliente ?? '').replace(/\D/g, '');
    if (telefono_cliente.startsWith('549')) telefono_cliente = telefono_cliente.slice(3);
    else if (telefono_cliente.startsWith('54')) telefono_cliente = telefono_cliente.slice(2);
    if (telefono_cliente.startsWith('0')) telefono_cliente = telefono_cliente.slice(1);
    if (!idusuario_barbero || !idservicio || !fecha || !hora_inicio || !hora_fin) {
        return res.status(400).json({ error: 'idusuario_barbero, idservicio, fecha, hora_inicio y hora_fin son obligatorios.' });
    }
    const t = await sequelize.transaction();
    try {
        // Verificar conflicto de horario para el barbero
        const { Op } = require('sequelize');
        const conflicto = await AgendaTurno.findOne({
            where: {
                idusuario_barbero,
                idbarberia: req.usuario.idbarberia,
                fecha,
                estado: { [Op.in]: ['pendiente', 'confirmado'] },
                hora_inicio: { [Op.lt]: hora_fin },
                hora_fin:    { [Op.gt]: hora_inicio },
            },
        });
        if (conflicto) {
            await t.rollback();
            return res.status(409).json({ error: 'El barbero ya tiene un turno en ese horario.' });
        }

        let clienteId = idcliente || null;

        // Si vino un nombre de cliente nuevo (walk-in), buscamos primero por email o teléfono
        if (!clienteId && nombre_cliente) {
            let persona = null;
            if (correo_electronico) {
                persona = await Persona.findOne({ where: { correo_electronico, idbarberia: req.usuario.idbarberia }, transaction: t });
            }
            if (!persona) {
                persona = await Persona.create(
                    { idbarberia: req.usuario.idbarberia, nombre_completo: nombre_cliente, telefono: telefono_cliente || 'Sin teléfono', correo_electronico: correo_electronico || null },
                    { transaction: t }
                );
            } else {
                if (correo_electronico && !persona.correo_electronico) await persona.update({ correo_electronico }, { transaction: t });
            }
            let cliente = await Cliente.findOne({ where: { idpersona: persona.idpersona }, transaction: t });
            if (!cliente) cliente = await Cliente.create({ idpersona: persona.idpersona }, { transaction: t });
            clienteId = cliente.idcliente;
        }

        const turno = await AgendaTurno.create({
            idbarberia: req.usuario.idbarberia,
            idcliente: clienteId,
            idusuario_barbero, idservicio, fecha, hora_inicio, hora_fin,
            tipo_alta: tipo_alta || 'orden_de_llegada'
        }, { transaction: t });

        await t.commit();

        // Envíos según configuración de la barbería
        const barberia = await EmpresaBarberia.findByPk(req.usuario.idbarberia);
        const servicio = await Servicio.findByPk(idservicio, { attributes: ['nombre_servicio', 'duracion_minutos', 'precio'] });

        // notif_nueva_reserva: email de confirmación al cliente
        if (barberia?.notif_nueva_reserva && clienteId) {
            try {
                const clienteRow = await Cliente.findByPk(clienteId, { include: [{ model: Persona, attributes: ['nombre_completo', 'correo_electronico', 'telefono'] }] });
                const barberoRow = await Usuario.findByPk(idusuario_barbero, { include: [{ model: Persona, attributes: ['nombre_completo'] }] });
                // enviarConfirmacionTurno espera objeto plano, no modelo Sequelize
                const clientePlano = {
                    nombre_completo:    clienteRow?.persona?.nombre_completo ?? nombre_cliente ?? 'Cliente',
                    correo_electronico: clienteRow?.persona?.correo_electronico ?? null,
                    telefono:           clienteRow?.persona?.telefono ?? null,
                };
                const barberoPlan = { nombre_completo: barberoRow?.persona?.nombre_completo ?? '' };
                if (clientePlano.correo_electronico) {
                    await enviarConfirmacionTurno({ barberia, turno, cliente: clientePlano, servicio, barbero: barberoPlan, tokenConfirmar: null, tokenCancelar: null });
                }
            } catch (e) { console.error('Email confirmación:', e.message); }
        }

        // notif_barbero: WhatsApp al barbero
        if (barberia?.notif_barbero && barberia?.whatsapp_barbero) {
            try {
                const nombreCliente = nombre_cliente || 'Un cliente';
                await enviarMensajeLibre({ telefono: barberia.whatsapp_barbero, mensaje: `Nuevo turno asignado: ${nombreCliente} — ${servicio?.nombre_servicio ?? ''} el ${fecha} a las ${hora_inicio.slice(0,5)}`, barberia });
            } catch (e) { console.error('WhatsApp barbero:', e.message); }
        }

        // Registrar notificación
        await registrarNotif({
            idbarberia: req.usuario.idbarberia,
            idusuario_barbero: idusuario_barbero,
            tipo: 'reserva',
            titulo: 'Nuevo turno agendado',
            mensaje: `${nombre_cliente || 'Cliente'} — ${servicio?.nombre_servicio ?? ''} el ${fecha} a las ${hora_inicio.slice(0,5)}`,
        });

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
        if (turno.estado === 'cobrado') return res.status(400).json({ error: 'No se puede modificar un turno ya cobrado.' });

        await turno.update({ estado });
        res.json({ mensaje: 'Estado actualizado.', turno });

        // Al marcar como atendido, generar token de calificación y enviar email
        if (estado === 'atendido') {
            try {
                const crypto = require('crypto');
                const ValoracionBarbero = require('../models/ValoracionBarbero');
                const EmpresaBarberia = require('../models/EmpresaBarberia');
                const Cliente = require('../models/Cliente');
                const Persona = require('../models/Persona');
                const { enviarEmailCalificacion } = require('../services/emailService');

                // Evitar duplicados si ya existe token para este turno
                const yaExiste = await ValoracionBarbero.findOne({ where: { idagenda: turno.idagenda } });
                if (!yaExiste) {
                    const token = crypto.randomBytes(24).toString('hex');
                    await ValoracionBarbero.create({
                        idbarberia: turno.idbarberia,
                        idusuario_barbero: turno.idusuario_barbero,
                        idagenda: turno.idagenda,
                        token,
                    });

                    const [barberia, clienteRow] = await Promise.all([
                        EmpresaBarberia.findByPk(turno.idbarberia),
                        turno.idcliente
                            ? Cliente.findByPk(turno.idcliente, { include: [{ model: Persona, attributes: ['nombre_completo', 'correo_electronico'] }] })
                            : null,
                    ]);
                    const barberoRow = await require('../models/Usuario').findByPk(turno.idusuario_barbero, {
                        include: [{ model: Persona, attributes: ['nombre_completo'] }],
                    });

                    const frontendUrl = process.env.FRONTEND_URL?.split(',')[0]?.trim() ?? 'https://tu-barberia.com';
                    const linkCalificar = `${frontendUrl}/calificar/${token}`;
                    const cliente = {
                        correo_electronico: clienteRow?.persona?.correo_electronico ?? clienteRow?.Persona?.correo_electronico ?? null,
                        nombre_completo: clienteRow?.persona?.nombre_completo ?? clienteRow?.Persona?.nombre_completo ?? '',
                    };
                    const barbero = { nombre_completo: barberoRow?.persona?.nombre_completo ?? barberoRow?.Persona?.nombre_completo ?? '' };

                    await enviarEmailCalificacion({ barberia, turno, cliente, barbero, linkCalificar });
                }
            } catch (e) {
                console.error('Rating email error:', e.message);
            }
        }
    } catch (error) {
        console.error('Error al actualizar turno:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

module.exports = { listar, crear, actualizarEstado };
