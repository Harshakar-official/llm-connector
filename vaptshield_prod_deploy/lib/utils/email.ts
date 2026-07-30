import nodemailer from "nodemailer"
import { EMAIL_TEMPLATES } from "./email-templates"

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: process.env.SMTP_PORT === "465",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS?.replace(/^["'](.+)["']$/, '$1'),
  },
})

interface SendEmailParams {
  to: string
  subject: string
  templateName: keyof typeof EMAIL_TEMPLATES
  templateVars: Record<string, string>
}

export async function sendBrandedEmail({
  to,
  subject,
  templateName,
  templateVars,
}: SendEmailParams) {
  try {
    console.log(`[Email] Attempting to send to ${to} via ${process.env.SMTP_HOST}...`)
    
    let html: string = EMAIL_TEMPLATES[templateName]

    if (!html) {
      throw new Error(`Email template "${templateName}" not found`)
    }

    // Simple template variable replacement
    Object.entries(templateVars).forEach(([key, value]) => {
      const regex = new RegExp(`{{\\s*\\.?${key}\\s*}}`, "g")
      html = html.replace(regex, value)
    })

    const info = await transporter.sendMail({
      from: `"VAPTShield Security" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    })

    console.log("[Email] Sent successfully: %s", info.messageId)
    return { success: true, messageId: info.messageId }
  } catch (error: any) {
    console.error("[Email] Delivery failed:", error.message)
    throw error
  }
}
