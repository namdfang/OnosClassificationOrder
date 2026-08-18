import amqp from 'amqplib';
import type { DesignIngestJob } from 'shared';
import { DESIGN_PROCESSING_QUEUE } from 'shared';

import { config } from './config';
import { connectDb } from './db';
import { markJobFailed, processJob } from './processor';
import { notifyTelegram } from './telegram';

/**
 * design-worker — consumer RabbitMQ chạy trên server riêng (DigitalOcean).
 *
 * Topology (exchange direct sẵn có của hệ thống):
 *   queue  `${mainExchange}.design.process`      ← API publish job
 *   queue  `${mainExchange}.design.process.dlq`  ← job fail sau MAX_RETRIES
 *
 * Retry: lỗi → republish cùng queue với retry+1 (delay 5s in-process) → hết
 * lượt → đánh design_files `failed` + đẩy DLQ + notify Telegram.
 */
async function main(): Promise<void> {
  await connectDb();

  const conn = await amqp.connect(config.rabbitmq.uri);
  const channel = await conn.createChannel();
  const ex = config.rabbitmq.mainExchange;
  const queue = `${ex}.${DESIGN_PROCESSING_QUEUE}`;
  const dlq = `${queue}.dlq`;

  await channel.assertExchange(ex, 'direct', { durable: true });
  await channel.assertQueue(queue, { durable: true });
  await channel.bindQueue(queue, ex, queue);
  await channel.assertQueue(dlq, { durable: true });
  await channel.bindQueue(dlq, ex, dlq);
  await channel.prefetch(config.prefetch);

  console.log(`[worker] consuming ${queue} (prefetch=${config.prefetch})`);

  await channel.consume(queue, (msg) => {
    if (!msg) return;
    void (async () => {
      let job: DesignIngestJob;
      try {
        job = JSON.parse(msg.content.toString()) as DesignIngestJob;
      } catch {
        console.error('[worker] payload không parse được — bỏ qua');
        channel.ack(msg);
        return;
      }

      const retry = job.retry ?? 0;
      try {
        await processJob(job);
      } catch (err) {
        const message = (err as Error).message;
        console.error(`[worker] FAIL ${job.kind} (retry=${retry}): ${message}`);
        if (retry < config.maxRetries) {
          setTimeout(() => {
            channel.publish(ex, queue, Buffer.from(JSON.stringify({ ...job, retry: retry + 1 })), {
              persistent: true,
            });
          }, 5000);
        } else {
          await markJobFailed(job, message);
          channel.publish(
            ex,
            dlq,
            Buffer.from(JSON.stringify({ ...job, error: message, failedAt: new Date().toISOString() })),
            { persistent: true },
          );
          const label = job.kind === 'url' ? `${job.productionId}/${job.designKey}` : job.sha256.slice(0, 12);
          void notifyTelegram(`Job ${job.kind} FAILED sau ${retry} retry — ${label}\n${message}`);
        }
      } finally {
        channel.ack(msg);
      }
    })();
  });

  const shutdown = async () => {
    console.log('[worker] shutting down…');
    try {
      await channel.close();
      await conn.close();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  conn.on('error', (err) => console.error('[worker] amqp error:', err.message));
  conn.on('close', () => {
    console.error('[worker] amqp connection closed — exit để Docker restart');
    process.exit(1);
  });
}

main().catch((err) => {
  console.error('[worker] fatal:', err);
  process.exit(1);
});
