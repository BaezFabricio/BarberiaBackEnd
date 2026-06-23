const Notificaciones = require('../models/Notificaciones');

async function registrar({ idbarberia, idusuario_barbero, tipo = 'sistema', titulo, mensaje }) {
    console.log('[NOTIF] registrar llamado:', { idbarberia, idusuario_barbero, tipo, titulo });
    try {
        const n = await Notificaciones.create({ idbarberia, idusuario_barbero, tipo, titulo, mensaje });
        console.log('[NOTIF] guardada con id:', n.idnotificacion);
    } catch (e) {
        console.error('[NOTIF] Error:', e.message);
    }
}

module.exports = { registrar };
