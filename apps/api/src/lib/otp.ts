export interface OtpProvider {
  send(phone: string, code: string): Promise<void>;
}

// Stand-in until an Ethiopian SMS provider is chosen (see docs/PLAN.md section 10).
export class ConsoleOtpProvider implements OtpProvider {
  async send(phone: string, code: string) {
    console.log(`[otp] code for ${phone}: ${code}`);
  }
}

export const otpProvider: OtpProvider = new ConsoleOtpProvider();
