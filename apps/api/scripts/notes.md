## Hạng mục cần check

### Đảm bảo không có deletedAt

- Global search: deletedAt

### Đảm bảo không sử dụng .save() của mongoose

- Global search: .save(

### Đảm bảo Swagger/OpenAPI đã hiển thị đúng trên /documentation

- Check @ApiOperation, @Auth, @ApiOkResponse, @ApiPageOkResponse
- Check Payload, Query, Params, Response trên /documentation đã chuẩn hay chưa, ngoài ra phải test trực tiếp vì hiện thị chỉ là trên Swagger còn có thể logic validate có vấn đề
