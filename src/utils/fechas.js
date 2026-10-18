// Fechas y horas en Argentina (UTC-3 fijo, sin horario de verano).
// La base guarda los DATETIME en UTC y los DATE/TIME como horario local; nada de esto
// depende de la zona horaria del proceso (en la nube suele ser UTC).
const OFFSET = '-03:00';
const MS_3H = 3 * 60 * 60 * 1000;

// 'YYYY-MM-DD' en Argentina del instante dado (por defecto, ahora).
const fechaAR = (instante = new Date()) => new Date(instante.getTime() - MS_3H).toISOString().slice(0, 10);

// 'HH:MM:SS' en Argentina del instante dado (por defecto, ahora).
const horaAR = (instante = new Date()) => new Date(instante.getTime() - MS_3H).toISOString().slice(11, 19);

// Suma (o resta) días a una fecha 'YYYY-MM-DD' sin pasar por zonas horarias.
const sumarDias = (fecha, dias) => {
    const d = new Date(`${fecha}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
};

// Primer día del mes (en Argentina) del instante dado.
const primerDiaMesAR = (instante = new Date()) => `${fechaAR(instante).slice(0, 8)}01`;

// Instantes exactos (UTC) en que empieza y termina un día argentino.
const inicioDiaAR = fecha => new Date(`${fecha}T00:00:00.000${OFFSET}`);
const finDiaAR = fecha => new Date(`${fecha}T23:59:59.999${OFFSET}`);

module.exports = { fechaAR, horaAR, sumarDias, primerDiaMesAR, inicioDiaAR, finDiaAR };
