import { PrismaClient } from '@prisma/client';

const variedades = [
  // Subgrupo Cavendish (AAA, exportación mundial)
  {
    codigo: 'CAVENDISH',
    nombre: 'Cavendish',
    descripcion:
      'Subgrupo Cavendish; estándar del comercio internacional de exportación (AAA)',
  },
  {
    codigo: 'GRAN_ENANO',
    nombre: 'Gran Enano',
    descripcion:
      'Dwarf Cavendish; clon más cultivado del subgrupo Cavendish',
  },
  {
    codigo: 'GRAND_NAINE',
    nombre: 'Grand Naine',
    descripcion:
      'Clon principal del comercio internacional (banana Chiquita); AAA',
  },
  {
    codigo: 'WILLIAMS',
    nombre: 'Williams',
    descripcion:
      'Giant Cavendish; variedad de exportación de porte alto',
  },
  {
    codigo: 'VALERY',
    nombre: 'Valéry',
    descripcion:
      'Cultivar Cavendish de porte alto usado en exportación',
  },
  {
    codigo: 'ROBUSTA',
    nombre: 'Robusta',
    descripcion:
      'Cultivar del subgrupo Cavendish, resistente al transporte',
  },
  {
    codigo: 'POYO',
    nombre: 'Poyo',
    descripcion:
      'Cultivar Cavendish de fruto grueso, usado en exportación',
  },
  // Histórica
  {
    codigo: 'GROS_MICHEL',
    nombre: 'Gros Michel',
    descripcion:
      'AAA; dominó la exportación hasta los años 50; sustituida por Cavendish por el Mal de Panamá; piel gruesa resistente al transporte',
  },
  // Otras variedades de postre
  {
    codigo: 'LADY_FINGER',
    nombre: 'Lady Finger',
    descripcion:
      'AAB; banano manzana dulce, tamaño pequeño, consumo de nicho',
  },
  {
    codigo: 'RED_DACCA',
    nombre: 'Red Dacca',
    descripcion:
      'AAA; banano rojo de pulpa cremosa, mercado de especialidad',
  },
  {
    codigo: 'BLUE_JAVA',
    nombre: 'Blue Java',
    descripcion:
      'ABB; banano \'helado\', cáscara plateada azulada, consumo local',
  },
  {
    codigo: 'LAKATAN',
    nombre: 'Lakatan',
    descripcion:
      'AAA; variedad premium de postre de Filipinas, piel amarilla',
  },
  {
    codigo: 'LATUNDAN',
    nombre: 'Latundan',
    descripcion:
      'AAB; banano seda (Silk), dulce, popular en Filipinas e India',
  },
  {
    codigo: 'PISANG_RAJA',
    nombre: 'Pisang Raja',
    descripcion:
      'AAB; variedad de postre de Indonesia, muy aromática',
  },
  {
    codigo: 'PISANG_MAS',
    nombre: 'Pisang Mas',
    descripcion:
      'AA; banano dorado pequeño (Sucrier), alto contenido de azúcar',
  },
  {
    codigo: 'PISANG_AWAK',
    nombre: 'Pisang Awak',
    descripcion:
      'ABB; Ducasse, de usos múltiples, tolerante a sequía',
  },
  {
    codigo: 'SABA',
    nombre: 'Saba',
    descripcion:
      'ABB; variedad de cocina y procesamiento de Filipinas, alta resistencia',
  },
  {
    codigo: 'BURRO',
    nombre: 'Burro',
    descripcion:
      'ABB; banano burro, angular y firme, mercado latino',
  },
  {
    codigo: 'PRATA',
    nombre: 'Prata',
    descripcion:
      'AAB; Pome, postre popular en Brasil y África occidental',
  },
  {
    codigo: 'PACOVAN',
    nombre: 'Pacovan',
    descripcion:
      'AAB; clon de Prata, muy cultivado en el nordeste de Brasil',
  },
  {
    codigo: 'NANICA',
    nombre: 'Nanicão',
    descripcion:
      'AAA; Cavendish brasileño, porte medio, exportación',
  },
  {
    codigo: 'YANGAMBI_KM5',
    nombre: 'Yangambi Km5',
    descripcion:
      'AAA; cultivar de África central, resistente a Sigatoka',
  },
  {
    codigo: 'FHIA_01',
    nombre: 'FHIA-01',
    descripcion:
      'AAAA; híbrido \'Goldfinger\', resistente a enfermedades (Mal de Panamá y Sigatoka)',
  },
  {
    codigo: 'FHIA_17',
    nombre: 'FHIA-17',
    descripcion:
      'AAAA; híbrido de postre de alta resistencia, desarrollado por FHIA',
  },
  {
    codigo: 'FHIA_21',
    nombre: 'FHIA-21',
    descripcion:
      'AAAA; híbrido de cocina resistente, desarrollado por FHIA',
  },
  // Plátanos de cocina (AAB/ABB)
  {
    codigo: 'PLANTAIN',
    nombre: 'Plátano',
    descripcion:
      'AAB; grupo plátano de cocina, consumo en América, África y Asia',
  },
  {
    codigo: 'MACHO',
    nombre: 'Plátano Macho',
    descripcion:
      'AAB; plátano latino de cocina, grande y almidonado',
  },
  {
    codigo: 'HORN_PLANTAIN',
    nombre: 'Plátano Cuerno',
    descripcion:
      'AAB; French Horn, plátano de frutos largos para cocinar',
  },
  {
    codigo: 'MAQUEÑO',
    nombre: 'Plátano Maqueño',
    descripcion:
      'AAB; variedad de cocina de Ecuador, muy consumida',
  },
];

export async function seedVariedades(prisma: PrismaClient) {
  for (const variedad of variedades) {
    await prisma.variedad.upsert({
      where: { codigo: variedad.codigo },
      update: {},
      create: variedad,
    });
  }

  console.log(`✅ Catálogo de variedades creado (${variedades.length} variedades).`);
}
