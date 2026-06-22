const jwt = require('jsonwebtoken');
const EmpresaBarberia = require('../models/EmpresaBarberia');

// Extrae el subdominio del header Host (ej: "barberstudio.tuapp.com" → "barberstudio")
const extraerSubdominio = (host = '') => {
    const partes = host.split('.');
    // Solo hay subdominio si el host tiene más de 2 partes (ej: sub.dominio.com)
    if (partes.length >= 3) return partes[0];
    return null;
};

const tenantMiddleware = async (req, res, next) => {
    try {
        let idbarberia = null;

        // Estrategia 1: subdominio en el Host header
        const subdominio = extraerSubdominio(req.headers.host);
        if (subdominio && subdominio !== 'www') {
            const barberia = await EmpresaBarberia.findOne({ where: { subdominio, estado_cuenta: 'activo' } });
            if (barberia) {
                req.tenant = barberia;
                return next();
            }
        }

        // Estrategia 2: idbarberia dentro del JWT (para desarrollo en localhost)
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.slice(7);
            const payload = jwt.verify(token, process.env.JWT_SECRET);
            idbarberia = payload.idbarberia;

            const barberia = await EmpresaBarberia.findOne({ where: { idbarberia, estado_cuenta: 'activo' } });
            if (barberia) {
                req.tenant = barberia;
                return next();
            }
        }

        return res.status(403).json({ error: 'Barbería no identificada o cuenta suspendida.' });
    } catch (error) {
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Token inválido o expirado.' });
        }
        console.error('Error en tenantMiddleware:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

module.exports = tenantMiddleware;
