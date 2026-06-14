import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import type { Response } from "express";

/** CDN-friendly Cache-Control on every public GET (§8). */
@Injectable()
export class CacheHeaderInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      tap(() => {
        const http = context.switchToHttp();
        if (http.getRequest().method === "GET") {
          http
            .getResponse<Response>()
            .setHeader(
              "Cache-Control",
              "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
            );
        }
      }),
    );
  }
}
