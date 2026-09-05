const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const EmpresaBarberia = require('./EmpresaBarberia');
const Producto = require('./Producto');
const Usuario = require('./Usuario');
const Cliente = require('./Cliente');

const VentaProducto = sequelize.define('venta_producto', {
    idventa: {
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
    idproducto: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Producto,
            key: 'idproducto'
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
    idcliente: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: Cliente,
            key: 'idcliente'
        }
    },
    cantidad: {
        type: DataTypes.INTEGER,
        defaultValue: 1,
        allowNull: false
    },
    precio_unitario_historico: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    monto_total: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    metodo_pago: {
        type: DataTypes.ENUM('efectivo', 'transferencia', 'tarjeta'),
        allowNull: false
    },
    fecha_venta: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    archivado: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
    },
});

VentaProducto.belongsTo(EmpresaBarberia, { foreignKey: 'idbarberia', onDelete: 'RESTRICT' });
VentaProducto.belongsTo(Producto, { foreignKey: 'idproducto' });
VentaProducto.belongsTo(Usuario, { foreignKey: 'idusuario_barbero', as: 'barbero' });
VentaProducto.belongsTo(Cliente, { foreignKey: 'idcliente', onDelete: 'SET NULL' });

module.exports = VentaProducto;