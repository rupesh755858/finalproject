import mongoose from 'mongoose';

/**
 * Roles, in order of authority:
 *   controller — exactly one. Owns the system, cannot be demoted or disabled.
 *   admin      — can create logins, disable members, reset passwords.
 *   user       — sees and manages the shared monitors, nothing more.
 */
export const ROLES = ['controller', 'admin', 'user'];

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    name: { type: String, default: '' },
    role: { type: String, enum: ROLES, default: 'user', index: true },
    isActive: { type: Boolean, default: true, index: true },
    lastLoginAt: { type: Date, default: null },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true }
);

/** Shape sent to the client — never leaks the password hash. */
userSchema.methods.toPublic = function toPublic() {
  return {
    id: String(this._id),
    email: this.email,
    name: this.name,
    role: this.role,
    isActive: this.isActive,
    lastLoginAt: this.lastLoginAt,
    createdAt: this.createdAt,
  };
};

export const isAdminRole = (role) => role === 'controller' || role === 'admin';

export default mongoose.model('User', userSchema);
