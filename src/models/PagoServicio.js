const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const EmpresaBarberia = require('./EmpresaBarberia');
const AgendaTurno = require('./AgendaTurno');

const PagoServicio = sequelize.define('pago_servicio', {
    idpago: {
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
    idagenda: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: AgendaTurno,
            key: 'idagenda'
        }
    },
    monto_pago: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    monto_comision_barbero: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false
    },
    metodo_pago: {
        type: DataTypes.ENUM('efectivo', 'transferencia', 'tarjeta'),
        allowNull: false
    },
    fecha_pago: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    },
    archivado: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
    },
});

PagoServicio.belongsTo(EmpresaBarberia, { foreignKey: 'idbarberia', onDelete: 'RESTRICT' });
PagoServicio.belongsTo(AgendaTurno, { foreignKey: 'idagenda', onDelete: 'CASCADE', as: 'agenda_turno' });
AgendaTurno.hasOne(PagoServicio, { foreignKey: 'idagenda', as: 'pago' });

module.exports = PagoServicio;