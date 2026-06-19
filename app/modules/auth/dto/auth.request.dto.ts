import { z } from "zod";

export const RegisterSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().toLowerCase().email("Email is invalid"),
  phone: z.string().trim().regex(/^[0-9]{9,11}$/, "Phone number is invalid"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

export const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email is invalid").optional(),
  phone: z.string().trim().regex(/^[0-9]{9,11}$/, "Phone number is invalid").optional(),
  password: z.string().min(1, "Password is required"),
}).refine(data => data.email || data.phone, {
  message: "Email or phone number is required",
  path: ["email"],
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export const ForgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Email is invalid").optional(),
  phone: z.string().trim().regex(/^[0-9]{9,11}$/, "Phone number is invalid").optional(),
}).refine(data => data.email || data.phone, {
  message: "Email or phone number is required",
  path: ["email"],
});

export const ResetPasswordSchema = z.object({
  token: z.string().min(1, "Token is invalid"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>;
