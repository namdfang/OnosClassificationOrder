/* eslint-disable prettier/prettier */
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { convertEndDate, convertStartDate, generateHash, UserNotFoundException, validateHash } from 'core';
import type { FilterQuery } from 'mongoose';
import type {
  ChangePasswordDto,
  CreateUserDto,
  GetUsersDto,
  GetUsersResDto,
  PageQueryDto,
  RegisterDto,
  ResetPasswordDto,
  UpdateUserDto,
  UserLog,
} from 'shared';
import { ChangePasswordZod, CODE_LENGTH, RoleType, Status, UserLogType } from 'shared';

import { ApiConfigService } from '@/shared/services';
import { genCode, parseUrls, escapeRegExp } from '@/utils';

import { CustomRoleRepository } from '../custom-role/custom-role.repository';
import { DepartmentRepository } from '../departments/department.repository';
import { RedisCacheService } from '../redis-cache/redis-cache.service';
import { RoleRepository } from '../role/role.repository';
import type { UserDocument, UserEntity } from './user.entity';
import { UserRepository } from './user.repository';
import { UserLogRepository } from './user-log.repository';

@Injectable()
export class UserService {
  constructor(
    private userRepository: UserRepository,
    private roleRepository: RoleRepository,
    private customRoleRepository: CustomRoleRepository,
    private readonly configService: ApiConfigService,
    private readonly redisCacheService: RedisCacheService,
    private readonly departmentRepository: DepartmentRepository,
    private readonly userLogRepository: UserLogRepository,
  ) {}

  async getUserById(id: string): Promise<UserDocument> {
    // [cache disabled] Always fetch from DB. Re-enable by uncommenting below.
    // const cachedKey = `user:${id}`;
    // const cachedUser = await this.redisCacheService.getHashAll<UserDocument>(cachedKey);
    // if (cachedUser) return cachedUser;

    const users = await this.userRepository.raw<UserDocument | undefined>([
      {
        $match: {
          _id: id,
        },
      },
      {
        $lookup: {
          from: 'roles',
          localField: 'roleId',
          foreignField: '_id',
          as: 'role',
        },
      },
      {
        $unwind: {
          path: '$role',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: 'customRoles',
          localField: 'customRoleId',
          foreignField: '_id',
          as: 'customRole',
        },
      },
      {
        $unwind: {
          path: '$customRole',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          status: 1,
          email: 1,
          name: 1,
          userCode: 1,
          fullName: 1,
          departmentId: 1,
          forcePassChange: 1,
          // Designer team workflow — Telegram + hireDate hiển thị ở /designer/team.
          telegramChatId: 1,
          hireDate: 1,
          // Fulfillment per-factory scope.
          factoryId: 1,
          role: {
            name: 1,
            permissionCodes: 1,
            isSystem: 1,
          },
          customRole: {
            permissionIds: 1,
          },
          rateLimitBypass: 1,
        },
      },
    ]);

    const user = users[0];

    // [cache disabled]
    // if (user) {
    //   await this.updateUserCache(user);
    // }

    if (!user) {
      throw new UserNotFoundException();
    }

    return user;
  }

  async getMe(id: string, user: UserDocument): Promise<UserDocument> {
    // [cache disabled]
    // const cacheKey = `user:info:${id}`;
    // const cachedUser = await this.redisCacheService.getHashAll<UserDocument>(cacheKey);
    // if (cachedUser) return cachedUser;
    const cachedUser = null as UserDocument | null;

    if (cachedUser) {
      return cachedUser;
    }

    const users = await this.userRepository.raw<UserDocument | undefined>([
      {
        $match: {
          _id: id,
        },
      },
      {
        $lookup: {
          from: 'images',
          localField: 'avatarId',
          foreignField: '_id',
          as: 'avatar',
        },
      },
      {
        $unwind: {
          path: '$avatar',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $project: {
          _id: 1,
          email: 1,
          name: 1,
          userCode: 1,
          fullName: 1,
          phone: 1,
          gender: 1,
          birthday: 1,
          address: 1,
          status: 1,
          departmentId: 1,
          forcePassChange: 1,
          telegramChatId: 1,
          hireDate: 1,
          factoryId: 1,
          avatar: {
            url: 1,
            previewUrl: 1,
            thumbUrl: 1,
          },
        },
      },
    ]);

    const userInfo = users[0];

    if (!userInfo) {
      throw new UserNotFoundException();
    }

    if (userInfo.avatar) {
      parseUrls(userInfo.avatar);
    }

    userInfo.role = user.role;
    userInfo.customRole = user.customRole;

    // [cache disabled]
    // const fieldsToCache = Object.entries(userInfo).map(([key, value]) => ({ field: key, value }));
    // await this.redisCacheService.setHashFields(
    //   cacheKey,
    //   fieldsToCache,
    //   this.configService.authConfig.jwtExpirationTime,
    // );

    return userInfo;
  }

  async updateUserCache(user: UserDocument): Promise<void> {
    const cachedKey = `user:${user._id}`;

    const fieldsToCache = Object.entries(user).map(([key, value]) => ({ field: key, value }));
    await this.redisCacheService.setHashFields(
      cachedKey,
      fieldsToCache,
      this.configService.authConfig.jwtExpirationTime,
    );
  }

  findByUserCode(userCode: string): Promise<UserDocument | null> {
    return this.userRepository.findOne({ userCode });
  }

  async findOne(findData: FilterQuery<UserEntity>): Promise<UserDocument | null> {
    return await this.userRepository.findOne(findData, {
      populate: { path: 'role', select: ['name', 'permissionCodes', 'isSystem'] },
    });
  }

  async findByIdOrUsernameOrEmail(
    options: Partial<{ _id: string; username: string; email: string }>,
  ): Promise<UserDocument | null> {
    return await this.userRepository.findOne(options, {
      populate: [
        { path: 'role', select: ['name', 'permissionCodes', 'isSystem'] },
        { path: 'department', select: ['name'] },
        { path: 'customRole', select: ['permissionIds'] },
      ],
      select: ['+password'],
    });
  }

  async createUser(createUserDto: CreateUserDto, user: UserDocument): Promise<UserDocument> {
    const existingUser = await this.userRepository.findOne({
      email: createUserDto.email,
    });

    if (existingUser) {
      throw new BadRequestException('User already exists');
    }

    const password = createUserDto.password;
    const passwordHash = generateHash(password);

    const role = await this.roleRepository.findOneById(`${createUserDto.roleId}`, { select: ['name'] });

    if (!role) {
      throw new BadRequestException('Invalid role');
    }

    // Fulfillment user phải gán factoryId — scope visibility.
    if (role.name === RoleType.Fulfillment && !createUserDto.factoryId) {
      throw new BadRequestException(
        'User Fulfillment phải gán xưởng (factoryId) — chọn xưởng trong form.',
      );
    }

    const newUserData = {
      ...createUserDto,
      password: passwordHash,
      roleId: createUserDto.roleId,
      userCode: genCode(CODE_LENGTH),
    };

    const newUser = await this.userRepository.create(newUserData);

    await this.userLogRepository.create({
      actorId: user._id,
      userId: newUser._id,
      type: UserLogType.Create,
    });

    return newUser;
  }

  async register(registerDto: RegisterDto): Promise<UserDocument> {
    const existingUser = await this.userRepository.findOne({
      email: registerDto.email,
    });

    if (existingUser) {
      throw new BadRequestException('Email already registered');
    }

    const password: string = registerDto.password;
    const passwordHash = generateHash(password);
    const role = await this.roleRepository.findOne({ name: RoleType.SellerManager });

    const department = await this.departmentRepository.findOne({ name: 'PKD-1' });

    if (!department) {
      throw new BadRequestException('The system does not support external sellers yet.');
    }

    const newUser = await this.userRepository.create({
      ...registerDto,
      password: passwordHash,
      roleId: role!._id,
      userCode: genCode(CODE_LENGTH),
      departmentId: department._id,
      status: Status.Active,
    });

    return newUser;
  }

  async resetPassword(userId: string, resetPasswordDto: ResetPasswordDto, user: UserDocument): Promise<string> {
    try {
      const password = resetPasswordDto.password.toString();

      if (!password) {
        throw new BadRequestException('Password is required');
      }

      const passwordHash = generateHash(password);
      await this.userLogRepository.create({
        actorId: user._id,
        userId,
        type: UserLogType.ResetPassword,
      });

      await this.userRepository.findOneAndUpdate({ _id: userId }, { password: passwordHash });

      return 'success';
    } catch {
      throw new BadRequestException('Failed to reset password');
    }
  }

  async updateUser(updateUserDto: UpdateUserDto, user: UserDocument): Promise<UserEntity> {
    const { fullName, phone, email, gender, address, roleId, customRoleId, avatarId } = updateUserDto;
    const updateData: Record<string, string | undefined> = {
      fullName,
      phone,
      email,
      gender,
      address,
      customRoleId,
      roleId,
      avatarId,
    };

    if (roleId) {
      const role = await this.roleRepository.findOneById(roleId);

      if (!role) {
        throw new BadRequestException('Invalid role');
      }
    }

    if (customRoleId) {
      const customRole = await this.customRoleRepository.findOneById(customRoleId);

      if (!customRole) {
        throw new BadRequestException('Invalid customRole');
      }
    }

    const userLogs: UserLog[] = [];

    for (const [key, value] of Object.entries(user)) {
      if (key in updateData && updateData[key] && updateData[key] !== value) {
        userLogs.push({
          actorId: user._id,
          userId: user._id,
          field: key,
          before: value,
          after: updateData[key],
          type: UserLogType.Update,
        });
      }
    }

    await this.userLogRepository.createMany(userLogs);

    const updatedUser = await this.userRepository.findOneAndUpdate({ _id: user._id }, updateData);

    if (!updatedUser) {
      throw new UserNotFoundException();
    }

    return updatedUser;
  }

  async getUsers(user: UserDocument, getUsersDto: GetUsersDto): Promise<GetUsersResDto> {
    const { limit, page, startDate, endDate, search, sort, order } = getUsersDto;

    let query = {};

    if (search) {
      query = {
        $or: [
          { email: { $regex: escapeRegExp(search), $options: 'i' } },
          { _id: search },
          { fullName: { $regex: escapeRegExp(search), $options: 'i' } },
        ],
      };
    }

    if (startDate && endDate) {
      query = {
        createdAt: {
          $gte: convertStartDate(startDate),
          $lte: convertEndDate(endDate),
        },
        ...query,
      };
    }

    return await this.userRepository.findAllAndCount(
      { ...query },
      {
        paging: {
          limit,
          skip: limit * (page - 1),
        },
        populate: [
          { path: 'role', select: ['name', 'permissionCodes', 'isSystem'] },
          { path: 'customRole', select: ['permissionId'] },
          { path: 'department', select: ['name'] },
        ],
        sort: {
          [sort || 'createdAt']: order === 'asc' ? 1 : -1,
        },
      },
    );
  }

  async getLogs(pageQueryDto: PageQueryDto, userId: string): Promise<{ data: UserLog[]; total: number }> {
    const { page, limit, sort, order } = pageQueryDto;
    const filterQuery: FilterQuery<UserLog> = {
      $or: [{ userId }, { actorId: userId }],
    };

    return await this.userLogRepository.findAllAndCount(filterQuery, {
      sort: {
        [sort || 'createdAt']: order === 'asc' ? 1 : -1,
      },
      paging: {
        skip: limit * (page - 1),
        limit,
      },
      populate: [
        { path: 'user', select: 'email' },
        { path: 'actor', select: 'email' },
      ],
    });
  }

  async changePassword(changePasswordDto: ChangePasswordDto, user: UserDocument): Promise<string> {
    const { oldPassword, newPassword } = changePasswordDto;

    const validData = ChangePasswordZod.safeParse(changePasswordDto);

    if (!validData.success) {
      throw new Error(
        'Invalid: ' +
          validData.error.errors.map((error) => '`' + error.path.join('.') + '` ' + error.message).join('; '),
      );
    }

    const currentUser = await this.findByIdOrUsernameOrEmail({ _id: user._id });

    const isPasswordValid = await validateHash(oldPassword, currentUser!.password);

    if (!isPasswordValid) {
      throw new BadRequestException('Incorrect password');
    }

    const passwordHash = generateHash(newPassword);

    await this.userRepository.findOneAndUpdate({ _id: user._id }, { password: passwordHash, forcePassChange: false });

    await this.userLogRepository.create({
      actorId: user._id,
      userId: user._id,
      field: 'password',
      type: UserLogType.ChangePassword,
    });

    return 'success';
  }

  async deleteUserInfoCache(userId: string) {
    await this.redisCacheService.deleteKey(`user:info:${userId}`);
  }

  async clearUserCache(userId: string) {
    await this.redisCacheService.deleteKey(`user:info:${userId}`);
    await this.redisCacheService.deleteKey(`user:${userId}`);
  }

  /**
   * Phase 5 — admin actions on a target user (different from the actor).
   */
  async adminUpdateUser(targetId: string, dto: UpdateUserDto, actor: UserDocument): Promise<UserDocument> {
    const target = await this.userRepository.findOneById(targetId);
    if (!target) throw new NotFoundException('User not found');

    // Resolve final role để check Fulfillment factoryId required.
    let finalRoleName: string | undefined;
    if (dto.roleId) {
      const role = await this.roleRepository.findOneById(dto.roleId);
      if (!role) throw new BadRequestException('Invalid role');
      finalRoleName = role.name;
    } else {
      const cur = await this.roleRepository.findOneById(target.roleId);
      finalRoleName = cur?.name;
    }
    const finalFactoryId = dto.factoryId !== undefined ? dto.factoryId : target.factoryId;
    if (finalRoleName === RoleType.Fulfillment && !finalFactoryId) {
      throw new BadRequestException(
        'User Fulfillment phải gán xưởng (factoryId) — chọn xưởng trong form.',
      );
    }

    const updated = await this.userRepository.findOneAndUpdate({ _id: targetId }, dto);
    if (!updated) throw new NotFoundException('User not found');

    await this.userLogRepository.create({
      actorId: actor._id,
      userId: targetId,
      type: UserLogType.Update,
    });

    await this.clearUserCache(targetId);
    return updated;
  }

  async adminDeleteUser(targetId: string, actor: UserDocument): Promise<boolean> {
    const target = await this.userRepository.findOneById(targetId);
    if (!target) throw new NotFoundException('User not found');
    if (String(target._id) === String(actor._id)) {
      throw new ForbiddenException('Cannot delete your own account');
    }
    const result = await this.userRepository.softDelete({ _id: targetId });
    await this.userLogRepository.create({
      actorId: actor._id,
      userId: targetId,
      type: UserLogType.Update,
    });
    await this.clearUserCache(targetId);
    return result;
  }

  async adminToggleActive(targetId: string, actor: UserDocument): Promise<UserDocument> {
    const target = await this.userRepository.findOneById(targetId);
    if (!target) throw new NotFoundException('User not found');
    if (String(target._id) === String(actor._id)) {
      throw new ForbiddenException('Cannot toggle your own status');
    }
    const next = target.status === Status.Active ? Status.Inactive : Status.Active;
    const updated = await this.userRepository.findOneAndUpdate({ _id: targetId }, { status: next });
    if (!updated) throw new NotFoundException('User not found');
    await this.userLogRepository.create({
      actorId: actor._id,
      userId: targetId,
      field: 'status',
      before: String(target.status),
      after: String(next),
      type: UserLogType.Update,
    });
    await this.clearUserCache(targetId);
    return updated;
  }
}
