# Backend Rules (apps/api)

> Xem quy tắc chung (TypeScript, Git, Code Quality) và bảng Feature → Doc mapping ở [`CLAUDE.md`](../../CLAUDE.md) gốc repo.

### Module Structure

**Mỗi feature module BẮT BUỘC có đủ các file:**

```
modules/[feature]/
├── [feature].module.ts       → NestJS module
├── [feature].controller.ts   → HTTP endpoints
├── [feature].service.ts      → Business logic
├── [feature].repository.ts   → Data access
├── [feature].entity.ts       → Mongoose schema
└── [feature]-log.entity.ts   → (Optional) Audit log
```

- Folder/file naming: **kebab-case** (e.g., `dropship-order/`, `product-variant.service.ts`).
- Một controller per module.
- Entity name: **PascalCase** + suffix `Entity` (e.g., `UserEntity`, `OrderEntity`).

### Controller Rules

```typescript
@Get()
@Auth([RoleType.Admin])
@ApiOperation({ summary: 'Get all users' })
@HttpCode(HttpStatus.OK)
@ApiOkResponse({ type: GetUsersResDto })
async getUsers(
  @Query() getUsersDto: GetUsersDto,
  @AuthUser() user: UserDocument,
): Promise<GetUsersResDto> {
  this.logger.info({ message: JSON.stringify({ method: 'GET', url: '/users', userId: user._id }) });
  return { success: true, ...(await this.userService.getUsers(getUsersDto)) };
}
```

- **Logging BẮT BUỘC** ở mọi endpoint — dùng Winston `this.logger.info()`.
- Response format: `{ success: boolean, data, total?, message? }`.
- Dùng decorators: `@AuthUser()`, `@ClientIp()`, `@UserAgent()`, `@AccessToken()`.

### Auth & Guards

```typescript
@Auth(
  [RoleType.Admin, RoleType.Manager],   // roles
  [PermissionType.ViewProduct],          // permissions
  { public: false }                      // options
)
```

- `@Auth()` tự apply: AuthGuard → RateLimiterGuard → PermissionsGuard → RolesGuard.
- Public routes: `@Auth([], [], { public: true })`.
- Role/Permission types: import từ `shared` package.

### Entity/Schema Definition

```typescript
@DatabaseEntity({ collection: 'users' })
export class UserEntity extends DatabaseEntityAbstract {
  @Prop({ required: true, trim: true })
  fullName: string;

  @Prop({ ref: 'RoleEntity' })
  roleId: string;
}

export const UserSchema = SchemaFactory.createForClass(UserEntity);
UserSchema.virtual('role', { ref: 'RoleEntity', localField: 'roleId', foreignField: '_id', justOne: true });

export type UserDocument = HydratedDocument<UserEntity> & { role?: RoleDocument };
```

- References: string IDs với `@Prop({ ref: 'EntityName' })`, populate khi cần.
- Virtuals cho relationships.
- Document type: `HydratedDocument<Entity> & { virtual fields }`.

### DTO & Validation (Zod)

```typescript
// 1. Define Zod schema (trong shared package)
export const CreateUserZod = z.object({
  email: EmailZod,
  fullName: NameZod,
  password: PasswordZod,
});
export type CreateUser = z.infer<typeof CreateUserZod>;

// 2. Create DTO class (trong shared package)
export class CreateUserDto extends createZodDto(extendApi(CreateUserZod)) {}

// 3. Response DTO
export class CreateUserResDto extends createZodDto(extendApi(ResZod.extend({ data: UserZod }))) {}
```

- **Mọi endpoint** phải có Request DTO + Response DTO.
- KHÔNG dùng `any` type.
- Reuse Zod validators từ `shared/constants` (IDZod, NameZod, EmailZod, PriceZod...).

### Repository Pattern

```typescript
export class UserRepository extends DatabaseRepositoryAbstract<UserEntity, UserDocument> {
  constructor(@InjectModel(UserEntity.name) private readonly userModel: Model<UserEntity>) {
    super(userModel);
  }
}
```

- Mọi data access qua Repository — KHÔNG gọi Model trực tiếp trong Service.

### Error Handling

- Throw custom exceptions: `BadRequestException`, `NotFoundException`, etc.
- Global filters tự handle response format.
- KHÔNG try-catch trong controller — để NestJS exception filters xử lý.

### Caching

- Redis cache cho read operations.
- Cache key format: `entity:${id}`.
- **Luôn invalidate cache** khi update/delete entity.
