import { ConsoleLogger } from '@nestjs/common';

/**
 * Message của các lần thử kết nối lại RabbitMQ. Hai chỗ độc lập cùng bắn ra
 * khi broker chưa lên: `AmqpConnection` của `@golevelup/nestjs-rabbitmq`
 * (retry mỗi 30s) và microservice `Transport.RMQ` của Nest (retry mỗi 5s) —
 * chỉ vài phút dev là log thật bị đẩy trôi khỏi terminal.
 */
const BROKER_DOWN_PATTERNS = [
  // @golevelup/nestjs-rabbitmq
  'Failed to connect to RabbitMQ broker',
  'Disconnected from RabbitMQ broker',
  'Failed to setup a RabbitMQ channel',
  // @nestjs/microservices — ServerRMQ
  'Connection to transport failed',
  'Disconnected from RMQ',
];

/** Kết nối được trở lại thì mở khoá, để lần rớt sau vẫn được báo 1 lần nữa. */
const BROKER_UP_PATTERNS = ['Successfully connected to RabbitMQ broker', 'Successfully connected a RabbitMQ channel'];

const BROKER_CONTEXT = 'RabbitMQ';

function hasPattern(message: string, patterns: string[]): boolean {
  return patterns.some((pattern) => message.includes(pattern));
}

/** `amqp://user:pass@localhost:5672` → `localhost:5672`, không kèm credential. */
function brokerHost(): string {
  const uri = process.env.RABBITMQ_URI;

  if (!uri) {
    return 'RABBITMQ_URI chưa được cấu hình';
  }

  try {
    return new URL(uri).host || uri;
  } catch {
    return 'RABBITMQ_URI sai định dạng';
  }
}

/**
 * Logger giữ nguyên MỌI log khác, chỉ gom nhóm log kết nối RabbitMQ: lần hỏng
 * đầu tiên in đúng 1 dòng cảnh báo kèm địa chỉ broker, các lần retry sau im
 * lặng. App vẫn tiếp tục thử kết nối ngầm nên bật broker lên là tự vào lại
 * (lúc đó dòng "Successfully connected" sẽ in ra như bình thường).
 */
export class QuietBrokerLogger extends ConsoleLogger {
  private brokerMuted = false;

  /**
   * ServerRMQ log 2 lần cho mỗi lần hỏng: 1 dòng message rồi 1 object lỗi
   * (`AggregateError`). Nuốt dòng đầu mà để lọt object thì terminal vẫn đầy
   * `ERROR [Server] AggregateError`, nên đánh dấu bỏ luôn dòng ngay sau đó.
   */
  private swallowNextPayload = false;

  override log(message: unknown, ...optionalParams: unknown[]): void {
    if (this.absorbBrokerNoise(message)) {
      return;
    }

    super.log(message, ...(optionalParams as [string?]));
  }

  override warn(message: unknown, ...optionalParams: unknown[]): void {
    if (this.absorbBrokerNoise(message)) {
      return;
    }

    super.warn(message, ...(optionalParams as [string?]));
  }

  override error(message: unknown, ...optionalParams: unknown[]): void {
    if (this.absorbBrokerNoise(message)) {
      return;
    }

    super.error(message, ...(optionalParams as [string?, string?]));
  }

  /** `true` = đã nuốt log này, caller không in nữa. */
  private absorbBrokerNoise(message: unknown): boolean {
    // Object lỗi đi kèm dòng message vừa bị nuốt (stack, AggregateError…).
    if (typeof message !== 'string') {
      const swallow = this.swallowNextPayload;
      this.swallowNextPayload = false;

      return swallow;
    }

    if (hasPattern(message, BROKER_UP_PATTERNS)) {
      this.brokerMuted = false;
      this.swallowNextPayload = false;

      return false;
    }

    if (!hasPattern(message, BROKER_DOWN_PATTERNS)) {
      this.swallowNextPayload = false;

      return false;
    }

    this.swallowNextPayload = true;

    if (this.brokerMuted) {
      return true;
    }

    this.brokerMuted = true;
    super.warn(
      `Không kết nối được RabbitMQ (${brokerHost()}). Các tính năng chạy qua queue sẽ không hoạt động; ` +
        'app vẫn tự thử lại ngầm và log retry đã được ẩn để khỏi trôi terminal.',
      BROKER_CONTEXT,
    );

    return true;
  }
}
