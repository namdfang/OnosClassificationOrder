import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from 'core';
import {
  CreateDepartmentDto,
  CreateDepartmentResDto,
  GetDepartmentResDto,
  GetDepartmentsDto,
  GetDepartmentsResDto,
  RoleType,
  UpdateDepartmentDto,
  UpdateDepartmentResDto,
} from 'shared';
import { Logger } from 'winston';

import { Auth } from '@/decorators';

import { UserDocument } from '../user/user.entity';
import { DepartmentRepository } from './department.repository';
import { DepartmentService } from './department.service';

@Controller('departments')
@ApiTags('departments')
export class DepartmentController {
  constructor(
    private readonly departmentService: DepartmentService,
    private readonly departmentRepository: DepartmentRepository,
    @Inject('winston') private readonly logger: Logger,
  ) {}

  @Get()
  @Auth([RoleType.Admin, RoleType.Manager, RoleType.Support, RoleType.Accountant, RoleType.Logistics])
  @ApiOperation({
    summary: 'Get departments',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: GetDepartmentsResDto,
  })
  async getDepartments(
    @Query()
    getDepartmentsDto: GetDepartmentsDto,
    @AuthUser() user: UserDocument,
  ): Promise<GetDepartmentsResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'getDepartments',
        method: 'GET',
        url: '/departments',
        message: 'Get departments',
        userId: user._id,
        query: getDepartmentsDto,
      }),
    });

    return { success: true, ...(await this.departmentService.getDepartments(getDepartmentsDto, user)) };
  }

  @Post()
  @Auth([RoleType.Admin])
  @ApiOperation({
    summary: 'Create department',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: CreateDepartmentResDto,
  })
  async createDepartment(
    @Body() createDepartmentDto: CreateDepartmentDto,
    @AuthUser() user: UserDocument,
  ): Promise<CreateDepartmentResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'createDepartment',
        method: 'POST',
        url: '/departments',
        message: 'Create department',
        userId: user._id,
        body: createDepartmentDto,
      }),
    });

    return { success: true, data: await this.departmentService.createDepartment(createDepartmentDto) };
  }

  @Patch(':departmentId')
  @Auth([RoleType.Admin])
  @ApiOperation({
    summary: 'Update department',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: UpdateDepartmentResDto,
    description: 'Update department',
  })
  async updateDepartment(
    @Param('departmentId') departmentId: string,
    @Body() updateDepartmentDto: UpdateDepartmentDto,
    @AuthUser() user: UserDocument,
  ): Promise<UpdateDepartmentResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'updateDepartment',
        method: 'PATCH',
        url: `/departments/${departmentId}`,
        message: 'Update department',
        userId: user.id,
        body: updateDepartmentDto,
        params: {
          departmentId,
        },
      }),
    });

    return { success: true, data: await this.departmentService.updateDepartment(departmentId, updateDepartmentDto) };
  }

  @Get(':departmentId')
  @Auth([RoleType.Admin])
  @ApiOperation({
    summary: 'Get department',
  })
  @HttpCode(HttpStatus.OK)
  @ApiOkResponse({
    type: GetDepartmentResDto,
  })
  async getDepartment(
    @Param('departmentId') departmentId: string,
    @AuthUser() user: UserDocument,
  ): Promise<GetDepartmentResDto> {
    this.logger.info({
      message: JSON.stringify({
        action: 'getDepartment',
        method: 'GET',
        url: `/departments/${departmentId}`,
        message: 'Get department',
        userId: user._id,
        params: {
          departmentId,
        },
      }),
    });

    return { success: true, data: await this.departmentService.getDepartment(departmentId) };
  }

  // @Delete(':departmentId')
  // @Auth([RoleType.Admin])
  // @ApiOperation({
  //   summary: 'Delete department',
  // })
  // @HttpCode(HttpStatus.OK)
  // @ApiOkResponse({
  //   type: ResDto,
  // })
  // async deleteDepartment(@Param('departmentId') departmentId: string, @AuthUser() user: UserDocument): Promise<ResDto> {
  //   this.logger.info({
  //     message: JSON.stringify({
  //       action: 'deleteDepartment',
  //       method: 'Delete',
  //       url: `/departments/${departmentId}`,
  //       message: 'Delete department',
  //       userId: user._id,
  //       params: {
  //         departmentId,
  //       },
  //     }),
  //   });

  //   await this.departmentRepository.softDelete({ _id: departmentId });

  //   return { success: true };
  // }
}
