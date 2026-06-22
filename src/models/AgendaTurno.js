const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const EmpresaBarberia = require('./EmpresaBarberia');
const Cliente = require('./Cliente');
const Usuario = require('./Usuario');
const Servicio = require('./Servicio');

const AgendaTurno = sequelize.define('agenda_turno', {
    idagenda: {
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
    idcliente: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: {
            model: Cliente,
            key: 'idcliente'
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
    idservicio: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: {
            model: Servicio,
            key: 'idservicio'
        }
    },
    fecha: {
        type: DataTypes.DATEONLY, // DATEONLY guarda solo YYYY-MM-DD sin hora
        allowNull: false
    },
    hora_inicio: {
        type: DataTypes.TIME,
        allowNull: false
    },
    hora_fin: {
        type: DataTypes.TIME,
        allowNull: false
    },
    estado: {
        type: DataTypes.ENUM('pendiente', 'confirmado', 'atendido', 'ausente', 'cancelado', 'archivado'),
        defaultValue: 'pendiente',
        allowNull: false
    },
    tipo_alta: {
        type: DataTypes.ENUM('web', 'orden_de_llegada'),
        defaultValue: 'web',
        allowNull: false
    },
    fecha_creacion: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW
    }
});

// Configuración de las Relaciones de la Agenda
AgendaTurno.belongsTo(EmpresaBarberia, { foreignKey: 'idbarberia', onDelete: 'RESTRICT' });
AgendaTurno.belongsTo(Cliente, { foreignKey: 'idcliente', onDelete: 'SET NULL' });
AgendaTurno.belongsTo(Usuario, { foreignKey: 'idusuario_barbero', as: 'barbero' }); // 'as' ayuda a diferenciarlo en las consultas
AgendaTurno.belongsTo(Servicio, { foreignKey: 'idservicio' });

module.exports = AgendaTurno;