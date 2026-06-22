const { DataTypes } = require('sequelize');
const sequelize = require('../../config/database');
const EmpresaBarberia = require('./EmpresaBarberia');

const ImagenesGaleria = sequelize.define('imagenes_galeria', {
    idimagen: {
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
    url_imagen: {
        type: DataTypes.STRING(255),
        allowNull: false
    },
    tipo_seccion: {
        type: DataTypes.ENUM('perfil_usuario', 'landing_galeria'),
        allowNull: false
    },
    id_referencia: {
        type: DataTypes.INTEGER,
        allowNull: true // Guarda el idusuario si pertenece a su perfil
    }
});

ImagenesGaleria.belongsTo(EmpresaBarberia, { foreignKey: 'idbarberia', onDelete: 'RESTRICT' });

module.exports = ImagenesGaleria;