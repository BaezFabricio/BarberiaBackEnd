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
    fecha_alta: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
});

module.exports = EmpresaBarberia;