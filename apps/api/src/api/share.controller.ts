import {
  BadRequestException,
  Body,
  Controller,
  Post,
  ServiceUnavailableException,
} from "@nestjs/common";
import { randomBytes } from "crypto";
import { ArchiverService } from "../common/archiver.service";

/**
 * Stores a user-generated "share this view" image on R2 so it can be unfurled
 * as an OG image on social platforms. The web app posts a base64 PNG; we return
 * a short id. The public URL is `${SITE}/share/${id}.png` (proxied to R2), and
 * `${SITE}/s/${id}` is the share page whose OG image points at it.
 */
@Controller("share")
export class ShareController {
  constructor(private readonly archiver: ArchiverService) {}

  @Post()
  async create(@Body() body: { image?: string }) {
    if (!this.archiver.enabled)
      throw new ServiceUnavailableException("storage not configured");
    const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(
      body?.image ?? "",
    );
    if (!m) throw new BadRequestException("expected a data:image/png;base64 body");
    const buf = Buffer.from(m[1], "base64");
    if (buf.length < 100 || buf.length > 6_000_000)
      throw new BadRequestException("image out of size bounds");
    const id = randomBytes(8).toString("hex");
    await this.archiver.put(`share/${id}.png`, buf, "image/png");
    return { id };
  }
}
