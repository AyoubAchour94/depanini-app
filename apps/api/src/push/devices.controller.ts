import { Body, Controller, Delete, HttpCode, Param, Put, Req, UseGuards } from '@nestjs/common';
import { type DeviceInput, deviceInputSchema } from '@depanini/shared';

import { AccountsService } from '../accounts/accounts.service.js';
import { type AuthenticatedRequest, FirebaseAuthGuard } from '../auth/firebase-auth.guard.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { DeviceTokens } from './device-tokens.service.js';

/** `/me/devices`: the push tokens of the signed-in account's installs. */
@Controller('me/devices')
@UseGuards(FirebaseAuthGuard)
export class DevicesController {
  constructor(
    private readonly accounts: AccountsService,
    private readonly tokens: DeviceTokens,
  ) {}

  /** Registers this install's token; calling it again, also as another account, moves it. */
  @Put()
  @HttpCode(204)
  async register(
    @Req() request: AuthenticatedRequest,
    @Body(new ZodValidationPipe(deviceInputSchema)) device: DeviceInput,
  ): Promise<void> {
    const account = await this.accounts.getOrCreate({
      firebaseUid: request.user.uid,
      email: request.user.email,
    });
    await this.tokens.register(account.id, device);
  }

  /** Unregisters the token on sign-out. Someone else's token, or none, is left alone. */
  @Delete(':token')
  @HttpCode(204)
  async unregister(
    @Req() request: AuthenticatedRequest,
    @Param('token') token: string,
  ): Promise<void> {
    const account = await this.accounts.getOrCreate({
      firebaseUid: request.user.uid,
      email: request.user.email,
    });
    await this.tokens.unregister(account.id, token);
  }
}
