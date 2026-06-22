const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const Persona = require('./Persona');

const Cliente = sequelize.define('cliente', {
    idcliente: {
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
    notas_cliente: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    estado: {
        type: DataTypes.ENUM('activo', 'inactivo'),
        defaultValue: 'activo',
        allowNull: false
    }
});

// Relación de Herencia: Un Cliente tiene datos de una Persona
Cliente.belongsTo(Persona, { foreignKey: 'idpersona', onDelete: 'CASCADE' });

module.exports = Cliente;