jest.mock('@app/database', () => ({
  PrismaService: class PrismaService {},
}));

import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '@app/database';

import { UpdateUsuarioDto } from './actualizar-usuario.dto';
import { ActualizarUsuarioHandler } from './actualizar-usuario.handler';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    update: jest.fn(),
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

describe('ActualizarUsuarioHandler', () => {
  let handler: ActualizarUsuarioHandler;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ActualizarUsuarioHandler,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    handler = module.get(ActualizarUsuarioHandler);
    jest.clearAllMocks();
  });

  it('actualiza el usuario y devuelve ApiEnvelope con success: true', async () => {
    const updated = { ...mockUser, name: 'Nuevo Nombre' };
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockPrisma.user.update.mockResolvedValue(updated);

    const dto = { name: 'Nuevo Nombre' } as UpdateUsuarioDto;
    const result = await handler.actualizar('uuid-123', dto);

    expect(result.success).toBe(true);
    expect(result.data?.name).toBe('Nuevo Nombre');
    expect(result.message).toBe('Usuario actualizado exitosamente');
  });

  it('lanza NotFoundException cuando el usuario no existe', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    const dto = { name: 'Otro' } as UpdateUsuarioDto;
    await expect(handler.actualizar('uuid-no-existe', dto)).rejects.toThrow(
      NotFoundException,
    );
  });
});
