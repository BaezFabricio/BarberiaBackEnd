const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const TurnoToken = sequelize.define('turno_token', {
    idtoken: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    idagenda: { type: DataTypes.INTEGER, allowNull: false },
    token: { type: DataTypes.STRING(100), allowNull: false, unique: true },
    tipo: { type: DataTypes.ENUM('confirmar', 'cancelar'), allowNull: false },
    usado: { type: DataTypes.BOOLEAN, defaultValue: false },
    expira_en: { type: DataTypes.DATE, allowNull: false },
}, { timestamps: false });

module.exports = TurnoToken;
