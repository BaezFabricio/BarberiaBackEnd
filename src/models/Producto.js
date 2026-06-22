const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const EmpresaBarberia = require('./EmpresaBarberia');

const Producto = sequelize.define('producto', {
    idproducto: {
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
    nombre_producto: {
        type: DataTypes.STRING(100),
        allowNull: false
    },
    descripcion: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    categoria: {
        type: DataTypes.STRING(50),
        allowNull: false
    },
    precio_venta: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    stock_actual: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
        allowNull: false
    },
    stock_minimo: {
        type: DataTypes.INTEGER,
        defaultValue: 5,
        allowNull: false
    }
});

// Relación: Un Producto pertenece a una Barbería específica
Producto.belongsTo(EmpresaBarberia, { foreignKey: 'idbarberia', onDelete: 'RESTRICT' });

module.exports = Producto;