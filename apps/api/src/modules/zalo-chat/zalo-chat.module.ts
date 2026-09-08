import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from '../auth/auth.module';
import { UserEntity, UserSchema } from '../user/user.entity';
import { ZaloChatController } from './zalo-chat.controller';
import { ZaloChatService } from './zalo-chat.service';
import { ZaloProxyService } from './zalo-proxy.service';

/**
 * Màn chat Zalo nhúng trong hệ thống (`/adm/zalo`).
 *
 * KHÁC hẳn module `zalo-group`: `zalo-group` đọc dữ liệu nhóm đã đồng bộ để làm
 * báo cáo/tóm tắt; module này chỉ là CẦU NỐI tới engine của nhà cung cấp —
 * không có entity, không ghi gì vào Mongo.
 */
@Module({
  imports: [AuthModule, MongooseModule.forFeature([{ name: UserEntity.name, schema: UserSchema }])],
  controllers: [ZaloChatController],
  providers: [ZaloChatService, ZaloProxyService],
  exports: [ZaloChatService],
})
export class ZaloChatModule {}
