import mongoose, { Schema } from "mongoose";
const auditLogSchema = new Schema({
    userId: { type: Schema.Types.ObjectId, ref: "User", required: false },
    userName: { type: String, required: true, trim: true },
    action: {
        type: String,
        enum: [
            "create",
            "update",
            "delete",
            "login",
            "logout",
            "import",
            "checkout",
            "export",
        ],
        required: true,
    },
    domain: {
        type: String,
        enum: ["identity", "catalog", "inventory", "sales", "settings", "system"],
        required: true,
    },
    description: { type: String, required: true, trim: true },
    ipAddress: { type: String, required: true, trim: true },
}, {
    timestamps: { createdAt: true, updatedAt: false },
    collection: "audit_logs",
    versionKey: false,
});
// Indexes phục vụ Lọc, Phân trang và Archiving
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ userId: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });
const AuditLog = mongoose.model("AuditLog", auditLogSchema);
export default AuditLog;
