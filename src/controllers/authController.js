const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Persona = require('../models/Persona');
const Usuario = require('../models/Usuario');
const { barberiaDelPedido } = require('../utils/subdominio');

// Hash descartable para comparar cuando el correo no existe.
const HASH_FALSO = bcrypt.hashSync('contraseña-que-nadie-usa', 10);

// Esta instalación es de una sola barbería: el alta de barberías nuevas está cerrada.
// (Antes cualquiera podía crear una barbería y operar con su propia sesión.)
const registro = async (req, res) => {
    res.status(403).json({ error: 'El alta de barberías está cerrada.' });
};

const login = async (req, res) => {
    const { correo_electronico, password } = req.body;

    if (!correo_electronico || !password) {
        return res.status(400).json({ error: 'Correo y contraseña son obligatorios.' });
    }

    try {
        // Primero se resuelve la barbería (subdominio) y el usuario se busca DENTRO de ella:
        // el mismo correo puede existir en dos barberías con contraseñas distintas.
        const barberia = await barberiaDelPedido(req);
        const candidatos = await Usuario.findAll({
            include: [{
                model: Persona,
                where: { correo_electronico, ...(barberia ? { idbarberia: barberia.idbarberia } : {}) },
            }],
        });

        if (!barberia && candidatos.length > 1) {
            return res.status(400).json({ error: 'Ingresá desde la dirección web de tu barbería.' });
        }

        const usuario = candidatos[0];
        // Se compara siempre, aunque el usuario no exista, para que el tiempo de respuesta no delate qué correos existen.
        const passwordValida = await bcrypt.compare(password, usuario?.password_hash || HASH_FALSO);
        if (!usuario || usuario.estado === 'inactivo' || !passwordValida) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        const idbarberia = usuario.persona.idbarberia;
        const token = jwt.sign(
            { idusuario: usuario.idusuario, rol: usuario.rol, idbarberia },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({ token, rol: usuario.rol, idbarberia });
    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

module.exports = { registro, login };
