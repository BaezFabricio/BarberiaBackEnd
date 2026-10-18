const EmpresaBarberia = require('../models/EmpresaBarberia');
const { subdominiosDelPedido } = require('../utils/subdominio');

// Corre después de authMiddleware. La barbería sale SIEMPRE del token: el host y el
// header X-Tenant-Subdomain son datos del cliente y solo se usan para comprobar que
// coincidan con ella, nunca para elegirla. Así un token de A no puede operar "como" B,
// y una barbería suspendida no se reactiva usando el dominio de otra.
const tenantMiddleware = async (req, res, next) => {
    try {
        const idbarberia = req.usuario?.idbarberia;
        if (!idbarberia) return res.status(403).json({ error: 'Barbería no identificada.' });

        const barberia = await EmpresaBarberia.findByPk(idbarberia);
        if (!barberia) return res.status(403).json({ error: 'Barbería no identificada.' });

        if (barberia.estado_cuenta !== 'activo') {
            return res.status(403).json({ error: 'El acceso al panel está suspendido.', suspendida: true });
        }

        for (const subdominio of subdominiosDelPedido(req)) {
            const delPedido = await EmpresaBarberia.findOne({ where: { subdominio }, attributes: ['idbarberia'] });
            // Si el subdominio no es de ninguna barbería (dominio propio, localhost) no hay nada que comparar.
            if (delPedido && delPedido.idbarberia !== barberia.idbarberia) {
                return res.status(403).json({ error: 'La sesión no corresponde a esta barbería.' });
            }
        }

        req.tenant = barberia;
        next();
    } catch (error) {
        console.error('Error en tenantMiddleware:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

module.exports = tenantMiddleware;
