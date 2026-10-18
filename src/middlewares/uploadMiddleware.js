const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// SVG queda afuera a propósito: puede llevar scripts.
const TIPOS_PERMITIDOS = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

// Cada barbería sube a su propia carpeta (barberia/<id>/<seccion>): se puede medir, limpiar o borrar por separado.
const makeUpload = (folder, maxArchivos = 10) => {
    const storage = new CloudinaryStorage({
        cloudinary,
        params: async (req) => ({
            folder: `barberia/${req.usuario.idbarberia}/${folder}`,
            allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
            transformation: [{ width: 1200, crop: 'limit' }],
        }),
    });
    const upload = multer({
        storage,
        limits: { fileSize: MAX_BYTES, files: maxArchivos },
        // Se rechaza antes de mandar nada a Cloudinary.
        fileFilter: (req, file, cb) => TIPOS_PERMITIDOS.includes(file.mimetype)
            ? cb(null, true)
            : cb(Object.assign(new Error('Tipo de archivo no permitido'), { code: 'TIPO_NO_PERMITIDO' })),
    });
    return {
        single:   upload.single('imagen'),
        multiple: upload.array('imagenes', maxArchivos),
    };
};

// Mensaje para el usuario. El texto interno del error (puede traer datos de Cloudinary) no se devuelve nunca.
function mensajeDeError(err) {
    if (err?.code === 'LIMIT_FILE_SIZE') return { status: 413, error: 'La imagen supera los 5 MB.' };
    if (err?.code === 'LIMIT_FILE_COUNT' || err?.code === 'LIMIT_UNEXPECTED_FILE') return { status: 400, error: 'Cantidad de imágenes no permitida.' };
    if (err?.code === 'TIPO_NO_PERMITIDO') return { status: 400, error: 'Solo se aceptan imágenes JPG, PNG o WebP.' };
    console.error('Error al subir imagen:', err?.message);
    return { status: 400, error: 'No se pudo subir la imagen.' };
}

// 'https://res.cloudinary.com/x/image/upload/v123/barberia/7/galeria/abc.jpg' -> 'barberia/7/galeria/abc'
// (también sirve para las carpetas anteriores, sin id de barbería).
const publicIdDesdeUrl = url => String(url).match(/\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+$/i)?.[1] ?? null;

// Borra de Cloudinary archivos que se subieron pero no se van a usar.
async function descartarSubidas(files = []) {
    for (const f of files) {
        try { await cloudinary.uploader.destroy(f.filename); } catch { /* si no se puede, queda huérfano */ }
    }
}

async function borrarDeCloudinary(url) {
    const publicId = publicIdDesdeUrl(url);
    if (!publicId) return;
    try { await cloudinary.uploader.destroy(publicId); } catch { /* ya no está o no se pudo: no frena el borrado */ }
}

module.exports = { makeUpload, cloudinary, mensajeDeError, publicIdDesdeUrl, descartarSubidas, borrarDeCloudinary };
