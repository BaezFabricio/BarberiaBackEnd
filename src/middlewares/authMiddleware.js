const jwt = require('jsonwebtoken');
const Usuario = require('../models/Usuario');
const Persona = require('../models/Persona');

// El token solo prueba quién inició sesión: el rol, el estado y la barbería se leen de la
// base en cada pedido. Así un barbero desactivado o un admin degradado pierde el acceso
// al instante en vez de conservarlo hasta que venza el token.
const authMiddleware = async (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token requerido.' });
    }

    let payload;
    try {
        payload = jwt.verify(authHeader.slice(7), process.env.JWT_SECRET);
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expirado. Volvé a iniciar sesión.' });
        }
        return res.status(401).json({ error: 'Token inválido.' });
    }

    try {
        const usuario = await Usuario.findOne({
            where: { idusuario: payload.idusuario },
            attributes: ['idusuario', 'rol', 'estado'],
            include: [{ model: Persona, attributes: ['idbarberia'] }],
        });
        if (!usuario || usuario.estado !== 'activo' || usuario.persona?.idbarberia !== payload.idbarberia) {
            return res.status(401).json({ error: 'La sesión ya no es válida. Volvé a iniciar sesión.' });
        }
        req.usuario = { idusuario: usuario.idusuario, rol: usuario.rol, idbarberia: usuario.persona.idbarberia };
        next();
    } catch (error) {
        console.error('Error en authMiddleware:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

// Middleware de rol: uso -> soloAdmin o soloRoles(['admin', 'barbero'])
const soloRoles = (...roles) => (req, res, next) => {
    const rol = req.usuario?.rol;
    // owner tiene acceso a todo
    if (rol === 'owner' || roles.includes(rol)) return next();
    return res.status(403).json({ error: 'No tenés permiso para esta acción.' });
};

module.exports = { authMiddleware, soloRoles };
