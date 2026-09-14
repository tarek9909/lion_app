import { Request, Response } from 'express';
import { query } from '../../database/db.js';
import { sendSuccess, sendError } from '../../shared/response.js';
import { verifyPassword, signToken } from './auth.service.js';

export async function login(req: Request, res: Response) {
  try {
    const { email, username, password } = req.body;
    const identifier = (email || username || '').trim();

    if (!identifier || !password) {
      return sendError(res, 'Email and password are required', 400);
    }

    // Fetch user from MySQL users table (G-006)
    const users = await query<any[]>(`
      SELECT u.id, u.public_id, u.full_name, u.email, u.username, u.phone, u.password_hash, u.status
      FROM users u
      WHERE u.email = ? OR u.username = ? LIMIT 1
    `, [identifier, identifier]);

    if (users.length === 0) {
      return sendError(res, 'Invalid email or password', 401);
    }

    const u = users[0];

    // Validate account status
    if (u.status !== 'ACTIVE') {
      return sendError(res, 'Account is not active', 403);
    }

    // Secure PBKDF2 Password Verification (G-006)
    const isPasswordValid = verifyPassword(password, u.password_hash);
    if (!isPasswordValid) {
      return sendError(res, 'Invalid email or password', 401);
    }

    // Query user role from user_roles table (G-006, G-040)
    const roleRows = await query<any[]>(`
      SELECT r.code as role FROM user_roles ur
      JOIN roles r ON r.id = ur.role_id
      WHERE ur.user_id = ? LIMIT 1
    `, [u.id]);
    const role = roleRows.length > 0 ? roleRows[0].role : 'SUPERADMIN';

    // Link driver or customer IDs if user is a driver or customer
    let driverId: number | undefined;
    if (role === 'DRIVER') {
      const d = await query<any[]>(`SELECT id FROM drivers WHERE phone_private = ? OR whatsapp_number = ? LIMIT 1`, [u.phone, u.phone]);
      if (d.length > 0) driverId = d[0].id;
    }

    let customerId: number | undefined;
    if (role === 'CUSTOMER') {
      const c = await query<any[]>(`SELECT id FROM customers WHERE whatsapp_number = ? LIMIT 1`, [u.phone]);
      if (c.length > 0) customerId = c[0].id;
    }

    // Generate signed JWT token
    const token = signToken({
      userId: u.id,
      publicId: u.public_id,
      email: u.email,
      role,
      driverId,
      customerId,
    });

    return sendSuccess(res, {
      token,
      user: {
        id: u.id,
        public_id: u.public_id,
        name: u.full_name,
        email: u.email,
        role,
        driverId,
        customerId,
      },
    });
  } catch (error: any) {
    return sendError(res, error);
  }
}
