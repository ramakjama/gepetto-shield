/**
 * COPILOT OCCIDENT — Role Definitions
 * 12 roles across 6 channels of Occident insurance company
 */

export enum Role {
  // Canal Agencias Exclusivas (~15.000 mediadores)
  AGENTE_EXCLUSIVO_TITULAR = 'AGENTE_EXCLUSIVO_TITULAR',
  AGENTE_EXCLUSIVO_EMPLEADO = 'AGENTE_EXCLUSIVO_EMPLEADO',

  // Canal Corredores
  CORREDOR = 'CORREDOR',

  // Prepersa (gestión de siniestros)
  PERITO = 'PERITO',
  REPARADOR = 'REPARADOR',
  TALLER_AUTOPRESTO = 'TALLER_AUTOPRESTO',
  ABOGADO_PREPERSA = 'ABOGADO_PREPERSA',

  // Empleados Occident (~2.700)
  EMPLEADO_SINIESTROS = 'EMPLEADO_SINIESTROS',
  EMPLEADO_COMERCIAL = 'EMPLEADO_COMERCIAL',
  EMPLEADO_SALUD = 'EMPLEADO_SALUD',

  // Clientes (4.7M asegurados)
  CLIENTE_PARTICULAR = 'CLIENTE_PARTICULAR',
  CLIENTE_EMPRESA = 'CLIENTE_EMPRESA',
}

export enum Channel {
  AGENCIAS = 'AGENCIAS',
  CORREDORES = 'CORREDORES',
  ESPECIALISTAS = 'ESPECIALISTAS',
  INTERNO = 'INTERNO',
  PREPERSA = 'PREPERSA',
  CLIENTES = 'CLIENTES',
}

export enum LegacyBrand {
  SCO = 'SCO', // Seguros Catalana Occidente
  PUS = 'PUS', // Plus Ultra Seguros
  SBI = 'SBI', // Seguros Bilbao
  NHS = 'NHS', // NorteHispana Seguros
}

export enum DataClearance {
  BAJO = 'BAJO',
  MEDIO = 'MEDIO',
  ALTO = 'ALTO',
  CRITICO = 'CRITICO',
}

export enum Ramo {
  HOGAR = 'HOGAR',
  AUTO = 'AUTO',
  VIDA = 'VIDA',
  SALUD = 'SALUD',
  COMERCIO = 'COMERCIO',
  INDUSTRIA = 'INDUSTRIA',
  RC = 'RC',
  DECESOS = 'DECESOS',
  ACCIDENTES = 'ACCIDENTES',
}

export const ROLE_CHANNEL_MAP: Record<Role, Channel> = {
  [Role.AGENTE_EXCLUSIVO_TITULAR]: Channel.AGENCIAS,
  [Role.AGENTE_EXCLUSIVO_EMPLEADO]: Channel.AGENCIAS,
  [Role.CORREDOR]: Channel.CORREDORES,
  [Role.PERITO]: Channel.PREPERSA,
  [Role.REPARADOR]: Channel.PREPERSA,
  [Role.TALLER_AUTOPRESTO]: Channel.PREPERSA,
  [Role.ABOGADO_PREPERSA]: Channel.PREPERSA,
  [Role.EMPLEADO_SINIESTROS]: Channel.INTERNO,
  [Role.EMPLEADO_COMERCIAL]: Channel.INTERNO,
  [Role.EMPLEADO_SALUD]: Channel.INTERNO,
  [Role.CLIENTE_PARTICULAR]: Channel.CLIENTES,
  [Role.CLIENTE_EMPRESA]: Channel.CLIENTES,
};
