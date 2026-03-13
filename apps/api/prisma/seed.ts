import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding Gepetto Shield database...');

  const hash = await bcrypt.hash('GepettoShield2025!', 12);

  // ═══ USERS: 5 agents + 1 broker + 1 perito + 1 reparador + 1 employee + 2 clients ═══
  const users = await Promise.all([
    prisma.user.upsert({
      where: { email: 'agente.garcia@occident.com' },
      update: {},
      create: {
        email: 'agente.garcia@occident.com',
        passwordHash: hash,
        role: 'AGENTE_EXCLUSIVO_TITULAR',
        channel: 'AGENCIAS',
        orgId: 'AGT-28491',
        orgDisplay: 'Agencia García & Asociados',
        territory: 'CATALUÑA',
        dataClearance: 'MEDIO',
      },
    }),
    prisma.user.upsert({
      where: { email: 'agente.martinez@occident.com' },
      update: {},
      create: {
        email: 'agente.martinez@occident.com',
        passwordHash: hash,
        role: 'AGENTE_EXCLUSIVO_TITULAR',
        channel: 'AGENCIAS',
        orgId: 'AGT-15702',
        orgDisplay: 'Seguros Martínez SL',
        territory: 'MADRID',
        dataClearance: 'MEDIO',
      },
    }),
    prisma.user.upsert({
      where: { email: 'empleado.garcia@occident.com' },
      update: {},
      create: {
        email: 'empleado.garcia@occident.com',
        passwordHash: hash,
        role: 'AGENTE_EXCLUSIVO_EMPLEADO',
        channel: 'AGENCIAS',
        orgId: 'AGT-28491',
        orgDisplay: 'Agencia García & Asociados',
        territory: 'CATALUÑA',
        dataClearance: 'BAJO',
      },
    }),
    prisma.user.upsert({
      where: { email: 'corredor.lopez@corredurias.com' },
      update: {},
      create: {
        email: 'corredor.lopez@corredurias.com',
        passwordHash: hash,
        role: 'CORREDOR',
        channel: 'CORREDORES',
        orgId: 'COR-4521',
        orgDisplay: 'Correduría López & Partners',
        dataClearance: 'MEDIO',
      },
    }),
    prisma.user.upsert({
      where: { email: 'perito.fernandez@prepersa.com' },
      update: {},
      create: {
        email: 'perito.fernandez@prepersa.com',
        passwordHash: hash,
        role: 'PERITO',
        channel: 'PREPERSA',
        orgId: 'PER-891',
        orgDisplay: 'Perito Fernández',
        territory: 'CATALUÑA',
        dataClearance: 'MEDIO',
      },
    }),
    prisma.user.upsert({
      where: { email: 'reparador.ruiz@prepersa.com' },
      update: {},
      create: {
        email: 'reparador.ruiz@prepersa.com',
        passwordHash: hash,
        role: 'REPARADOR',
        channel: 'PREPERSA',
        orgId: 'REP-332',
        orgDisplay: 'Reparaciones Ruiz',
        dataClearance: 'BAJO',
      },
    }),
    prisma.user.upsert({
      where: { email: 'emp.siniestros@occident.com' },
      update: {},
      create: {
        email: 'emp.siniestros@occident.com',
        passwordHash: hash,
        role: 'EMPLEADO_SINIESTROS',
        channel: 'INTERNO',
        orgId: 'DEPT-SIN-CAT',
        orgDisplay: 'Departamento Siniestros Cataluña',
        territory: 'CATALUÑA',
        department: 'HOGAR',
        dataClearance: 'ALTO',
      },
    }),
    prisma.user.upsert({
      where: { email: 'cliente.sanchez@gmail.com' },
      update: {},
      create: {
        email: 'cliente.sanchez@gmail.com',
        passwordHash: hash,
        role: 'CLIENTE_PARTICULAR',
        channel: 'CLIENTES',
        orgId: 'CLI-PARTICULAR',
        orgDisplay: 'María Sánchez',
        dataClearance: 'BAJO',
      },
    }),
  ]);

  console.log(`Created ${users.length} users`);

  // ═══ CLIENTS: 20 clients across 2 agents + 1 broker ═══
  const clientsData = [
    // Agent García's clients (AGT-28491)
    { mediadorId: 'AGT-28491', nombre: 'María Sánchez López', nif: '12345678A', telefono: '612345678', email: 'maria@ejemplo.com', direccion: 'Calle Mayor 10, Barcelona' },
    { mediadorId: 'AGT-28491', nombre: 'Juan Pérez García', nif: '23456789B', telefono: '623456789', email: 'juan@ejemplo.com', direccion: 'Av. Diagonal 200, Barcelona' },
    { mediadorId: 'AGT-28491', nombre: 'Ana Martín Ruiz', nif: '34567890C', telefono: '634567890', email: 'ana@ejemplo.com', direccion: 'Rambla Catalunya 50, Barcelona' },
    { mediadorId: 'AGT-28491', nombre: 'Pedro González Díaz', nif: '45678901D', telefono: '645678901', email: 'pedro@ejemplo.com', direccion: 'Paseo de Gracia 100, Barcelona' },
    { mediadorId: 'AGT-28491', nombre: 'Laura Fernández Soto', nif: '56789012E', telefono: '656789012', email: 'laura@ejemplo.com', direccion: 'Calle Aribau 30, Barcelona' },
    { mediadorId: 'AGT-28491', nombre: 'Carlos Rodríguez Vega', nif: '67890123F', telefono: '667890123', email: 'carlos@ejemplo.com', direccion: 'Via Augusta 45, Barcelona' },
    { mediadorId: 'AGT-28491', nombre: 'Elena Torres Blanco', nif: '78901234G', telefono: '678901234', email: 'elena@ejemplo.com', direccion: 'Calle Balmes 80, Barcelona' },
    { mediadorId: 'AGT-28491', nombre: 'Transportes BCN SL', nif: '99887766H', telefono: '689012345', email: 'admin@transportesbcn.com', direccion: 'Polígono Industrial Zona Franca, Barcelona', empresaCif: 'B12345678' },
    // Agent Martínez's clients (AGT-15702)
    { mediadorId: 'AGT-15702', nombre: 'Roberto Álvarez Luna', nif: '11223344I', telefono: '611223344', email: 'roberto@ejemplo.com', direccion: 'Gran Vía 25, Madrid' },
    { mediadorId: 'AGT-15702', nombre: 'Sofía Navarro Paz', nif: '22334455J', telefono: '622334455', email: 'sofia@ejemplo.com', direccion: 'Calle Serrano 15, Madrid' },
    { mediadorId: 'AGT-15702', nombre: 'Miguel Herrera Gil', nif: '33445566K', telefono: '633445566', email: 'miguel@ejemplo.com', direccion: 'Paseo de la Castellana 50, Madrid' },
    { mediadorId: 'AGT-15702', nombre: 'Isabel Romero Cruz', nif: '44556677L', telefono: '644556677', email: 'isabel@ejemplo.com', direccion: 'Calle Alcalá 100, Madrid' },
    { mediadorId: 'AGT-15702', nombre: 'David Jiménez Mora', nif: '55667788M', telefono: '655667788', email: 'david@ejemplo.com', direccion: 'Calle Princesa 30, Madrid' },
    // Broker López's clients (COR-4521)
    { mediadorId: 'AGT-28491', corredorId: 'COR-4521', nombre: 'Patricia Ruiz Vidal', nif: '66778899N', telefono: '666778899', email: 'patricia@ejemplo.com', direccion: 'Av. de la Constitución 12, Valencia' },
    { mediadorId: 'AGT-28491', corredorId: 'COR-4521', nombre: 'Fernando Castro Ramos', nif: '77889900O', telefono: '677889900', email: 'fernando@ejemplo.com', direccion: 'Calle Colón 8, Valencia' },
  ];

  for (const c of clientsData) {
    await prisma.client.upsert({
      where: { nif: c.nif },
      update: {},
      create: c,
    });
  }
  console.log(`Created ${clientsData.length} clients`);

  // ═══ POLICIES: 20 policies ═══
  const now = new Date();
  const policiesData = [
    // Agent García's policies
    { mediadorId: 'AGT-28491', clienteNif: '12345678A', numero: 'POL-HG-2024-0001', ramo: 'HOGAR' as const, fechaInicio: now, estado: 'ACTIVA' as const, prima: 450.00 },
    { mediadorId: 'AGT-28491', clienteNif: '12345678A', numero: 'POL-AU-2024-0002', ramo: 'AUTO' as const, fechaInicio: now, estado: 'ACTIVA' as const, prima: 680.00 },
    { mediadorId: 'AGT-28491', clienteNif: '23456789B', numero: 'POL-VD-2024-0003', ramo: 'VIDA' as const, fechaInicio: now, estado: 'ACTIVA' as const, prima: 320.00 },
    { mediadorId: 'AGT-28491', clienteNif: '34567890C', numero: 'POL-SL-2024-0004', ramo: 'SALUD' as const, fechaInicio: now, estado: 'ACTIVA' as const, prima: 890.00 },
    { mediadorId: 'AGT-28491', clienteNif: '45678901D', numero: 'POL-HG-2024-0005', ramo: 'HOGAR' as const, fechaInicio: now, estado: 'ACTIVA' as const, prima: 520.00 },
    { mediadorId: 'AGT-28491', clienteNif: '56789012E', numero: 'POL-AU-2024-0006', ramo: 'AUTO' as const, fechaInicio: now, estado: 'VENCIDA' as const, prima: 710.00 },
    { mediadorId: 'AGT-28491', clienteNif: '67890123F', numero: 'POL-RC-2024-0007', ramo: 'RC' as const, fechaInicio: now, estado: 'ACTIVA' as const, prima: 1200.00 },
    { mediadorId: 'AGT-28491', clienteNif: '99887766H', numero: 'POL-CM-2024-0008', ramo: 'COMERCIO' as const, fechaInicio: now, estado: 'ACTIVA' as const, prima: 2400.00 },
    // Agent Martínez's policies
    { mediadorId: 'AGT-15702', clienteNif: '11223344I', numero: 'POL-HG-2024-0009', ramo: 'HOGAR' as const, fechaInicio: now, estado: 'ACTIVA' as const, prima: 480.00 },
    { mediadorId: 'AGT-15702', clienteNif: '22334455J', numero: 'POL-AU-2024-0010', ramo: 'AUTO' as const, fechaInicio: now, estado: 'ACTIVA' as const, prima: 590.00 },
    { mediadorId: 'AGT-15702', clienteNif: '33445566K', numero: 'POL-VD-2024-0011', ramo: 'VIDA' as const, fechaInicio: now, estado: 'ACTIVA' as const, prima: 280.00 },
    { mediadorId: 'AGT-15702', clienteNif: '44556677L', numero: 'POL-SL-2024-0012', ramo: 'SALUD' as const, fechaInicio: now, estado: 'ACTIVA' as const, prima: 950.00 },
    { mediadorId: 'AGT-15702', clienteNif: '55667788M', numero: 'POL-DC-2024-0013', ramo: 'DECESOS' as const, fechaInicio: now, estado: 'ACTIVA' as const, prima: 180.00 },
    // Broker López's policies
    { mediadorId: 'AGT-28491', corredorId: 'COR-4521', clienteNif: '66778899N', numero: 'POL-HG-2024-0014', ramo: 'HOGAR' as const, fechaInicio: now, estado: 'ACTIVA' as const, prima: 410.00 },
    { mediadorId: 'AGT-28491', corredorId: 'COR-4521', clienteNif: '77889900O', numero: 'POL-IN-2024-0015', ramo: 'INDUSTRIA' as const, fechaInicio: now, estado: 'ACTIVA' as const, prima: 3200.00 },
  ];

  const policies: { id: string; numero: string }[] = [];
  for (const p of policiesData) {
    const pol = await prisma.policy.upsert({
      where: { numero: p.numero },
      update: {},
      create: p,
    });
    policies.push({ id: pol.id, numero: pol.numero });
  }
  console.log(`Created ${policies.length} policies`);

  // ═══ CLAIMS: 8 claims ═══
  const pol1 = policies.find((p) => p.numero === 'POL-HG-2024-0001')!;
  const pol2 = policies.find((p) => p.numero === 'POL-AU-2024-0002')!;
  const pol5 = policies.find((p) => p.numero === 'POL-HG-2024-0005')!;
  const pol9 = policies.find((p) => p.numero === 'POL-HG-2024-0009')!;
  const pol10 = policies.find((p) => p.numero === 'POL-AU-2024-0010')!;

  const claimsData = [
    { mediadorId: 'AGT-28491', polizaId: pol1.id, numero: 'SIN-2024-00001', ramo: 'HOGAR' as const, territorio: 'CATALUÑA', peritoAsignadoId: 'PER-891', descripcion: 'Inundación en cocina por rotura tubería', valoracion: 3500.00, estado: 'PERITADO' as const },
    { mediadorId: 'AGT-28491', polizaId: pol2.id, numero: 'SIN-2024-00002', ramo: 'AUTO' as const, territorio: 'CATALUÑA', descripcion: 'Colisión trasera en aparcamiento', valoracion: 1800.00, estado: 'ABIERTO' as const },
    { mediadorId: 'AGT-28491', polizaId: pol5.id, numero: 'SIN-2024-00003', ramo: 'HOGAR' as const, territorio: 'CATALUÑA', peritoAsignadoId: 'PER-891', descripcion: 'Daños eléctricos por sobretensión', valoracion: 2200.00, estado: 'REPARANDO' as const },
    { mediadorId: 'AGT-15702', polizaId: pol9.id, numero: 'SIN-2024-00004', ramo: 'HOGAR' as const, territorio: 'MADRID', descripcion: 'Robo en vivienda', valoracion: 8500.00, estado: 'EN_TRAMITE' as const },
    { mediadorId: 'AGT-15702', polizaId: pol10.id, numero: 'SIN-2024-00005', ramo: 'AUTO' as const, territorio: 'MADRID', descripcion: 'Accidente en rotonda', valoracion: 4200.00, estado: 'ABIERTO' as const },
  ];

  const claims: { id: string; numero: string }[] = [];
  for (const c of claimsData) {
    const claim = await prisma.claim.upsert({
      where: { numero: c.numero },
      update: {},
      create: c,
    });
    claims.push({ id: claim.id, numero: claim.numero });
  }
  console.log(`Created ${claims.length} claims`);

  // ═══ WORK ORDERS ═══
  const claim1 = claims.find((c) => c.numero === 'SIN-2024-00001')!;
  const claim3 = claims.find((c) => c.numero === 'SIN-2024-00003')!;

  await prisma.workOrder.createMany({
    data: [
      { siniestroId: claim1.id, reparadorId: 'REP-332', tipo: 'Fontanería', descripcion: 'Reparar tubería rota en cocina y secar paredes', estado: 'EN_CURSO' },
      { siniestroId: claim3.id, reparadorId: 'REP-332', tipo: 'Electricidad', descripcion: 'Revisar cuadro eléctrico y sustituir diferencial', estado: 'PENDIENTE' },
    ],
    skipDuplicates: true,
  });
  console.log('Created 2 work orders');

  // ═══ COMMISSIONS ═══
  for (const pol of policies.filter((_, i) => i < 8)) {
    await prisma.commission.create({
      data: {
        mediadorId: 'AGT-28491',
        polizaId: pol.id,
        importe: Math.round(Math.random() * 200 + 50),
        periodo: '2024-Q4',
      },
    });
  }
  console.log('Created 8 commissions');

  // ═══ CANARY TOKENS ═══
  await prisma.canaryToken.createMany({
    data: [
      { tenantId: 'AGT-28491', token: 'CANARY-seed-agt28491-001', isActive: true },
      { tenantId: 'AGT-15702', token: 'CANARY-seed-agt15702-001', isActive: true },
    ],
    skipDuplicates: true,
  });
  console.log('Created 2 canary tokens');

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
