/* 

import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter: nodemailer.Transporter;

  constructor() {
    this.logger.debug(`MAIL_USER=${process.env.MAIL_USER}`);

    this.transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST || 'smtp.gmail.com',
      port: Number(process.env.MAIL_PORT) || 465,
      secure: Number(process.env.MAIL_PORT) === 465, // true for 465, false for 587
      auth: {
        user: process.env.MAIL_USER,
        pass: process.env.MAIL_PASS, // must be App Password if Gmail
      },
    });
  }

  // -------------------------
  // Centralized Mail Sender
  // -------------------------
  private async sendMail(
    to: string,
    subject: string,
    html: string,
  ): Promise<void> {
    const mailOptions = {
      from: `"No Reply" <${process.env.MAIL_USER}>`,
      to,
      subject,
      html,
    };

    try {
      await this.transporter.sendMail(mailOptions);
      this.logger.log(
        `✅ Email sent successfully to ${to} | Subject: ${subject}`,
      );
    } catch (error) {
      this.logger.error(`❌ Failed to send email to ${to}`, error.stack);

      // Friendly error for frontend
      throw new InternalServerErrorException(
        'We could not send the email at the moment. Please try again later.',
      );
    }
  }

  // -------------------------
  // Verification Email
  // -------------------------
  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const verificationLink = `${process.env.VERIFICATION_URL}?token=${token}`;

    const html = `
      <h1>Email Verification</h1>
      <p>Click the link below to verify your email:</p>
      <a href="${verificationLink}">${verificationLink}</a>
    `;

    await this.sendMail(to, 'Verify your email', html);
  }

  // -------------------------
  // Password Reset Email
  // -------------------------
  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const resetLink = `${process.env.RESET_PASSWORD_URL}?token=${token}`;

    const html = `
      <h1>Password Reset</h1>
      <p>You requested to reset your password. Click below to set a new password:</p>
      <a href="${resetLink}">${resetLink}</a>
      <p>If you did not request this, please ignore this email.</p>
    `;

    await this.sendMail(to, 'Reset your password', html);
  }
}

*/




import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { Resend } from 'resend';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private resend: Resend;

  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

  // -------------------------
  // Central Email Sender (Resend API)
  // -------------------------
  private async sendMail(to: string, subject: string, html: string): Promise<void> {
    try {
      const response = await this.resend.emails.send({
        from: process.env.MAIL_FROM || 'No Reply <noreply@yourdomain.com>',
        to,
        subject,
        html,
      });

      this.logger.log(`✅ Email sent to ${to} | Subject: ${subject}`);
      this.logger.debug(`Resend Response: ${JSON.stringify(response)}`);
    } catch (error) {
      this.logger.error(`❌ Resend failed for ${to}`, error);

      throw new InternalServerErrorException(
        'Failed to send email. Please try again later.',
      );
    }
  }

  // -------------------------
  // Verification Email
  // -------------------------
  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const verificationLink = `${process.env.VERIFICATION_URL}?token=${token}`;

    const html = `
      <h1>Email Verification</h1>
      <p>Click below to verify your email:</p>
      <a href="${verificationLink}" target="_blank">${verificationLink}</a>
    `;

    await this.sendMail(to, 'Verify your Email', html);
  }

  // -------------------------
  // Password Reset Email
  // -------------------------
  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const resetLink = `${process.env.RESET_PASSWORD_URL}?token=${token}`;

    const html = `
      <h1>Password Reset</h1>
      <p>You asked to reset your password. Click below:</p>
      <a href="${resetLink}" target="_blank">${resetLink}</a>
      <p>If you did not request this, ignore this message.</p>
    `;

    await this.sendMail(to, 'Reset your Password', html);
  }
}

