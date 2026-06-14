import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";

/** Guards admin endpoints (manual job triggers, story publishing). */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const key = process.env.ADMIN_API_KEY;
    if (!key) throw new UnauthorizedException("admin API disabled");
    const req = context.switchToHttp().getRequest<Request>();
    if (req.headers["x-api-key"] !== key) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
