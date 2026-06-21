import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { createHash, timingSafeEqual } from "node:crypto";
import type { Request } from "express";

/** Constant-time string compare (SHA-256 → fixed length, so it also doesn't
 *  leak length and never throws on mismatched lengths). */
function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Guards admin endpoints (manual job triggers, story publishing). */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const key = process.env.ADMIN_API_KEY;
    if (!key) throw new UnauthorizedException("admin API disabled");

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers["x-api-key"];
    // a repeated header arrives as an array, normalise to a single value
    const token = Array.isArray(header) ? header[0] : header;

    if (!token || !safeEqual(token, key)) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
