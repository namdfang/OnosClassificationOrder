import { Logger } from '@nestjs/common';

import { QuietBrokerLogger } from './quiet-broker-logger';

describe('QuietBrokerLogger', () => {
  const lines: string[] = [];
  let stdout: jest.SpyInstance;
  let stderr: jest.SpyInstance;

  beforeEach(() => {
    lines.length = 0;
    process.env.RABBITMQ_URI = 'amqp://user:pass@localhost:5672';
    Logger.overrideLogger(new QuietBrokerLogger());
    const capture = (chunk: unknown) => {
      lines.push(String(chunk));

      return true;
    };
    stdout = jest.spyOn(process.stdout, 'write').mockImplementation(capture as never);
    stderr = jest.spyOn(process.stderr, 'write').mockImplementation(capture as never);
  });

  afterEach(() => {
    stdout.mockRestore();
    stderr.mockRestore();
  });

  const failOnce = () => {
    const amqp = new Logger('AmqpConnection');
    const server = new Logger('Server');
    amqp.error('Failed to connect to RabbitMQ broker (default)', 'AggregateError [ECONNREFUSED]:\n  at internal');
    server.error('Connection to transport failed. Trying to reconnect...');
    server.error(new AggregateError([new Error('ECONNREFUSED')]));
  };

  it('chỉ in 1 dòng cho nhiều vòng retry', () => {
    for (let i = 0; i < 5; i++) failOnce();

    const notices = lines.filter((l) => l.includes('Không kết nối được RabbitMQ'));
    expect(notices).toHaveLength(1);
    expect(notices[0]).toContain('localhost:5672');
    expect(notices[0]).not.toContain('pass');
    expect(lines.filter((l) => l.includes('AggregateError'))).toHaveLength(0);
    expect(lines.filter((l) => l.includes('Connection to transport failed'))).toHaveLength(0);
  });

  it('kết nối lại được thì mở khoá, lần rớt sau báo tiếp 1 lần', () => {
    failOnce();
    new Logger('AmqpConnection').log('Successfully connected to RabbitMQ broker (default)');
    failOnce();
    failOnce();

    expect(lines.filter((l) => l.includes('Không kết nối được RabbitMQ'))).toHaveLength(2);
    expect(lines.filter((l) => l.includes('Successfully connected to RabbitMQ broker'))).toHaveLength(1);
  });

  it('không đụng vào log thường', () => {
    new Logger('OrderService').error('Cannot read property of undefined');
    new Logger('OrderService').error(new Error('boom'));
    new Logger('OrderService').log('server running on http://localhost:3007');

    expect(lines.filter((l) => l.includes('Cannot read property'))).toHaveLength(1);
    expect(lines.filter((l) => l.includes('boom')).length).toBeGreaterThanOrEqual(1);
    expect(lines.filter((l) => l.includes('server running on'))).toHaveLength(1);
  });
});
