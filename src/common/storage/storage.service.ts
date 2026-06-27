import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  GetObjectCommandInput,
  GetObjectCommandOutput,
} from '@aws-sdk/client-s3';
import {
  Injectable,
  InternalServerErrorException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extname } from 'path';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';

@Injectable()
export class StorageService {
  private s3: S3Client;
  private bucket: string;

  constructor(private configService: ConfigService) {
    const region = this.configService.get<string>('AWS_S3_REGION');
    const accessKeyId = this.configService.get<string>('AWS_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>(
      'AWS_SECRET_ACCESS_KEY',
    );
    const bucket = this.configService.get<string>('AWS_S3_BUCKET');

    if (!region || !accessKeyId || !secretAccessKey || !bucket) {
      throw new Error('Missing AWS S3 configuration in .env');
    }

    this.bucket = bucket;
    this.s3 = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
    });
  }

  async uploadFile(file: Express.Multer.File, keyPrefix: string) {
    // lo que se guarda en images es público
    if (!file?.buffer) {
      throw new InternalServerErrorException('File buffer is missing');
    }

    const ext = extname(file.originalname);
    const filename = `${randomUUID()}${ext}`;
    const key = `${keyPrefix}/${filename}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    // Retorna solo la key; no la URL pública
    return key;
  }

  async getFileBuffer(key: string): Promise<Buffer> {
    try {
      const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
      const { Body } = await this.s3.send(command);

      return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        (Body as any).on('data', (chunk: Buffer) => chunks.push(chunk));
        (Body as any).on('end', () => resolve(Buffer.concat(chunks)));
        (Body as any).on('error', reject);
      });
    } catch (err) {
      throw new InternalServerErrorException(
        `Error fetching file from S3: ${key}`,
      );
    }
  }

  // 🌟 Nuevo: generar un stream para enviar al frontend
  async getFileStream(key: string): Promise<StreamableFile> {
    const buffer = await this.getFileBuffer(key);
    const stream = Readable.from(buffer);
    return new StreamableFile(stream);
  }

  // 🌟 Opcional: generar URL prefirmada temporal
  async getPresignedUrl(key: string, expiresInSeconds = 60): Promise<string> {
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.s3, command, { expiresIn: expiresInSeconds });
  }
}
