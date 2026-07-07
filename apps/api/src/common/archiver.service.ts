import { Injectable, Logger } from "@nestjs/common";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";

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

  /** PUT a JSON object gzip-compressed (Content-Encoding: gzip) — for the static
   *  species atlas on R2 (index / points / per-species files). Browsers fetch
   *  and decompress transparently. */
  async putGzipJson(
    key: string,
    obj: unknown,
    contentType = "application/json",
  ): Promise<void> {
    if (!this.client) return;
    const body = gzipSync(Buffer.from(JSON.stringify(obj)));
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentEncoding: "gzip",
        CacheControl: "public, max-age=3600",
      }),
    );
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

  /** Archive a raw source payload under raw/<job>/<yyyy-mm-dd>/<name>, then keep
   *  ONLY the current run's snapshot for this job (older dated snapshots are
   *  pruned). Nothing reads raw/ back — it's download-only provenance — so
   *  retaining every historical run just balloons storage (5 GB before this). */
  async archiveRaw(
    job: string,
    name: string,
    payload: string | Buffer,
    contentType = "application/json",
  ): Promise<string> {
    const date = new Date().toISOString().slice(0, 10);
    const key = `raw/${job}/${date}/${name}`;
    await this.put(key, payload, contentType);
    await this.pruneRawExcept(job, date);
    return key;
  }

  /** Delete every raw/<job>/ object whose date segment is not `keepDate`, so a
   *  source keeps only its latest snapshot. Best-effort: a prune failure logs a
   *  warning but never fails the ingest job that called it. */
  private async pruneRawExcept(job: string, keepDate: string): Promise<void> {
    if (!this.client) return;
    try {
      const prefix = `raw/${job}/`;
      const stale: { Key: string }[] = [];
      let token: string | undefined;
      do {
        const page = await this.client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            Prefix: prefix,
            ContinuationToken: token,
          }),
        );
        for (const obj of page.Contents ?? []) {
          const date = obj.Key?.slice(prefix.length).split("/")[0];
          if (obj.Key && date && date !== keepDate) stale.push({ Key: obj.Key });
        }
        token = page.IsTruncated ? page.NextContinuationToken : undefined;
      } while (token);

      for (let i = 0; i < stale.length; i += 1000) {
        await this.client.send(
          new DeleteObjectsCommand({
            Bucket: this.bucket,
            Delete: { Objects: stale.slice(i, i + 1000), Quiet: true },
          }),
        );
      }
      if (stale.length) {
        this.logger.log(`pruned ${stale.length} stale raw/${job} snapshot(s)`);
      }
    } catch (err) {
      this.logger.warn(
        `raw prune for ${job} failed (non-fatal): ${(err as Error).message}`,
      );
    }
  }
}
