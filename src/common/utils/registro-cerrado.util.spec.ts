import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Role } from 'src/common/enums/role.enum';
import { ActiveUserInterface } from 'src/common/interfaces/active-user.interface';
import {
  assertNoCerrado,
  assertPuedeReabrir,
  exigirMotivo,
} from './registro-cerrado.util';

const usuario = (role: Role): ActiveUserInterface =>
  ({ id: 'u-1', companyId: 'c-1', role }) as ActiveUserInterface;

describe('assertNoCerrado', () => {
  it('deja pasar lo que sigue abierto', () => {
    expect(() => assertNoCerrado(false, 'no debería')).not.toThrow();
  });

  it('corta con el mensaje que le pasa el servicio', () => {
    expect(() => assertNoCerrado(true, 'Está firmado.')).toThrow(
      BadRequestException,
    );
    expect(() => assertNoCerrado(true, 'Está firmado.')).toThrow('Está firmado.');
  });
});

describe('assertPuedeReabrir', () => {
  it.each([Role.ADMIN, Role.MANAGER, Role.DISPATCHER])(
    'habilita a %s con la lista por defecto',
    (role) => {
      expect(() => assertPuedeReabrir(usuario(role))).not.toThrow();
    },
  );

  it.each([Role.DRIVER, Role.MAINTENANCE, Role.HR, Role.AUDITOR])(
    'rechaza a %s',
    (role) => {
      expect(() => assertPuedeReabrir(usuario(role))).toThrow(
        ForbiddenException,
      );
    },
  );

  it('acepta una lista propia: mantenimiento reabre sus órdenes', () => {
    const soloTaller = [Role.ADMIN, Role.MAINTENANCE];
    expect(() =>
      assertPuedeReabrir(usuario(Role.MAINTENANCE), soloTaller),
    ).not.toThrow();
    // Y el despachante, que sí reabre incidentes, acá no.
    expect(() =>
      assertPuedeReabrir(usuario(Role.DISPATCHER), soloTaller),
    ).toThrow(ForbiddenException);
  });
});

describe('exigirMotivo', () => {
  it('devuelve el motivo sin espacios sobrantes', () => {
    expect(exigirMotivo('  volvió a fallar  ', 'el incidente')).toBe(
      'volvió a fallar',
    );
  });

  it.each([undefined, '', '   ', 'asd'])(
    'rechaza %p porque no explica nada',
    (motivo) => {
      expect(() => exigirMotivo(motivo, 'el incidente')).toThrow(
        BadRequestException,
      );
    },
  );

  it('nombra en el error qué se estaba reabriendo', () => {
    expect(() => exigirMotivo('', 'la liquidación')).toThrow(
      /reabre la liquidación/,
    );
  });
});
