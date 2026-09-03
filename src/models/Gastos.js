const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const EmpresaBarberia = require('./EmpresaBarberia');
const Usuario = require('./Usuario');

const Gastos = sequelize.define('gastos', {
    idgasto: {
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
    descripcion: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    monto: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    categoria_gasto: {
        type: DataTypes.STRING(50),
        allowNull: false
    },
    fecha_gasto: {
        type: DataTypes.DATEONLY,
        allowNull: false
    },
    idusuario_barbero: {
        type: DataTypes.INTEGER,
        allowNull: true
    },
    fecha_registro: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
});

Gastos.belongsTo(EmpresaBarberia, { foreignKey: 'idbarberia', onDelete: 'RESTRICT' });
Gastos.belongsTo(Usuario, { foreignKey: 'idusuario_barbero', as: 'barbero', onDelete: 'SET NULL', constraints: false });

module.exports = Gastos;