const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const Persona = require('./Persona');

const Usuario = sequelize.define('usuario', {
    idusuario: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    idpersona: {
        type: DataTypes.INTEGER,
        allowNull: false,
        unique: true,
        references: {
            model: Persona,
            key: 'idpersona'
        }
    },
    rol: {
        type: DataTypes.ENUM('admin', 'barbero'),
        allowNull: false
    },
    pin_acceso: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    password_hash: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    comision_porcentaje: {
        type: DataTypes.DECIMAL(5, 2),
        defaultValue: 0.00,
        allowNull: false
    },
    rating_promedio: {
        type: DataTypes.DECIMAL(3, 2),
        defaultValue: 5.00,
        allowNull: false
    },
    estado: {
        type: DataTypes.ENUM('activo', 'inactivo'),
        defaultValue: 'activo',
        allowNull: false
    }
});

// Relación de Herencia: Un Usuario tiene datos de una Persona
Usuario.belongsTo(Persona, { foreignKey: 'idpersona', onDelete: 'CASCADE' });

module.exports = Usuario;