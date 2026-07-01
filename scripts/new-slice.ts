/**
 * VSA slice scaffolder — `pnpm new:slice <dominio> <accion>`.
 *
 * Generates the three files a Vertical Slice Architecture action needs
 * (`<accion>.handler.ts`, `<accion>.dto.ts`, `<accion>.spec.ts`) inside
 * `src/features/<dominio>/<accion>/`, following the exact conventions used by
 * the `usuarios` example domain: direct `PrismaService` injection, Zod DTOs
 * via `createZodDto`, an `ApiEnvelope<T>` return, `@Roles()` + Swagger
 * decorators, and a co-located spec mocking `PrismaService`.
 *
 * No third-party dependency (Plop, etc.) on purpose: `pnpm run init` removes
 * `@clack/prompts` and `execa` once it has tailored the template, so any
 * generator that ships with the template must keep working afterwards with
 * only Node's standard library.
 *
 * The generated handler contains a `// TODO` where the real Prisma query goes
 * — this script cannot know your Prisma model's shape, only the surrounding
 * boilerplate (imports, decorators, envelope, error handling, test scaffold).
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = process.cwd();

type Verb = 'create' | 'list' | 'getOne' | 'update' | 'remove';

const VERB_KEYWORDS: Record<Verb, string[]> = {
  create: ['crear', 'crea', 'nuevo', 'nueva', 'agregar', 'add', 'create'],
  list: ['listar', 'lista', 'list'],
  getOne: ['obtener', 'ver', 'mostrar', 'show', 'get'],
  update: ['actualizar', 'editar', 'update', 'modificar'],
  remove: ['eliminar', 'borrar', 'delete', 'remove'],
};

function detectVerb(accion: string): Verb {
  const first = accion.split('-')[0];
  for (const [verb, keywords] of Object.entries(VERB_KEYWORDS)) {
    if (keywords.includes(first)) return verb as Verb;
  }
  return 'getOne';
}

/** kebab-case -> PascalCase, e.g. "crear-producto" -> "CrearProducto". */
function toPascalCase(kebab: string): string {
  return kebab
    .split('-')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

/** kebab-case -> camelCase, e.g. "crear-producto" -> "crearProducto". */
function toCamelCase(kebab: string): string {
  const pascal = toPascalCase(kebab);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}

function validateKebab(value: string, label: string): void {
  if (!/^[a-z][a-z0-9-]*$/.test(value)) {
    console.error(
      `❌ "${label}" debe ser kebab-case (minúsculas, números y guiones): recibido "${value}"`,
    );
    process.exit(1);
  }
}

// --------------------------------------------------------------------------
// Templates
// --------------------------------------------------------------------------

interface TemplateInput {
  dominio: string; // e.g. "productos"
  dominioPascal: string; // "Productos"
  accion: string; // e.g. "crear-producto"
  accionPascal: string; // "CrearProducto"
  accionCamel: string; // "crearProducto"
  verb: Verb;
}

function dtoTemplate({ accionPascal }: TemplateInput): string {
  return `import { z } from 'zod';
import { createZodDto } from 'nestjs-zod';

// TODO: ajusta los campos al recurso real. Este schema es el punto de partida
// tanto para el body/query de entrada como para el shape de salida.
export const ${accionPascal}Schema = z.object({
  id: z.string().uuid(),
  // TODO: agrega el resto de los campos del recurso.
});

export class ${accionPascal}Dto extends createZodDto(${accionPascal}Schema) {}

export type ${accionPascal}Data = z.infer<typeof ${accionPascal}Schema>;
`;
}

function handlerTemplate(input: TemplateInput): string {
  const { dominio, dominioPascal, accion, accionPascal, accionCamel, verb } =
    input;

  const common = {
    imports: [
      'Controller',
      verb === 'create' || verb === 'remove' ? 'HttpCode' : null,
      verb === 'create' || verb === 'remove' ? 'HttpStatus' : null,
      verb === 'create' ? 'Body' : null,
      verb === 'update' ? 'Body' : null,
      verb === 'getOne' || verb === 'update' || verb === 'remove'
        ? 'Param'
        : null,
      verb === 'getOne' || verb === 'update' || verb === 'remove'
        ? 'ParseUUIDPipe'
        : null,
      verb === 'getOne' || verb === 'update' || verb === 'remove'
        ? 'NotFoundException'
        : null,
      verb === 'list' ? 'Query' : null,
    ].filter((x): x is string => Boolean(x)),
  };

  const routeDecoratorMap: Record<Verb, string> = {
    create: `@Post()\n  @HttpCode(HttpStatus.CREATED)`,
    list: `@Get()`,
    getOne: `@Get(':id')`,
    update: `@Patch(':id')`,
    remove: `@Delete(':id')\n  @HttpCode(HttpStatus.NO_CONTENT)`,
  };
  const verbNestImport: Record<Verb, string> = {
    create: 'Post',
    list: 'Get',
    getOne: 'Get',
    update: 'Patch',
    remove: 'Delete',
  };
  common.imports.push(verbNestImport[verb]);

  const params: Record<Verb, string> = {
    create: `@Body() dto: ${accionPascal}Dto`,
    list: `@Query() query: PaginationQueryDto`,
    getOne: `@Param('id', ParseUUIDPipe) id: string`,
    update: `@Param('id', ParseUUIDPipe) id: string,\n    @Body() dto: ${accionPascal}Dto`,
    remove: `@Param('id', ParseUUIDPipe) id: string`,
  };

  const returnType: Record<Verb, string> = {
    create: `Promise<ApiEnvelope<${accionPascal}Data>>`,
    list: `Promise<ApiEnvelope<${accionPascal}Data[]> & { meta: PaginationMeta & { timestamp: string } }>`,
    getOne: `Promise<ApiEnvelope<${accionPascal}Data>>`,
    update: `Promise<ApiEnvelope<${accionPascal}Data>>`,
    remove: `Promise<ApiEnvelope<null>>`,
  };

  const paginationImport =
    verb === 'list'
      ? `import {\n  Roles,\n  buildPaginationMeta,\n  type PaginationMeta,\n  PaginationQueryDto,\n} from '@app/common';`
      : `import { Roles } from '@app/common';`;

  // Every stub below references `this.prisma` (and its params) at least once
  // via `void`, purely so the generated file passes `noUnusedLocals` /
  // `noUnusedParameters` before you've wired up the real Prisma call — remove
  // the `void` lines as soon as you use `this.prisma` / the param for real.
  const bodyByVerb: Record<Verb, string> = {
    create: `    void this.prisma;
    // TODO: reemplaza con la creación real vía Prisma, p.ej.:
    // const registro = await this.prisma.${dominio}.create({ data: { ...dto } });
    throw new Error(\`TODO: implementar creación en ${dominio}/${accion} (dto: \${JSON.stringify(dto)})\`);`,
    list: `    void this.prisma;
    const { page, limit } = query;
    // TODO: reemplaza con la consulta real vía Prisma, p.ej.:
    // const [items, total] = await Promise.all([
    //   this.prisma.${dominio}.findMany({ skip: (page - 1) * limit, take: limit }),
    //   this.prisma.${dominio}.count(),
    // ]);
    const items: ${accionPascal}Data[] = [];
    const total = 0;
    const paginationMeta = buildPaginationMeta(total, { page, limit });

    return {
      success: true,
      data: items,
      message: 'Listado obtenido exitosamente',
      meta: { ...paginationMeta, timestamp: new Date().toISOString() },
    };`,
    getOne: `    void this.prisma;
    // TODO: reemplaza con la búsqueda real vía Prisma, p.ej.:
    // const registro = await this.prisma.${dominio}.findUnique({ where: { id } });
    // if (!registro) throw new NotFoundException(\`No se encontró el registro con id "\${id}"\`);
    throw new NotFoundException(\`TODO: implementar búsqueda en ${dominio}/${accion} (id: \${id})\`);`,
    update: `    void this.prisma;
    // TODO: reemplaza con la actualización real vía Prisma, p.ej.:
    // const registro = await this.prisma.${dominio}.update({ where: { id }, data: { ...dto } });
    throw new NotFoundException(\`TODO: implementar actualización en ${dominio}/${accion} (id: \${id}, dto: \${JSON.stringify(dto)})\`);`,
    remove: `    void this.prisma;
    // TODO: reemplaza con la eliminación real vía Prisma, p.ej.:
    // await this.prisma.${dominio}.delete({ where: { id } });
    throw new NotFoundException(\`TODO: implementar eliminación en ${dominio}/${accion} (id: \${id})\`);`,
  };

  const successReturn: Record<Verb, string> = {
    create: `\n\n    return {
      success: true,
      data: null as unknown as ${accionPascal}Data,
      message: 'Recurso creado exitosamente',
      meta: { timestamp: new Date().toISOString() },
    };`,
    list: '',
    getOne: '',
    update: `\n\n    return {
      success: true,
      data: null as unknown as ${accionPascal}Data,
      message: 'Recurso actualizado exitosamente',
      meta: { timestamp: new Date().toISOString() },
    };`,
    remove: `\n\n    return {
      success: true,
      data: null,
      message: 'Recurso eliminado exitosamente',
      meta: { timestamp: new Date().toISOString() },
    };`,
  };

  const nestImports = Array.from(new Set(common.imports)).sort();

  // The DTO class is only needed as a type when the route actually takes a
  // body (`create`/`update`); `remove` returns `ApiEnvelope<null>` so it needs
  // neither; the rest only need the response `Data` type.
  const needsDto = verb === 'create' || verb === 'update';
  const needsData = verb !== 'remove';
  const dtoImportLine = needsDto
    ? `import { ${accionPascal}Dto, type ${accionPascal}Data } from './${accion}.dto';`
    : needsData
      ? `import type { ${accionPascal}Data } from './${accion}.dto';`
      : '';

  return `import {
  ${nestImports.join(',\n  ')},
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { PrismaService } from '@app/database';
import type { ApiEnvelope } from '@app/common';
${paginationImport}

${dtoImportLine}

@ApiTags('${dominioPascal}')
@ApiBearerAuth('bearer')
@Controller('${dominio}')
export class ${accionPascal}Handler {
  constructor(private readonly prisma: PrismaService) {}

  ${routeDecoratorMap[verb]}
  @Roles('Admin') // TODO: ajusta los roles permitidos para esta acción
  @ApiOperation({ summary: 'TODO: describe "${accion}"', operationId: '${accionCamel}' })
  async ${accionCamel}(
    ${params[verb]},
  ): ${returnType[verb]} {
${bodyByVerb[verb]}${successReturn[verb]}
  }
}
`;
}

function specTemplate({ accionPascal, accion }: TemplateInput): string {
  return `// Prevents the import of AppConfigModule (via PrismaModule) from triggering
// NestConfigModule.forRoot() env validation at import time.
jest.mock('@app/database', () => ({
  PrismaService: class PrismaService {},
}));

import { Test } from '@nestjs/testing';

import { PrismaService } from '@app/database';

import { ${accionPascal}Handler } from './${accion}.handler';

const mockPrisma = {
  // TODO: agrega los métodos de Prisma que uses (findUnique, create, etc.).
};

describe('${accionPascal}Handler', () => {
  let handler: ${accionPascal}Handler;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ${accionPascal}Handler,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    handler = module.get(${accionPascal}Handler);
    jest.clearAllMocks();
  });

  it('está definido', () => {
    expect(handler).toBeDefined();
  });

  it.todo('implementa el caso feliz una vez conectada la lógica de Prisma');

  it.todo('implementa el/los caso(s) de error (NotFoundException, ConflictException, etc.)');
});
`;
}

/** Module file created when the domain doesn't have one yet. */
function moduleTemplate(dominioPascal: string): string {
  return `import { Module } from '@nestjs/common';

/**
 * Módulo del dominio ${dominioPascal} (Vertical Slice Architecture).
 *
 * Cada slice es un controller autónomo que concentra endpoint, lógica de
 * negocio y DTOs en su propia carpeta. \`PrismaService\` se inyecta directamente
 * en cada handler — ya está disponible globalmente vía \`PrismaModule\`.
 */
@Module({
  controllers: [],
})
export class ${dominioPascal}Module {}
`;
}

// --------------------------------------------------------------------------
// Module wiring
// --------------------------------------------------------------------------

async function wireIntoModule(input: TemplateInput): Promise<void> {
  const { dominio, dominioPascal, accion, accionPascal } = input;
  const modulePath = join(
    ROOT,
    'src',
    'features',
    dominio,
    `${dominio}.module.ts`,
  );

  if (!existsSync(modulePath)) {
    await writeFile(modulePath, moduleTemplate(dominioPascal), 'utf8');
    console.log(
      `📦 Creado ${modulePath} — recuerda importar "${dominioPascal}Module" en src/app.module.ts`,
    );
  }

  const before = await readFile(modulePath, 'utf8');
  if (before.includes(`${accionPascal}Handler`)) {
    return; // already wired (re-running the generator for the same slice)
  }

  const importLine = `import { ${accionPascal}Handler } from './${accion}/${accion}.handler';\n`;
  let after = before;

  // Insert the import alphabetically-ish (right after the last import), then
  // append the handler to the `controllers` array.
  const lastImportMatch = [...after.matchAll(/^import .*;\n/gm)].pop();
  if (lastImportMatch) {
    const insertAt = lastImportMatch.index + lastImportMatch[0].length;
    after = after.slice(0, insertAt) + importLine + after.slice(insertAt);
  } else {
    after = importLine + after;
  }

  after = after.replace(
    /controllers:\s*\[([^\]]*)\]/,
    (_match, inner: string) => {
      // Strip a trailing comma left over from the previous entry so repeated
      // runs don't accumulate "Foo,,\n Bar" — only the last entry may lack one.
      const cleaned = inner.trim().replace(/,\s*$/, '');
      const separator = cleaned.length > 0 ? ',\n    ' : '\n    ';
      return `controllers: [${cleaned}${separator}${accionPascal}Handler,\n  ]`;
    },
  );

  await writeFile(modulePath, after, 'utf8');
  console.log(`🔌 "${accionPascal}Handler" registrado en ${modulePath}`);
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

async function run(): Promise<void> {
  const [, , dominioArg, accionArg] = process.argv;

  if (!dominioArg || !accionArg) {
    console.error(
      'Uso: pnpm new:slice <dominio> <accion>\n' +
        'Ejemplo: pnpm new:slice productos crear-producto',
    );
    process.exit(1);
  }

  validateKebab(dominioArg, 'dominio');
  validateKebab(accionArg, 'accion');

  const input: TemplateInput = {
    dominio: dominioArg,
    dominioPascal: toPascalCase(dominioArg),
    accion: accionArg,
    accionPascal: toPascalCase(accionArg),
    accionCamel: toCamelCase(accionArg),
    verb: detectVerb(accionArg),
  };

  const sliceDir = join(ROOT, 'src', 'features', input.dominio, input.accion);
  if (existsSync(sliceDir)) {
    console.error(`❌ Ya existe ${sliceDir} — elige otro nombre de acción.`);
    process.exit(1);
  }

  await mkdir(sliceDir, { recursive: true });

  await writeFile(
    join(sliceDir, `${input.accion}.dto.ts`),
    dtoTemplate(input),
    'utf8',
  );
  await writeFile(
    join(sliceDir, `${input.accion}.handler.ts`),
    handlerTemplate(input),
    'utf8',
  );
  await writeFile(
    join(sliceDir, `${input.accion}.spec.ts`),
    specTemplate(input),
    'utf8',
  );

  await wireIntoModule(input);

  // Auto-format/fix the generated files so they match the project's current
  // ESLint/Prettier config exactly, without hand-tuning template whitespace.
  const moduleFilePath = join(
    ROOT,
    'src',
    'features',
    input.dominio,
    `${input.dominio}.module.ts`,
  );
  const eslintBin = join(
    ROOT,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'eslint.cmd' : 'eslint',
  );
  if (existsSync(eslintBin)) {
    try {
      execFileSync(eslintBin, ['--fix', sliceDir, moduleFilePath], {
        cwd: ROOT,
        stdio: 'ignore',
      });
    } catch {
      // eslint --fix exits non-zero if any *unfixable* lint error remains
      // (rare for freshly generated code) — not fatal, just remind the user.
      console.log(
        '⚠️  ESLint encontró algo que no pudo autocorregir. Corre `pnpm lint` para ver el detalle.',
      );
    }
  } else {
    console.log(
      '⚠️  ESLint no está instalado aún. Corre `pnpm lint` luego de `pnpm install`.',
    );
  }

  console.log(
    `\n✅ Slice creado: src/features/${input.dominio}/${input.accion}/`,
  );
  console.log(
    `   Verbo detectado: ${input.verb} — revisa los TODO en el handler, el dto y el spec.`,
  );
}

run().catch((error: unknown) => {
  console.error(
    `❌ Falló la generación del slice: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
