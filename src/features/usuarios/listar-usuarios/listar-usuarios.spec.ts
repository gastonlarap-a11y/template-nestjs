jest.mock('@app/database', () => ({
  PrismaService: class PrismaService {},
}));

import { Test } from '@nestjs/testing';

import { PrismaService } from '@app/database';

import { ListarUsuariosQueryDto } from './listar-usuarios.dto';
import { ListarUsuariosHandler } from './listar-usuarios.handler';

const mockPrisma = {
  user: {
    findMany: jest.fn(),
    count: jest.fn(),
  },
};

const mockUsers = [
  {
    id: 'uuid-1',
    email: 'a@example.com',
    name: 'Usuario A',
    roles: '["Admin"]',
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 'uuid-2',
    email: 'b@example.com',
    name: 'Usuario B',
    roles: '[]',
    isActive: false,
    createdAt: new Date('2026-01-02T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
  },
];

describe('ListarUsuariosHandler', () => {
  let handler: ListarUsuariosHandler;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ListarUsuariosHandler,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    handler = module.get(ListarUsuariosHandler);
    jest.clearAllMocks();
  });

  it('devuelve lista de usuarios con metadata de paginación', async () => {
    mockPrisma.user.findMany.mockResolvedValue(mockUsers);
    mockPrisma.user.count.mockResolvedValue(2);

    const query = {
      page: 1,
      limit: 20,
      sortOrder: 'asc',
    } as ListarUsuariosQueryDto;
    const result = await handler.listar(query);

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.meta.total).toBe(2);
    expect(result.meta.timestamp).toBeDefined();
  });

  it('deserializa correctamente el campo roles de cada usuario', async () => {
    mockPrisma.user.findMany.mockResolvedValue(mockUsers);
    mockPrisma.user.count.mockResolvedValue(2);

    const query = {
      page: 1,
      limit: 20,
      sortOrder: 'asc',
    } as ListarUsuariosQueryDto;
    const result = await handler.listar(query);

    expect(result.data?.[0]?.roles).toEqual(['Admin']);
    expect(result.data?.[1]?.roles).toEqual([]);
  });
});
