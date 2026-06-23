const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const EmpresaBarberia = require('./EmpresaBarberia');
const Usuario = require('./Usuario');

const Notificaciones = sequelize.define('notificaciones', {
    idnotificacion: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    idbarberia: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: EmpresaBarberia,
            key: 'idbarberia'
        }
    },
    idusuario_barbero: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Usuario,
            key: 'idusuario'
        }
    },
    tipo: {
        type: DataTypes.ENUM('reserva', 'recordatorio', 'promocion', 'sistema', 'pago'),
        defaultValue: 'sistema',
        allowNull: false
    },
    titulo: {
        type: DataTypes.STRING(100),
        allowNull: false,
        defaultValue: 'Notificación'
    },
    mensaje: {
        type: DataTypes.STRING(500),
        allowNull: false
    },
    leido: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false
    },
    fecha_creacion: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
});

Notificaciones.belongsTo(EmpresaBarberia, { foreignKey: 'idbarberia', onDelete: 'RESTRICT' });
Notificaciones.belongsTo(Usuario, { foreignKey: 'idusuario_barbero', onDelete: 'CASCADE' });

module.exports = Notificaciones;