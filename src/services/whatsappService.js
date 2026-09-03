// WhatsApp via Green API — sin Puppeteer, funciona en cualquier servidor
// Docs: https://green-api.com/en/docs/api/sending/SendMessage/

function formatearNumeroAR(telefono) {
    let n = telefono.replace(/\D/g, '');
    if (n.length <= 10) {
        if (n.startsWith('0')) n = n.slice(1);
        n = '549' + n;
    } else if (n.startsWith('54') && !n.startsWith('549') && n.length === 12) {
        n = '549' + n.slice(2);
    }
    return n + '@c.us';
}

async function enviarMensaje(telefono, mensaje, barberia) {
    if (!barberia?.greenapi_instance_id || !barberia?.greenapi_api_token) {
        console.log('⚠️ Green API no configurada, omitiendo mensaje a', telefono);
        return;
    }
    const chatId = formatearNumeroAR(telefono);
    const url = `https://api.green-api.com/waInstance${barberia.greenapi_instance_id}/sendMessage/${barberia.greenapi_api_token}`;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, message: mensaje }),
        });
        if (!res.ok) {
            const txt = await res.text();
            console.error('❌ Green API error:', res.status, txt);
        }
    } catch (e) {
        console.error('❌ Error enviando WhatsApp:', e.message);
    }
}

async function notificarClienteNuevoTurno({ turno, cliente, servicio, barbero, barberia }) {
    if (!cliente.telefono) return;
    const fecha = new Date(turno.fecha + 'T12:00:00').toLocaleDateString('es-AR', {
        weekday: 'long', day: 'numeric', month: 'long'
    });
    const msg =
`✂️ *${barberia.nombre_negocio}*
Tu turno fue registrado:

📅 ${fecha}
⏰ ${turno.hora_inicio.slice(0, 5)} hs
💈 ${barbero.nombre_completo}
✂️ ${servicio.nombre_servicio}
💵 $${servicio.precio.toLocaleString('es-AR')}

Te mandamos un email para confirmar o cancelar tu turno.`;
    await enviarMensaje(cliente.telefono, msg, barberia);
}

async function notificarBarberoNuevoTurno({ turno, cliente, servicio, barbero, barberia }) {
    if (!barbero.telefono) return;
    const fecha = new Date(turno.fecha + 'T12:00:00').toLocaleDateString('es-AR', {
        weekday: 'long', day: 'numeric', month: 'long'
    });
    const msg =
`🔔 *Nuevo turno — ${barberia.nombre_negocio}*

📅 ${fecha} — ${turno.hora_inicio.slice(0, 5)} hs
👤 ${cliente.nombre_completo}
📱 ${cliente.telefono}
✂️ ${servicio.nombre_servicio}`;
    await enviarMensaje(barbero.telefono, msg, barberia);
}

async function enviarRecordatorio({ turno, cliente, servicio, barbero, barberia }) {
    if (!cliente.telefono) return;
    const msg =
`⏰ *Recordatorio — ${barberia.nombre_negocio}*
Mañana tenés turno:

⏰ ${turno.hora_inicio.slice(0, 5)} hs
💈 ${barbero.nombre_completo}
✂️ ${servicio.nombre_servicio}

¡Te esperamos!`;
    await enviarMensaje(cliente.telefono, msg, barberia);
}

async function enviarMensajeLibre({ telefono, mensaje, barberia }) {
    await enviarMensaje(telefono, mensaje, barberia);
}

// No-op: Green API no requiere inicialización local
function iniciarWhatsApp() {
    console.log('📱 WhatsApp: usando Green API (sin QR local)');
}

module.exports = { iniciarWhatsApp, notificarClienteNuevoTurno, notificarBarberoNuevoTurno, enviarRecordatorio, enviarMensajeLibre };
