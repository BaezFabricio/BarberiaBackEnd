const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const Usuario = require('./Usuario');

const HorariosAtencion = sequelize.define('horarios_atencion', {
    idhorario: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    idusuario_barbero: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Usuario,
            key: 'idusuario'
        }
    },
    dia_semana: {
        type: DataTypes.INTEGER, // 1 = Lunes, 7 = Domingo
        allowNull: false
    },
    hora_apertura: {
        type: DataTypes.TIME,
        allowNull: false
    },
    hora_cierre: {
        type: DataTypes.TIME,
        allowNull: false
    }
});

HorariosAtencion.belongsTo(Usuario, { foreignKey: 'idusuario_barbero', onDelete: 'CASCADE' });

module.exports = HorariosAtencion;