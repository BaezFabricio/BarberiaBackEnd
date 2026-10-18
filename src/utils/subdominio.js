const EmpresaBarberia = require('../models/EmpresaBarberia');

// Extrae el subdominio de un host (ej: "barberstudio.tuapp.com:443" → "barberstudio").
// Las IP (127.0.0.1) no tienen subdominio.
const extraerSubdominio = (host = '') => {
    const sinPuerto = host.split(':')[0];
    if (/^\d+(\.\d+){3}$/.test(sinPuerto)) return null;
    const partes = sinPuerto.split('.');
    return partes.length >= 3 ? partes[0] : null;
};

// Subdominios que declara el pedido: el header X-Tenant-Subdomain (lo manda el frontend)
// y el del Host. Son datos del cliente: sirven para orientar o para comprobar, nunca para
// autorizar. En rutas con sesión la barbería sale del token.
const subdominiosDelPedido = req => {
    const declarado = String(req.headers['x-tenant-subdomain'] ?? '').trim().toLowerCase() || null;
    return [...new Set([declarado, extraerSubdominio(req.headers.host)])].filter(s => s && s !== 'www');
};

// Barbería a la que apunta el pedido, o null si el subdominio no es de ninguna
// (dominio propio, localhost, desarrollo).
async function barberiaDelPedido(req) {
    for (const subdominio of subdominiosDelPedido(req)) {
        const barberia = await EmpresaBarberia.findOne({ where: { subdominio }, attributes: ['idbarberia'] });
        if (barberia) return barberia;
    }
    return null;
}

module.exports = { extraerSubdominio, subdominiosDelPedido, barberiaDelPedido };
