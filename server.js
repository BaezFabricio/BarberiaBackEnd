const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const { Op } = require('sequelize');
const sequelize = require('./config/database');
const { iniciarWhatsApp } = require('./src/services/whatsappService');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Headers de seguridad HTTP
app.use(helmet());

// CORS — acepta orígenes configurados + cualquier subdominio de Vercel del proyecto
const originesPermitidos = (process.env.FRONTEND_URL ?? 'http://localhost:3001').split(',').map(u => u.trim());
const VERCEL_PROJECT_PATTERN = process.env.VERCEL_PROJECT_PATTERN ? new RegExp(process.env.VERCEL_PROJECT_PATTERN) : null;
app.use(cors({
    origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (originesPermitidos.includes(origin)) return callback(null, true);
        if (VERCEL_PROJECT_PATTERN && VERCEL_PROJECT_PATTERN.test(origin)) return callback(null, true);
        callback(new Error('CORS: origen no permitido'));
    },
    credentials: true,
}));

app.use(express.json());

// Rate limiting — login y reserva pública
const limitLogin = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Demasiados intentos, esperá 15 minutos.' } });
const limitReserva = rateLimit({ windowMs: 60 * 1000, max: 10, message: { error: 'Demasiadas solicitudes, esperá un momento.' } });

// Rutas públicas (registro, login)
const publicRoutes = require('./src/routes/publicRoutes');
app.use('/api/public/login', limitLogin);
app.use('/api/public/registro', limitLogin);
app.use('/api/public/reserva', limitReserva);
app.use('/api/public', publicRoutes);

// Rutas protegidas (requieren JWT)
const tenantRoutes = require('./src/routes/tenantRoutes');
app.use('/api', tenantRoutes);

// Ruta base de prueba
app.get('/', (req, res) => {
    res.json({ mensaje: "Servidor Multi-tenant de Barberías corriendo con éxito 🚀" });
});

// ── Cron: transiciones automáticas de estado ──────────────────────────────────
function iniciarCron() {
    const AgendaTurno = require('./src/models/AgendaTurno');

    // Cada 5 minutos revisa turnos que requieren cambio de estado
    cron.schedule('*/5 * * * *', async () => {
        try {
            const ahora = new Date();
            const fechaHoy = ahora.toISOString().split('T')[0];
            const horaActual = ahora.toTimeString().slice(0, 8); // HH:MM:SS

            // 1. Pendiente/Confirmado → Ausente: turno cuya hora_inicio ya pasó
            await AgendaTurno.update(
                { estado: 'ausente' },
                {
                    where: {
                        estado: { [Op.in]: ['pendiente', 'confirmado'] },
                        [Op.or]: [
                            { fecha: { [Op.lt]: fechaHoy } },
                            { fecha: fechaHoy, hora_inicio: { [Op.lt]: horaActual } },
                        ],
                    },
                }
            );

            // 2. Ausente → Archivado: hora_fin ya pasó
            await AgendaTurno.update(
                { estado: 'archivado' },
                {
                    where: {
                        estado: 'ausente',
                        [Op.or]: [
                            { fecha: { [Op.lt]: fechaHoy } },
                            { fecha: fechaHoy, hora_fin: { [Op.lt]: horaActual } },
                        ],
                    },
                }
            );

            // 3. Pendiente → Cancelado: no confirmó en tiempo configurado (libera el slot)
            const EmpresaBarberia = require('./src/models/EmpresaBarberia');
            const barberias = await EmpresaBarberia.findAll({ attributes: ['idbarberia', 'tiempo_confirmacion'] });
            for (const b of barberias) {
                const mins = b.tiempo_confirmacion ?? 60;
                const limite = new Date(ahora.getTime() - mins * 60 * 1000);
                await AgendaTurno.update(
                    { estado: 'cancelado' },
                    {
                        where: {
                            idbarberia: b.idbarberia,
                            estado: 'pendiente',
                            fecha_creacion: { [Op.lt]: limite },
                            [Op.or]: [
                                { fecha: { [Op.gt]: fechaHoy } },
                                { fecha: fechaHoy, hora_inicio: { [Op.gt]: horaActual } },
                            ],
                        },
                    }
                );
            }

            // 4. Cancelado → Archivado: pasadas 2 horas desde la creación
            const dosHorasAtras = new Date(ahora.getTime() - 2 * 60 * 60 * 1000);
            await AgendaTurno.update(
                { estado: 'archivado' },
                {
                    where: {
                        estado: 'cancelado',
                        fecha_creacion: { [Op.lt]: dosHorasAtras },
                    },
                }
            );
        } catch (err) {
            console.error('Cron error:', err.message);
        }
    });

    console.log('⏰ Cron de transiciones de turnos activo (cada 5 min)');

    // Todos los días a las 10:00 — recordatorio email + WhatsApp 1 día antes
    cron.schedule('0 10 * * *', async () => {
        try {
            const { enviarRecordatorio } = require('./src/services/whatsappService');
            const { enviarEmailRecordatorio } = require('./src/services/emailService');
            const EmpresaBarberia = require('./src/models/EmpresaBarberia');
            const Servicio = require('./src/models/Servicio');
            const Usuario = require('./src/models/Usuario');
            const Persona = require('./src/models/Persona');
            const Cliente = require('./src/models/Cliente');

            const manana = new Date();
            manana.setDate(manana.getDate() + 1);
            const fechaManana = manana.toISOString().split('T')[0];

            const turnos = await AgendaTurno.findAll({
                where: { fecha: fechaManana, estado: 'confirmado' },
                include: [
                    { model: Servicio, attributes: ['nombre_servicio', 'precio'] },
                    { model: Cliente, include: [{ model: Persona, attributes: ['nombre_completo', 'telefono', 'correo_electronico'] }] },
                    { model: Usuario, as: 'barbero', include: [{ model: Persona, attributes: ['nombre_completo'] }] },
                ],
            });

            for (const turno of turnos) {
                const barberia = await EmpresaBarberia.findByPk(turno.idbarberia);
                if (!barberia) continue;
                if (!barberia.notif_recordatorio) continue;

                const personaCliente = turno.cliente?.persona ?? turno.cliente?.Persona;
                const personaBarbero = turno.barbero?.persona ?? turno.barbero?.Persona;
                const clienteData = {
                    nombre_completo: personaCliente?.nombre_completo ?? '',
                    telefono: personaCliente?.telefono ?? '',
                    correo_electronico: personaCliente?.correo_electronico ?? null,
                };
                const barberoData = { nombre_completo: personaBarbero?.nombre_completo ?? '' };
                const servicioData = turno.Servicio ?? turno.servicio;

                try {
                    await enviarRecordatorio({ barberia, turno, cliente: clienteData, servicio: servicioData, barbero: barberoData });
                } catch (e) { console.error('Recordatorio WA error:', e.message); }

                try {
                    await enviarEmailRecordatorio({ barberia, turno, cliente: clienteData, servicio: servicioData, barbero: barberoData });
                } catch (e) { console.error('Recordatorio email error:', e.message); }
            }
            console.log(`📱 Recordatorios enviados para ${turnos.length} turnos de mañana`);
        } catch (err) {
            console.error('Cron recordatorio error:', err.message);
        }
    });

    console.log('📱 Cron de recordatorios activo (10:00 AM diario — email + WhatsApp)');

}

// Función para conectar la BD y prender el servidor
async function levantarServidor() {
    try {
        await sequelize.authenticate();
        console.log('✅ Conexión a la base de datos MySQL establecida correctamente.');

        // Migraciones de columnas — correr ANTES de abrir el servidor
        try {
            await sequelize.query("ALTER TABLE empresa_barberia ADD COLUMN fuente_header VARCHAR(50) DEFAULT 'Cinzel'");
            console.log('🔄 Migración: columna fuente_header agregada');
        } catch (e) { /* ya existe, ignorar */ }

        try {
            await sequelize.query("ALTER TABLE gastos ADD COLUMN idusuario_barbero INT NULL");
            console.log('🔄 Migración: columna idusuario_barbero en gastos agregada');
        } catch (e) { /* ya existe, ignorar */ }

        try {
            await sequelize.query("ALTER TABLE empresa_barberia ADD COLUMN greenapi_instance_id VARCHAR(50) NULL");
            console.log('🔄 Migración: columna greenapi_instance_id agregada');
        } catch (e) { /* ya existe, ignorar */ }

        try {
            await sequelize.query("ALTER TABLE empresa_barberia ADD COLUMN greenapi_api_token VARCHAR(100) NULL");
            console.log('🔄 Migración: columna greenapi_api_token agregada');
        } catch (e) { /* ya existe, ignorar */ }

        // Constraint único para evitar doble-reserva en el mismo slot (race condition)
        try {
            await sequelize.query(`
                CREATE UNIQUE INDEX IF NOT EXISTS uq_barbero_slot_activo
                ON agenda_turnos (idusuario_barbero, fecha, hora_inicio)
                WHERE estado IN ('pendiente', 'confirmado')
            `);
            console.log('🔒 Índice único de slots activos verificado');
        } catch (e) { /* ya existe o DB no soporta, ignorar */ }

        // Migración: turnos atendidos con pago registrado → cobrado
        const AgendaTurnoM = require('./src/models/AgendaTurno');
        const PagoServicioM = require('./src/models/PagoServicio');
        const pagosM = await PagoServicioM.findAll({ attributes: ['idagenda'] });
        const idsM = pagosM.map(p => p.idagenda);
        if (idsM.length) {
            const [n] = await AgendaTurnoM.update({ estado: 'cobrado' }, { where: { idagenda: idsM, estado: 'atendido' } });
            if (n > 0) console.log(`🔄 Migración: ${n} turnos actualizados a 'cobrado'`);
        }

        iniciarCron();
        if (process.env.WHATSAPP_ENABLED === 'true') iniciarWhatsApp();
    } catch (error) {
        console.error('❌ Error crítico: No se pudo conectar a la base de datos MySQL:', error);
    }

    app.listen(PORT, () => {
        console.log(`🚀 Servidor escuchando en el puerto ${PORT}`);
    });
}

levantarServidor();