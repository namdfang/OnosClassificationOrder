import { Body, Controller, Post, Query, UploadedFile } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ApiFile, AuthUser, IFile } from 'core';
import { RoleType, UploadImageDto, UploadImageResDto } from 'shared';

import { Auth } from '@/decorators';

import { UserDocument } from '../user/user.entity';
import { UploadService } from './upload.service';

@Controller('upload')
@ApiTags('upload')
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('image')
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'Upload image' })
  @ApiOkResponse({ type: UploadImageResDto })
  @ApiQuery({
    name: 'folderId',
    required: false,
    description: 'ID of the folder',
  })
  @ApiFile({ name: 'file' })
  async uploadImage(
    @Body() uploadImageDto: UploadImageDto,
    @AuthUser() user: UserDocument,
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    @Query('folderId') folderId: string | '',
    @UploadedFile()
    file: IFile,
  ): Promise<UploadImageResDto> {
    const { type } = uploadImageDto;

    const data = await this.uploadService.uploadImage(type, file, user, folderId);

    return {
      success: true,
      data,
    };
  }
}
