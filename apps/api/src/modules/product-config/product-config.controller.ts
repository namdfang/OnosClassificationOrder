import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  StreamableFile,
  UploadedFile,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiFile, IFile } from 'core';
import type { FastifyRequest } from 'fastify';
import { createReadStream } from 'fs';
import {
  CreateProductConfigDto,
  CreateProductConfigResDto,
  GetProductConfigResDto,
  GetProductConfigsDto,
  GetProductConfigsResDto,
  ImportProductConfigDto,
  ImportProductConfigResDto,
  ResDto,
  RoleType,
  UpdateProductConfigDto,
  UpdateProductConfigResDto,
  UploadProductImageDto,
  UploadProductImageResDto,
} from 'shared';

import { Auth } from '@/decorators';

import { ProductConfigService } from './product-config.service';

@Controller('product-configs')
@ApiTags('product-configs')
export class ProductConfigController {
  constructor(private readonly productConfigService: ProductConfigService) {}

  @Get()
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'List product configs' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetProductConfigsResDto })
  async getProductConfigs(@Query() dto: GetProductConfigsDto): Promise<GetProductConfigsResDto> {
    return this.productConfigService.getProductConfigs(dto);
  }

  @Get(':id')
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'Get 1 product config by id' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: GetProductConfigResDto })
  async getProductConfig(@Param('id') id: string): Promise<GetProductConfigResDto> {
    return { success: true, data: await this.productConfigService.getProductConfig(id) };
  }

  @Get('uploaded-image/:folder/:filename')
  @Auth([], [], { public: true })
  @ApiOperation({ summary: 'Serve mockup/size-chart image uploaded to local disk (public, dùng cho <img src>)' })
  // Web app (vd :5173) và API (vd :3007) khác origin — helmet mặc định set
  // Cross-Origin-Resource-Policy: same-origin nên trình duyệt CHẶN hiển thị ảnh
  // qua <img> dù URL mở trực tiếp vẫn OK (CORP chỉ chặn embed cross-origin,
  // không chặn navigation). Override riêng route này thành cross-origin.
  @Header('Cross-Origin-Resource-Policy', 'cross-origin')
  serveProductImage(@Param('folder') folder: string, @Param('filename') filename: string): StreamableFile {
    const { filePath, mimetype } = this.productConfigService.resolveProductImagePath(folder, filename);
    return new StreamableFile(createReadStream(filePath), { type: mimetype });
  }

  @Post()
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'Create product config' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: CreateProductConfigResDto })
  async createProductConfig(@Body() dto: CreateProductConfigDto): Promise<CreateProductConfigResDto> {
    return { success: true, data: await this.productConfigService.createProductConfig(dto) };
  }

  @Patch(':id')
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'Update product config' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: UpdateProductConfigResDto })
  async updateProductConfig(
    @Param('id') id: string,
    @Body() dto: UpdateProductConfigDto,
  ): Promise<UpdateProductConfigResDto> {
    return { success: true, data: await this.productConfigService.updateProductConfig(id, dto) };
  }

  @Delete(':id')
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'Delete product config' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ResDto })
  async deleteProductConfig(@Param('id') id: string): Promise<ResDto> {
    await this.productConfigService.deleteProductConfig(id);
    return { success: true };
  }

  @Post('import')
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'Bulk import product configs from parsed Excel rows' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ImportProductConfigResDto })
  async importProductConfigs(@Body() dto: ImportProductConfigDto): Promise<ImportProductConfigResDto> {
    return this.productConfigService.importProductConfigs(dto);
  }

  @Post('upload-image')
  @Auth([RoleType.Admin, RoleType.Manager])
  @ApiOperation({ summary: 'Upload mockup/size-chart image (lưu local disk, KHÔNG qua S3/Backblaze)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: UploadProductImageResDto })
  @ApiFile({ name: 'file' })
  async uploadProductImage(
    @Body() dto: UploadProductImageDto,
    @UploadedFile() file: IFile,
    @Req() req: FastifyRequest,
  ): Promise<UploadProductImageResDto> {
    const origin = `${req.protocol}://${req.headers.host}`;
    const url = await this.productConfigService.uploadProductImage(dto.type, file, origin);
    return { success: true, data: { url } };
  }

  @Delete('all')
  @Auth([RoleType.SuperAdmin, RoleType.Admin])
  @ApiOperation({ summary: 'Hard-delete every product config (start fresh)' })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({ type: ResDto })
  async clearAll(): Promise<ResDto> {
    const data = await this.productConfigService.clearAll();
    return { success: true, data };
  }
}
