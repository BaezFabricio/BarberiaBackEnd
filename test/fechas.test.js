// Pruebas de las funciones de fecha (no necesitan base de datos ni servidor).
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/utils/fechas');

describe('fechas en Argentina (UTC-3)', () => {
  it('después de las 21 hs argentinas el día NO se corre', () => {
    // 2030-01-01 02:30 UTC = 31/12/2029 23:30 en Argentina
    assert.equal(F.fechaAR(new Date('2030-01-01T02:30:00Z')), '2029-12-31');
    assert.equal(F.horaAR(new Date('2030-01-01T02:30:00Z')), '23:30:00');
  });

  it('pasadas las 00:00 argentinas ya es el día siguiente', () => {
    assert.equal(F.fechaAR(new Date('2030-01-01T03:00:00Z')), '2030-01-01');
    assert.equal(F.horaAR(new Date('2030-01-01T03:00:00Z')), '00:00:00');
  });

  it('sumarDias cruza fin de mes y año bisiesto', () => {
    assert.equal(F.sumarDias('2030-03-01', -1), '2030-02-28');
    assert.equal(F.sumarDias('2028-02-28', 1), '2028-02-29');
    assert.equal(F.sumarDias('2029-12-31', 1), '2030-01-01');
  });

  it('el primer día del mes se calcula en hora argentina', () => {
    // 2030-03-01 02:00 UTC todavía es 28/02 en Argentina
    assert.equal(F.primerDiaMesAR(new Date('2030-03-01T02:00:00Z')), '2030-02-01');
    assert.equal(F.primerDiaMesAR(new Date('2030-03-01T03:00:00Z')), '2030-03-01');
  });

  it('inicio y fin de un día argentino son los instantes UTC correctos', () => {
    assert.equal(F.inicioDiaAR('2030-01-01').toISOString(), '2030-01-01T03:00:00.000Z');
    assert.equal(F.finDiaAR('2030-01-01').toISOString(), '2030-01-02T02:59:59.999Z');
  });
});
