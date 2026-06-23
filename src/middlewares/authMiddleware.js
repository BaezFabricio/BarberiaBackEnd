const jwt = require('jsonwebtoken');

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Token requerido.' });
    }

    const token = authHeader.slice(7);
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        req.usuario = payload; // { idusuario, rol, idbarberia }
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token expirado. Volvé a iniciar sesión.' });
        }
        return res.status(401).json({ error: 'Token inválido.' });
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
