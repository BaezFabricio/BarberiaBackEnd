// Política de contraseñas, una sola para todos los caminos (alta, cambio, restablecimiento).
// El tope de 72 es el límite real de bcrypt: más allá de eso ignora el resto del texto.
const validarPassword = password => {
    if (typeof password !== 'string' || !password) return 'La contraseña es obligatoria.';
    if (password.length < 8) return 'La contraseña debe tener al menos 8 caracteres.';
    if (Buffer.byteLength(password) > 72) return 'La contraseña es demasiado larga (máximo 72 caracteres).';
    return null;
};

module.exports = { validarPassword };
