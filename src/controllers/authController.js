const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sequelize = require('../../config/database');
const EmpresaBarberia = require('../models/EmpresaBarberia');
const Persona = require('../models/Persona');
const Usuario = require('../models/Usuario');

const registro = async (req, res) => {
    const {
        nombre_negocio,
        subdominio,
        nombre_completo,
        telefono,
        correo_electronico,
        password
    } = req.body;

    if (!nombre_negocio || !subdominio || !nombre_completo || !telefono || !correo_electronico || !password) {
        return res.status(400).json({ error: 'Todos los campos son obligatorios.' });
    }

    const t = await sequelize.transaction();
    try {
        const barberia = await EmpresaBarberia.create(
            { nombre_negocio, subdominio },
            { transaction: t }
        );

        const persona = await Persona.create(
            { idbarberia: barberia.idbarberia, nombre_completo, telefono, correo_electronico },
            { transaction: t }
        );

        const password_hash = await bcrypt.hash(password, 10);
        await Usuario.create(
            { idpersona: persona.idpersona, rol: 'admin', password_hash },
            { transaction: t }
        );

        await t.commit();
        res.status(201).json({ mensaje: 'Barbería registrada con éxito.', subdominio: barberia.subdominio });
    } catch (error) {
        await t.rollback();
        if (error.name === 'SequelizeUniqueConstraintError') {
            return res.status(409).json({ error: 'El subdominio o el correo ya están en uso.' });
        }
        console.error('Error en registro:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const login = async (req, res) => {
    const { correo_electronico, password } = req.body;

    if (!correo_electronico || !password) {
        return res.status(400).json({ error: 'Correo y contraseña son obligatorios.' });
    }

    try {
        const persona = await Persona.findOne({ where: { correo_electronico } });
        if (!persona) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        const usuario = await Usuario.findOne({ where: { idpersona: persona.idpersona } });
        if (!usuario || usuario.estado === 'inactivo') {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        const passwordValida = await bcrypt.compare(password, usuario.password_hash);
        if (!passwordValida) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        const token = jwt.sign(
            { idusuario: usuario.idusuario, rol: usuario.rol, idbarberia: persona.idbarberia },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ token, rol: usuario.rol, idbarberia: persona.idbarberia });
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

module.exports = { registro, login };
