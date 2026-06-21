import { Injectable, Logger } from "@nestjs/common";
import {
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

/**
 * Cloudflare R2 (S3-compatible) writer. Used for:
 *  - raw source archives  (raw/<job>/<date>/<name>) for reproducibility
 *  - PMTiles              (tiles/<layer>.pmtiles)
 *  - pipeline status JSON (status/pipeline.json)
 * Falls back to a no-op (with warning) when R2 env vars are absent, so local
 * dev without credentials still works.
 */
@Injectable()
export class ArchiverService {
  private readonly logger = new Logger(ArchiverService.name);
  private readonly client: S3Client | null;
  private readonly bucket: string;

  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    this.bucket = process.env.R2_BUCKET ?? "forest-watch";

    if (accountId && accessKeyId && secretAccessKey) {
      this.client = new S3Client({
        region: "auto",
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
      });
    } else {
      this.client = null;
      this.logger.warn("R2 credentials missing, archiving is a no-op");
    }
  }

  get enabled(): boolean {
    return this.client !== null;
  }

  /** sha256 of a payload, used by ingest jobs to skip unchanged sources. */
  hash(payload: string | Buffer): string {
    return createHash("sha256").update(payload).digest("hex");
  }

  async putJson(key: string, body: unknown): Promise<void> {
    await this.put(key, JSON.stringify(body), "application/json");
  }

  async put(
    key: string,
    body: string | Buffer,
    contentType = "application/octet-stream",
  ): Promise<void> {
    if (!this.client) return;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    this.logger.debug(`uploaded r2://${this.bucket}/${key}`);
  }

  async putFile(
    key: string,
    filePath: string,
    contentType = "application/octet-stream",
  ): Promise<void> {
    if (!this.client) return;
    const { size } = await stat(filePath);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: createReadStream(filePath),
        ContentLength: size,
        ContentType: contentType,
      }),
    );
    this.logger.log(`uploaded r2://${this.bucket}/${key} (${size} bytes)`);
  }

  /** Archive a raw source payload under raw/<job>/<yyyy-mm-dd>/<name>. */
  async archiveRaw(
    job: string,
    name: string,
    payload: string | Buffer,
    contentType = "application/json",
  ): Promise<string> {
    const date = new Date().toISOString().slice(0, 10);
    const key = `raw/${job}/${date}/${name}`;
    await this.put(key, payload, contentType);
    return key;
  }
}
