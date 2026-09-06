import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Client as MinioClient } from 'minio';
import { ServiceUnconfiguredError } from '../common/errors';

interface Endpoint {
  host: string;
  port: number;
  useSSL: boolean;
}

/**
 * Object storage for uploaded DXF files. Every connection detail comes from the
 * environment the platform injects into this namespace — no hostname, port or
 * credential is ever hardcoded.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client: MinioClient | null = null;
  private readonly bucket = process.env.MINIO_BUCKET ?? 'drawings';
  private bucketReady = false;

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureBucket();
    } catch (error) {
      // A cold object store must not stop the API from booting; uploads report it.
      this.logger.warn(`object storage not ready at boot: ${(error as Error).message}`);
    }
  }

  get configured(): boolean {
    return this.resolveEndpoint() !== null && this.credentials() !== null;
  }

  private resolveEndpoint(): Endpoint | null {
    const raw =
      process.env.MINIO_ENDPOINT ?? process.env.S3_ENDPOINT ?? process.env.MINIO_URL ?? '';
    if (!raw.trim()) return null;
    try {
      const url = new URL(raw.includes('://') ? raw : `http://${raw}`);
      const useSSL = url.protocol === 'https:';
      return {
        host: url.hostname,
        port: url.port ? Number.parseInt(url.port, 10) : useSSL ? 443 : 80,
        useSSL,
      };
    } catch {
      return null;
    }
  }

  private credentials(): { accessKey: string; secretKey: string } | null {
    const accessKey = process.env.MINIO_ROOT_USER ?? process.env.MINIO_ACCESS_KEY ?? '';
    const secretKey =
      process.env.MINIO_ROOT_PASSWORD ??
      process.env.MINIO_SECRET_KEY ??
      process.env.MINIO_S3_COMPATIBLE_OBJECT_STORAGE_MINIO_SDK_API_KEY ??
      '';
    if (!accessKey || !secretKey) return null;
    return { accessKey, secretKey };
  }

  private require(): MinioClient {
    if (this.client) return this.client;
    const endpoint = this.resolveEndpoint();
    const credentials = this.credentials();
    if (!endpoint || !credentials) {
      throw new ServiceUnconfiguredError(
        'Object storage',
        'Set MINIO_ENDPOINT and the MinIO credentials for this namespace, then retry the upload.',
      );
    }
    this.client = new MinioClient({
      endPoint: endpoint.host,
      port: endpoint.port,
      useSSL: endpoint.useSSL,
      accessKey: credentials.accessKey,
      secretKey: credentials.secretKey,
    });
    return this.client;
  }

  private async ensureBucket(): Promise<MinioClient> {
    const client = this.require();
    if (this.bucketReady) return client;
    if (!(await client.bucketExists(this.bucket))) {
      await client.makeBucket(this.bucket);
    }
    this.bucketReady = true;
    return client;
  }

  async put(key: string, body: Buffer, contentType = 'application/dxf'): Promise<string> {
    const client = await this.ensureBucket();
    await client.putObject(this.bucket, key, body, body.length, {
      'Content-Type': contentType,
    });
    return key;
  }

  async get(key: string): Promise<Buffer> {
    const client = await this.ensureBucket();
    const stream = await client.getObject(this.bucket, key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks);
  }

  /** Short-lived download link. Signature generation is local crypto — no round trip. */
  async presignedGet(key: string, expirySeconds = 300): Promise<string> {
    const client = await this.ensureBucket();
    return client.presignedGetObject(this.bucket, key, expirySeconds);
  }

  async remove(key: string): Promise<void> {
    const client = await this.ensureBucket();
    await client.removeObject(this.bucket, key);
  }

  /** Used by the deep health check. */
  async ping(): Promise<void> {
    await this.ensureBucket();
  }
}
