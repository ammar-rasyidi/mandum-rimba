import { Injectable, Logger } from "@nestjs/common";
import axios, { AxiosInstance, AxiosRequestConfig } from "axios";

/**
 * Shared outbound HTTP client for all ingest jobs.
 * Honest User-Agent + global politeness delay between requests (ingestion
 * rules §4): we identify ourselves and never hammer public-interest sources.
 */
@Injectable()
export class HttpService {
  private readonly logger = new Logger(HttpService.name);
  private readonly client: AxiosInstance;
  private queue: Promise<void> = Promise.resolve();
  private static readonly DELAY_MS = 1000;

  constructor() {
    this.client = axios.create({
      timeout: 120_000,
      headers: {
        "User-Agent":
          "MandumRimba/0.1 (public-interest environmental observatory, Indonesia)",
      },
      maxContentLength: 512 * 1024 * 1024,
    });
  }

  /** GET with global rate limiting; retries once on 5xx/network errors. */
  async get<T = unknown>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    return this.enqueue(async () => {
      try {
        const res = await this.client.get<T>(url, config);
        return res.data;
      } catch (err) {
        this.logger.warn(`GET ${url} failed once, retrying: ${err}`);
        await new Promise((r) => setTimeout(r, 5000));
        const res = await this.client.get<T>(url, config);
        return res.data;
      }
    });
  }

  async post<T = unknown>(
    url: string,
    body: unknown,
    config?: AxiosRequestConfig,
  ): Promise<T> {
    return this.enqueue(async () => {
      const res = await this.client.post<T>(url, body, config);
      return res.data;
    });
  }

  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const result = this.queue.then(fn);
    this.queue = result
      .catch(() => undefined)
      .then(() => new Promise((r) => setTimeout(r, HttpService.DELAY_MS)));
    return result;
  }
}
