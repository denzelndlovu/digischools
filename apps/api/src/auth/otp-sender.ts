import { Injectable, Logger } from '@nestjs/common';

export type OtpChannel = 'email' | 'sms';

/** Adapter: delivers one-time codes. Real email/SMS adapters replace this. */
export abstract class OtpSender {
  abstract send(
    channel: OtpChannel,
    destination: string,
    code: string,
    schoolName: string,
  ): Promise<void>;
}
export const OTP_SENDER = Symbol('OTP_SENDER');

/** Development sender: writes the code to the log. Never use in production. */
@Injectable()
export class ConsoleOtpSender extends OtpSender {
  private readonly log = new Logger('OtpSender');
  async send(channel: OtpChannel, destination: string, code: string, schoolName: string) {
    this.log.warn(`[dev only] ${schoolName}: one-time code ${code} for ${channel}:${destination}`);
  }
}
