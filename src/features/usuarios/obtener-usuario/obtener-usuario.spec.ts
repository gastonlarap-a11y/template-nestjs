jest.mock('@app/database', () => ({
  PrismaService: class PrismaService {},
}));

import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '@app/database';

import { ObtenerUsuarioHandler } from './obtener-usuario.handler';

const mockPrisma = {
  user: {
    findUnique: jest.fn(),
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

describe('ObtenerUsuarioHandler', () => {
  let handler: ObtenerUsuarioHandler;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ObtenerUsuarioHandler,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    handler = module.get(ObtenerUsuarioHandler);
    jest.clearAllMocks();
  });

  it('devuelve ApiEnvelope con el usuario cuando existe', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(mockUser);

    const result = await handler.obtener('uuid-123');

    expect(result.success).toBe(true);
    expect(result.data?.id).toBe('uuid-123');
    expect(result.data?.roles).toEqual(['Admin']);
  });

  it('lanza NotFoundException cuando el usuario no existe', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(handler.obtener('uuid-no-existe')).rejects.toThrow(
      NotFoundException,
    );
  });
});
