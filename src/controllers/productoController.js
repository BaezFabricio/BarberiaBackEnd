const Producto = require('../models/Producto');

const CAMPOS_EDITABLES = ['nombre_producto', 'descripcion', 'categoria', 'precio_venta', 'stock_actual', 'stock_minimo'];

const listar = async (req, res) => {
    try {
        const productos = await Producto.findAll({
            where: { idbarberia: req.usuario.idbarberia },
            order: [['nombre_producto', 'ASC']]
        });
        res.json(productos);
    } catch (error) {
        console.error('Error al listar productos:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const crear = async (req, res) => {
    const { nombre_producto, descripcion, categoria, precio_venta, stock_actual, stock_minimo } = req.body;
    if (!nombre_producto || !categoria || !precio_venta) {
        return res.status(400).json({ error: 'nombre_producto, categoria y precio_venta son obligatorios.' });
    }
    try {
        const producto = await Producto.create({
            idbarberia: req.usuario.idbarberia,
            nombre_producto, descripcion, categoria, precio_venta,
            stock_actual: stock_actual ?? 0,
            stock_minimo: stock_minimo ?? 5
        });
        res.status(201).json(producto);
    } catch (error) {
        console.error('Error al crear producto:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

const actualizar = async (req, res) => {
    try {
        const producto = await Producto.findOne({
            where: { idproducto: req.params.id, idbarberia: req.usuario.idbarberia }
        });
        if (!producto) return res.status(404).json({ error: 'Producto no encontrado.' });

        // Lista blanca: nunca se acepta idbarberia, idproducto ni otros campos del body.
        const cambios = {};
        for (const campo of CAMPOS_EDITABLES) if (req.body[campo] !== undefined) cambios[campo] = req.body[campo];
        for (const numerico of ['precio_venta', 'stock_actual', 'stock_minimo']) {
            if (cambios[numerico] !== undefined && !(Number(cambios[numerico]) >= 0)) {
                return res.status(400).json({ error: `${numerico} inválido.` });
            }
        }
        await producto.update(cambios);
        res.json(producto);
    } catch (error) {
        console.error('Error al actualizar producto:', error);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
};

module.exports = { listar, crear, actualizar };
