const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const { Op } = require('sequelize');
const sequelize = require('./config/database');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuración para que el Frontend pueda hacer peticiones sin problemas de permisos
app.use(cors());
app.use(express.json());

// Rutas públicas (registro, login)
const publicRoutes = require('./src/routes/publicRoutes');
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

            // 1. Pendiente → Ausente: turno cuya hora_inicio ya pasó y sigue pendiente
            await AgendaTurno.update(
                { estado: 'ausente' },
                {
                    where: {
                        estado: 'pendiente',
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

            // 3. Cancelado → Archivado: pasadas 2 horas desde la creación
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
}

// Función para conectar la BD y prender el servidor
async function levantarServidor() {
    try {
        await sequelize.authenticate();
        console.log('✅ Conexión a la base de datos MySQL establecida correctamente.');
        
        app.listen(PORT, () => {
            console.log(`🚀 Servidor escuchando en el puerto ${PORT}`);
            console.log(`🌍 Probá entrar a: http://localhost:${PORT}`);
        });

        iniciarCron();
    } catch (error) {
        console.error('❌ Error crítico: No se pudo conectar a la base de datos MySQL:', error);
    }
}

levantarServidor();