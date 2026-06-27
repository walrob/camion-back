import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PasswordDto } from './dto/password.dto';
import { AuthGuard } from './guard/auth.guard';
import { LoginDto } from './dto/login.dto';
import { RolesGuard } from './guard/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CreateOperatorDto } from './dto/create-operator.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @HttpCode(HttpStatus.OK)
  @Post('login')
  login(@Body() loginDto: LoginDto) {
    return this.authService.validateUser(loginDto);
  }

  @ApiBearerAuth()
  @UseGuards(AuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @Post('create-user')
  createUser(@Body() createOperatorDto: CreateOperatorDto, @Request() req) {
    return this.authService.createUser(createOperatorDto, req.user);
  }

  @Post('change-password')
  changePassword(@Body() passwordDto: PasswordDto) {
    return this.authService.changePassword(passwordDto);
  }

  @UseGuards(AuthGuard)
  @Post('change-dark')
  changeDarkUser(@Request() req, @Body() body: { dark: boolean }) {
    return this.authService.changeDarkUser(req.user.id, body.dark);
  }

  @Post('forgot-password')
  forgotPassword(@Body('email') email: string) {
    return this.authService.forgotPassword(email);
  }

  @Post('reset-password')
  resetPassword(@Body() body: { token: string; newPassword: string }) {
    return this.authService.resetPassword(body.token, body.newPassword);
  }
}
