const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');

const ImagenCarrusel = sequelize.define('imagenes_carrusel', {
    idimagen:    { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    idbarberia:  { type: DataTypes.INTEGER, allowNull: false },
    url:         { type: DataTypes.STRING(500), allowNull: false },
    orden:       { type: DataTypes.INTEGER, defaultValue: 0 },
}, { timestamps: false });

module.exports = ImagenCarrusel;
