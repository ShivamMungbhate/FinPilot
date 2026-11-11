import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../db.js';

export const auditRoutes: FastifyPluginAsync = async (server: FastifyInstance) => {

  /**
   * GET /api/audit-logs
   * Retrieve audit logs with optional invoiceId filter, action filter, and pagination
   */
  server.get('/', async (request, reply) => {
    const { invoiceId, action, limit = '50', offset = '0' } = request.query as {
      invoiceId?: string;
      action?: string;
      limit?: string;
      offset?: string;
    };

    const take = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const skip = Math.max(0, parseInt(offset, 10) || 0);

    const where: any = {};
    if (invoiceId) where.invoiceId = invoiceId;
    if (action) where.action = action;

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: 'desc' },
        include: {
          invoice: {
            select: {
              invoiceNumber: true,
              recipientName: true,
              totalAmount: true,
              status: true
            }
          }
        }
      }),
      prisma.auditLog.count({ where })
    ]);

    return reply.send({
      logs: logs.map(l => ({
        ...l,
        details: l.details ? JSON.parse(l.details) : null
      })),
      total,
      limit: take,
      offset: skip
    });
  });

};
