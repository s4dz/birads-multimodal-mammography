import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { AppError, toErrorResponse } from '@/lib/app-error';
import { requireAdmin } from '@/lib/auth';
import { createUser, listUsers } from '@/lib/db-repository';
import { hashPassword } from '@/lib/session';
import type { UserRole } from '@/lib/types';

export const dynamic = 'force-dynamic';

const ROLES = new Set<UserRole>(['admin', 'radiologist']);

/** GET /api/admin/users — list every account. */
export async function GET(): Promise<NextResponse> {
  try {
    await requireAdmin();
    return NextResponse.json({ ok: true, users: listUsers() });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/** POST /api/admin/users — create a new account. */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    await requireAdmin();
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new AppError(400, 'Request body must be valid JSON.');
    }
    const { username, password, name, role, specialty } = (body ?? {}) as {
      username?: unknown;
      password?: unknown;
      name?: unknown;
      role?: unknown;
      specialty?: unknown;
    };
    if (typeof username !== 'string' || username.trim().length === 0) {
      throw new AppError(422, 'username is required.');
    }
    if (typeof password !== 'string' || password.length < 6) {
      throw new AppError(422, 'password must be at least 6 characters.');
    }
    if (typeof name !== 'string' || name.trim().length === 0) {
      throw new AppError(422, 'name is required.');
    }
    if (typeof role !== 'string' || !ROLES.has(role as UserRole)) {
      throw new AppError(422, 'role must be "admin" or "radiologist".');
    }
    if (specialty !== undefined && typeof specialty !== 'string') {
      throw new AppError(422, 'specialty must be a string when provided.');
    }

    const user = createUser({
      id: `user_${randomUUID()}`,
      username: username.trim(),
      passwordHash: hashPassword(password),
      name: name.trim(),
      role: role as UserRole,
      specialty: typeof specialty === 'string' ? specialty.trim() : '',
    });
    return NextResponse.json({ ok: true, user }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}