import { PrismaClient } from '@prisma/client';

export class Database {
  readonly client: PrismaClient;

  constructor(client = new PrismaClient()) {
    this.client = client;
  }

  async connect(): Promise<void> {
    await this.client.$connect();
  }

  async disconnect(): Promise<void> {
    await this.client.$disconnect();
  }

  async checkHealth(): Promise<void> {
    await this.client.$queryRaw`SELECT 1`;
  }
}
