jest.mock('@app/database', () => ({
  PrismaService: class PrismaService {},
}));

import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '@app/database';

import { EliminarUsuarioHandler } from './eliminar-usuario.handler';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
};

const mockUser = {
  id: 'uuid-123',
  email: 'test@example.com',
  name: 'Test User',
  roles: '[]',
  isActive: true,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

describe('EliminarUsuarioHandler', () => {
  let handler: EliminarUsuarioHandler;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EliminarUsuarioHandler,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    handler = module.get(EliminarUsuarioHandler);
    jest.clearAllMocks();
  });

  it('elimina el usuario y devuelve ApiEnvelope con data: null', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);
    mockPrisma.user.delete.mockResolvedValue(mockUser);

    const result = await handler.eliminar('uuid-123');

    expect(result.success).toBe(true);
    expect(result.data).toBeNull();
    expect(result.message).toBe('Usuario eliminado exitosamente');
    expect(mockPrisma.user.delete).toHaveBeenCalledWith({
      where: { id: 'uuid-123' },
    });
  });

  it('lanza NotFoundException cuando el usuario no existe', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(handler.eliminar('uuid-no-existe')).rejects.toThrow(
      NotFoundException,
    );
    expect(mockPrisma.user.delete).not.toHaveBeenCalled();
  });
});
