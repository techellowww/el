import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { verifyPassword, generateToken, authenticate, AuthRequest } from '../lib/auth';
import { logAuditEvent } from '../lib/audit';

const router = Router();

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({ error: 'Your account has been deactivated. Please contact an administrator.' });
      return;
    }

    const isMatch = await verifyPassword(password, user.passwordHash);
    if (!isMatch) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const payload = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as 'ADMIN' | 'EMPLOYEE',
      employeeId: user.employeeId,
      department: user.department,
    };

    const token = generateToken(payload);

    await logAuditEvent({
      userId: user.id,
      action: 'USER_LOGIN',
      targetEntity: 'User',
      targetId: user.id,
      mandatoryReason: 'User authenticated successfully',
      details: { email: user.email, role: user.role },
      ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || '127.0.0.1',
    });

    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('el_token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      user: payload,
      token,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'An unexpected server error occurred during login.' });
  }
});

router.post('/logout', async (req: Request, res: Response) => {
  const token = req.cookies?.el_token;
  const isProduction = process.env.NODE_ENV === 'production';
  if (token) {
    res.clearCookie('el_token', {
      path: '/',
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
    });
  }
  res.json({ success: true, message: 'Logged out successfully' });
});

router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  res.json({ user: req.user });
});

export default router;
