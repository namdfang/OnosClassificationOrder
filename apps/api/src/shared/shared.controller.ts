import { Controller, HttpCode, HttpStatus, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AwsS3Service } from 'core';
import { ResDto } from 'shared';

import { Auth } from '@/decorators';

@Controller('upload')
@ApiTags('upload')
export class SharedController {
  constructor(private readonly awsS3Services: AwsS3Service) {}

  @Post('generate-put-url')
  @Auth([], [], { public: true })
  @ApiOperation({
    summary: 'Generate S3 Put URL',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: ResDto,
  })
  async generatePutObjectUrl(
    @Query('key')
    key: string,
    @Query('ContentType')
    ContentType: string,
  ): Promise<ResDto> {
    const putUrl = await this.awsS3Services.generatePutObjectUrl(key, ContentType);

    const fileUrl = putUrl.split('?')[0];

    return { success: true, data: { putUrl, fileUrl } };
  }
}
