const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

let client = null;
let clientListo = false;

function iniciarWhatsApp() {
    client = new Client({
        authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
        puppeteer: {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
    });

    client.on('qr', (qr) => {
        console.log('\n📱 Escaneá este QR con WhatsApp para activar las notificaciones:\n');
        qrcode.generate(qr, { small: true });
    });

    client.on('ready', () => {
        clientListo = true;
        console.log('✅ WhatsApp conectado y listo para enviar mensajes');
    });

    client.on('disconnected', (reason) => {
        clientListo = false;
        console.log('⚠️ WhatsApp desconectado:', reason);
        // Reintentar conexión después de 10 segundos
        setTimeout(() => iniciarWhatsApp(), 10000);
    });

    client.initialize();
}

async function enviarMensaje(telefono, mensaje) {
    if (!clientListo || !client) {
        console.log('⚠️ WhatsApp no está listo, omitiendo mensaje a', telefono);
        return;
    }
    try {
        let numero = telefono.replace(/\D/g, '');
        // Si no tiene código de país, asumir Argentina (+54) con prefijo móvil 9
        if (numero.length <= 10) {
            // Sacar el 0 inicial si lo tiene (ej: 03704... → 3704...)
            if (numero.startsWith('0')) numero = numero.slice(1);
            numero = '549' + numero;
        } else if (numero.startsWith('54') && !numero.startsWith('549') && numero.length === 12) {
            // Tiene código país pero le falta el 9 de móvil (54XXXXXXXXXX → 549XXXXXXXXXX)
            numero = '549' + numero.slice(2);
        }
        const chatId = await client.getNumberId(numero);
        if (!chatId) {
            console.log('⚠️ Número no tiene WhatsApp:', numero);
            return;
        }
        await client.sendMessage(chatId._serialized, mensaje);
    } catch (e) {
        console.error('❌ Error enviando WhatsApp:', e.message);
    }
}

async function notificarClienteNuevoTurno({ turno, cliente, servicio, barbero, barberia }) {
    console.log('[WA] notificarCliente telefono:', cliente.telefono);
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

    await enviarMensaje(cliente.telefono, msg);
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

    await enviarMensaje(barbero.telefono, msg);
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

    await enviarMensaje(cliente.telefono, msg);
}

async function enviarMensajeLibre({ telefono, mensaje }) {
    await enviarMensaje(telefono, mensaje);
}

module.exports = { iniciarWhatsApp, notificarClienteNuevoTurno, notificarBarberoNuevoTurno, enviarRecordatorio, enviarMensajeLibre };
