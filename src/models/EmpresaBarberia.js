const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const EmpresaBarberia = sequelize.define('empresa_barberia', {
    idbarberia: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    nombre_negocio: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    subdominio: {
        type: DataTypes.STRING(50),
        allowNull: false,
        unique: true
    },
    plan_suscripcion: {
        type: DataTypes.ENUM('bronze', 'silver', 'gold'),
        defaultValue: 'bronze',
        allowNull: false
    },
    estado_cuenta: {
        type: DataTypes.ENUM('activo', 'suspendido'),
        defaultValue: 'activo',
        allowNull: false
    },
    logo_url: {
        type: DataTypes.STRING(500),
        allowNull: true
    },
    color_primario: {
        type: DataTypes.STRING(7),
        allowNull: true,
        defaultValue: '#d4a843'
    },
    // Info del negocio
    telefono:        { type: DataTypes.STRING(30),  allowNull: true },
    direccion:       { type: DataTypes.STRING(200), allowNull: true },
    correo_negocio:  { type: DataTypes.STRING(200), allowNull: true },
    slogan:          { type: DataTypes.STRING(150), allowNull: true },
    color_portada:   { type: DataTypes.STRING(7), allowNull: true, defaultValue: '#ffffff' },
    color_nombre_1:  { type: DataTypes.STRING(7), allowNull: true, defaultValue: '#ffffff' },
    color_nombre_2:  { type: DataTypes.STRING(7), allowNull: true, defaultValue: '#d4a843' },
    texto_portada_1: { type: DataTypes.STRING(100), allowNull: true },
    texto_portada_2: { type: DataTypes.STRING(100), allowNull: true },
    color_header_1:  { type: DataTypes.STRING(7), allowNull: true, defaultValue: '#ffffff' },
    color_header_2:  { type: DataTypes.STRING(7), allowNull: true, defaultValue: '#d4a843' },
    maps_embed:      { type: DataTypes.STRING(800), allowNull: true },
    // Horarios del local
    horario_lv_desde:      { type: DataTypes.STRING(5), allowNull: true, defaultValue: '09:00' },
    horario_lv_hasta:      { type: DataTypes.STRING(5), allowNull: true, defaultValue: '19:00' },
    horario_sab_desde:     { type: DataTypes.STRING(5), allowNull: true, defaultValue: '09:00' },
    horario_sab_hasta:     { type: DataTypes.STRING(5), allowNull: true, defaultValue: '15:00' },
    domingo_cerrado:       { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: true },
    // Configuración de reservas
    duracion_turno:        { type: DataTypes.INTEGER, allowNull: true, defaultValue: 40 },
    tiempo_cancelacion:    { type: DataTypes.INTEGER, allowNull: true, defaultValue: 60 },
    tiempo_confirmacion:   { type: DataTypes.INTEGER, allowNull: true, defaultValue: 60 },
    reservas_online:       { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: true },
    orden_llegada:         { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: true },
    dias_inactividad:      { type: DataTypes.INTEGER, allowNull: true, defaultValue: 60 },
    // Redes sociales
    instagram:       { type: DataTypes.STRING(100), allowNull: true },
    facebook:        { type: DataTypes.STRING(100), allowNull: true },
    whatsapp_negocio:{ type: DataTypes.STRING(30),  allowNull: true },
    // Config notificaciones
    notif_nueva_reserva: { type: DataTypes.BOOLEAN, defaultValue: true, allowNull: false },
    notif_recordatorio:  { type: DataTypes.BOOLEAN, defaultValue: true, allowNull: false },
    notif_barbero:       { type: DataTypes.BOOLEAN, defaultValue: true, allowNull: false },
    // Notificaciones
    gmail_remitente: { type: DataTypes.STRING(200), allowNull: true },
    gmail_password:  { type: DataTypes.STRING(200), allowNull: true },
    whatsapp_barbero:{ type: DataTypes.STRING(20),  allowNull: true },
    callmebot_apikey:{ type: DataTypes.STRING(50),  allowNull: true },
    fecha_alta: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
});

module.exports = EmpresaBarberia;