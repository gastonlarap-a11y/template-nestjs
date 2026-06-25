// Prevents the import of AppConfigModule (via PrismaModule) from triggering
// NestConfigModule.forRoot() env validation at import time.
jest.mock('@app/database', () => ({
  PrismaService: class PrismaService {},
}));

import { ConflictException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '@app/database';

import { CreateUsuarioDto } from './crear-usuario.dto';
import { CrearUsuarioHandler } from './crear-usuario.handler';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
};

const mockUser = {
  id: 'uuid-123',
  email: 'test@example.com',
  name: 'Test User',
  roles: '["Admin"]',
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('CrearUsuarioHandler', () => {
  let handler: CrearUsuarioHandler;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        CrearUsuarioHandler,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    handler = module.get(CrearUsuarioHandler);
    jest.clearAllMocks();
  });

  it('crea un usuario y devuelve ApiEnvelope con success: true', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue(mockUser);

    const dto = {
      email: 'test@example.com',
      name: 'Test User',
      roles: ['Admin'],
    };
    const result = await handler.crear(dto);

    expect(result.success).toBe(true);
    expect(result.data?.email).toBe('test@example.com');
    expect(result.data?.roles).toEqual(['Admin']);
    expect(result.message).toBe('Usuario creado exitosamente');
    expect(result.meta.timestamp).toBeDefined();
  });

  it('lanza ConflictException si el email ya existe', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);

    const dto = {
      email: 'test@example.com',
      name: 'Test User',
      roles: [],
    } as CreateUsuarioDto;

    await expect(handler.crear(dto)).rejects.toThrow(ConflictException);
  });

  it('deserializa correctamente el campo roles del JSON de BD', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);
    mockPrisma.user.create.mockResolvedValue({
      ...mockUser,
      roles: '["Admin","UserManager"]',
    });

    const dto = {
      email: 'test@example.com',
      name: 'Test User',
      roles: ['Admin', 'UserManager'],
    };
    const result = await handler.crear(dto);

    expect(result.data?.roles).toEqual(['Admin', 'UserManager']);
  });
});
