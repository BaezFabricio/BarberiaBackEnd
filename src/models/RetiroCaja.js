const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const EmpresaBarberia = require('./EmpresaBarberia');
const Usuario = require('./Usuario');
const Persona = require('./Persona');

const RetiroCaja = sequelize.define('RetiroCaja', {
    idretiro: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    idbarberia: { type: DataTypes.INTEGER, allowNull: false },
    idusuario_barbero: { type: DataTypes.INTEGER, allowNull: false },
    monto: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
    descripcion: { type: DataTypes.STRING(200), allowNull: true },
    estado: { type: DataTypes.ENUM('pendiente', 'devuelto'), allowNull: false, defaultValue: 'pendiente' },
    fecha_retiro: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    fecha_devolucion: { type: DataTypes.DATE, allowNull: true },
    archivado: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
}, { tableName: 'retiro_caja' });

RetiroCaja.belongsTo(EmpresaBarberia, { foreignKey: 'idbarberia' });
RetiroCaja.belongsTo(Usuario, { foreignKey: 'idusuario_barbero', as: 'barbero' });
Usuario.belongsTo(Persona, { foreignKey: 'idpersona' });

module.exports = RetiroCaja;
