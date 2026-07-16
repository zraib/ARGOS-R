import { Module } from "@nestjs/common";
import { IamService } from "@/modules/iam/iam.service";
import { UsersService } from "@/modules/iam/users.service";
import { IamController } from "@/modules/iam/iam.controller";
import { UsersController } from "@/modules/iam/users.controller";
import { AuthController } from "@/modules/iam/auth.controller";

@Module({
  controllers: [AuthController, IamController, UsersController],
  providers: [IamService, UsersService],
  exports: [IamService, UsersService],
})
export class IamModule {}
