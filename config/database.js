const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(
    process.env.DB_NAME,
    process.env.DB_USER,
    process.env.DB_PASSWORD,
    {
        host: process.env.DB_HOST,
        dialect: 'mysql',
        logging: false, // Evita que llene la consola de líneas de texto SQL transparentes
        define: {
            timestamps: false,    // Tu script SQL ya maneja las fechas a mano
            freezeTableName: true // Evita que Sequelize te cambie los nombres de las tablas a plural
        }
    }
);

module.exports = sequelize;