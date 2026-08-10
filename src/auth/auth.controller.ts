import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Request,
} from '@nestjs/common';
import { ActiveUser } from '../common/decorators/active-user.decorator';
import { ActiveUserInterface } from '../common/interfaces/active-user.interface';
import { AuthService } from './auth.service';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { PasswordDto } from './dto/password.dto';
import { LoginDto } from './dto/login.dto';
import { Auth } from './decorators/auth.decorator';
import { AllowDemo } from './decorators/allow-demo.decorator';
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

  /**
   * Situación comercial vigente de la empresa del usuario.
   *
   * El front la consulta al arrancar y cada tanto. Es un endpoint aparte del
   * login a propósito: el plan **no** viaja en el JWT (dura un día), así que un
   * cambio de plan tiene que poder reflejarse sin volver a loguearse.
   */
  @ApiBearerAuth()
  @Auth()
  @AllowDemo()
  @Get('session')
  session(@ActiveUser() user: ActiveUserInterface) {
    return this.authService.getSession(user);
  }

  @ApiBearerAuth()
  @Auth(Role.ADMIN)
  @Post('create-user')
  createUser(@Body() createOperatorDto: CreateOperatorDto, @Request() req) {
    return this.authService.createUser(createOperatorDto, req.user);
  }

  @Post('change-password')
  changePassword(@Body() passwordDto: PasswordDto) {
    return this.authService.changePassword(passwordDto);
  }

  // Preferencia visual personal: no altera datos de negocio, el demo puede usarla.
  @Auth()
  @AllowDemo()
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
