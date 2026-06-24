const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const makeUpload = (folder) => {
    const storage = new CloudinaryStorage({
        cloudinary,
        params: {
            folder: `barberia/${folder}`,
            allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
            transformation: [{ width: 1200, crop: 'limit' }],
        },
    });
    const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });
    return {
        single:   upload.single('imagen'),
        multiple: upload.array('imagenes', 20),
    };
};

module.exports = { makeUpload, cloudinary };
