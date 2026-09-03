const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const ValoracionBarbero = sequelize.define('valoracion_barbero', {
    idvaloracion: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    idbarberia:   { type: DataTypes.INTEGER, allowNull: false },
    idusuario_barbero: { type: DataTypes.INTEGER, allowNull: false },
    idagenda:     { type: DataTypes.INTEGER, allowNull: true, unique: true },
    estrellas:    { type: DataTypes.INTEGER, allowNull: false },
    comentario:   { type: DataTypes.TEXT, allowNull: true },
    nombre_cliente: { type: DataTypes.STRING(100), allowNull: true },
    token:        { type: DataTypes.STRING(64), allowNull: true, unique: true },
    token_usado:  { type: DataTypes.BOOLEAN, defaultValue: false },
}, {
    tableName: 'valoraciones_barberos',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
});

module.exports = ValoracionBarbero;
