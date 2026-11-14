import nodemailer from 'nodemailer';
import { config } from './env';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: config.smtp.email,
    pass: config.smtp.password,
  },
});

export const sendOtpEmail = async (toEmail: string, otpCode: string): Promise<boolean> => {
  try {
    const mailOptions = {
      from: `"Instapost Sign Tracker" <${config.smtp.email}>`,
      to: toEmail,
      subject: 'Instapost Verification Code',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #0988dd;">Instapost Verification Code</h2>
          <p>You requested a verification code for your account.</p>
          <div style="margin: 20px 0; padding: 15px; background: #f0f7ff; border-left: 4px solid #0988dd; font-size: 24px; font-weight: bold; letter-spacing: 4px; color: #0988dd;">
            ${otpCode}
          </div>
          <p>This code will expire in 30 minutes. If you did not make this request, please ignore this email.</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error('[Mailer] Failed to send email:', error);
    return false;
  }
};

