import mongoose, { Document, Schema, Types } from "mongoose";

export interface IAuditLog {
  userId?: Types.ObjectId;
  userName: string;
  action: "create" | "update" | "delete" | "login" | "logout" | "import" | "checkout" | "export";
  domain: "identity" | "catalog" | "inventory" | "sales" | "settings" | "system";
  description: string;
  ipAddress: string;
  createdAt: Date;
}

export type AuditLogDocument = Document & IAuditLog;

const auditLogSchema = new Schema<AuditLogDocument>(
  {
    userId:      { type: Schema.Types.ObjectId, ref: "User", required: false },
    userName:    { type: String, required: true, trim: true },
    action:      { type: String, enum: ["create", "update", "delete", "login", "logout", "import", "checkout", "export"], required: true },
    domain:      { type: String, enum: ["identity", "catalog", "inventory", "sales", "settings", "system"], required: true },
    description: { type: String, required: true, trim: true },
    ipAddress:   { type: String, required: true, trim: true },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: "audit_logs", versionKey: false }
);

const AuditLog = mongoose.model<AuditLogDocument>("AuditLog", auditLogSchema);

export default AuditLog;
