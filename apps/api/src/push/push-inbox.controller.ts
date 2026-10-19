import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Query,
} from '@nestjs/common';

import { z } from 'zod';

import type { Env } from '../config/env.js';
import { ENV } from '../config/env.module.js';
import { DeviceTokens } from './device-tokens.service.js';
import { LogPushSender } from './log-push-sender.js';
import { PUSH_SENDER, type PushSender } from './push-sender.js';

/**
 * The log sender's recent pushes, for the e2e tests. No sign-in: it exists only where
 * `NODE_ENV` is not `production`, `PUSH_INBOX=1` and the `log` sender is in use; anywhere
 * else every request gets the same 404 as an unknown route.
 */
@Controller('dev/push-inbox')
export class PushInboxController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    @Inject(PUSH_SENDER) private readonly sender: PushSender,
    private readonly tokens: DeviceTokens,
  ) {}

  /** The pushes sent to the user's devices, oldest first, each with the app that got it. */
  @Get()
  async inbox(@Query('userId') userId?: string) {
    const sender = this.enabled();
    if (!z.uuid().safeParse(userId).success) return [];
    const devices = await this.tokens.variantsOf(userId!);
    return sender.forTokens(devices.map((device) => device.token)).map((push) => ({
      ...push,
      appVariant: devices.find((device) => device.token === push.token)!.appVariant,
    }));
  }

  @Delete()
  @HttpCode(204)
  clear(): void {
    this.enabled().clear();
  }

  private enabled(): LogPushSender {
    if (
      this.env.NODE_ENV === 'production' ||
      !this.env.PUSH_INBOX ||
      !(this.sender instanceof LogPushSender)
    ) {
      throw new NotFoundException({
        message: 'Cannot GET /dev/push-inbox',
        error: 'Not Found',
        statusCode: 404,
      });
    }
    return this.sender;
  }
}
