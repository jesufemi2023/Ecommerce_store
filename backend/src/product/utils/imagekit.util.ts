// src/product/utils/imagekit.util.ts

import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import ImageKit from 'imagekit';

/**
 * ImagekitUtil
 * -------------
 * A reusable NestJS service utility for managing product images using ImageKit.
 * Handles secure uploads, deletions, and optional signed URL generation.
 */
@Injectable()
export class ImagekitUtil {
  private readonly imagekit: ImageKit;
  private readonly logger = new Logger(ImagekitUtil.name);

  constructor() {
    // Initialize ImageKit SDK using environment variables
    this.imagekit = new ImageKit({
      publicKey: process.env.IMAGEKIT_PUBLIC_KEY ?? '',
      privateKey: process.env.IMAGEKIT_PRIVATE_KEY ?? '',
      urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT ?? '',
    });
  }

  /**
   * Uploads a single image to ImageKit
   * @param file - The image file received from Multer (Express.Multer.File)
   * @param folder - Optional folder name for better organization (default: 'products')
   * @returns {Promise<{ url: string; fileId: string; name: string }>}
   */
  async uploadImage(
    file: Express.Multer.File,
    folder = 'products',
  ): Promise<{ url: string; fileId: string; name: string }> {
    if (!file?.buffer) {
      throw new InternalServerErrorException('Invalid image file');
    }

    try {
      const uploadResponse = await this.imagekit.upload({
        file: file.buffer, // file buffer from Multer
        fileName: file.originalname,
        folder,
      });

      this.logger.log(`✅ Uploaded image: ${uploadResponse.name}`);

      return {
        url: uploadResponse.url,
        fileId: uploadResponse.fileId,
        name: uploadResponse.name,
      };
    } catch (error: any) {
      this.logger.error('❌ Image upload failed', error.stack);
      throw new InternalServerErrorException('Image upload failed');
    }
  }

  /**
   * Uploads multiple images concurrently to ImageKit
   * @param files - Array of image files
   * @param folder - Optional folder name (default: 'products')
   * @returns Promise of uploaded image metadata array
   */
  async uploadMultipleImages(
    files: Express.Multer.File[],
    folder = 'products',
  ): Promise<{ url: string; fileId: string; name: string }[]> {
    if (!files?.length) return [];

    try {
      // Upload all images concurrently for better performance
      const uploads = await Promise.all(
        files.map((file) => this.uploadImage(file, folder)),
      );

      this.logger.log(`✅ Uploaded ${uploads.length} images successfully`);
      return uploads;
    } catch (error: any) {
      this.logger.error('❌ Multiple image upload failed', error.stack);
      throw new InternalServerErrorException(
        'Failed to upload multiple images',
      );
    }
  }

  /**
   * Deletes a single image from ImageKit
   * @param fileId - The ImageKit file ID
   */
  async deleteImage(fileId: string): Promise<void> {
    if (!fileId) return;

    try {
      await this.imagekit.deleteFile(fileId);
      this.logger.log(`🗑️ Deleted image from ImageKit: ${fileId}`);
    } catch (error: any) {
      this.logger.error('❌ Failed to delete image', error.stack);
    }
  }

  /**
   * Deletes multiple images concurrently
   * @param fileIds - Array of file IDs to delete
   */
  async deleteMultipleImages(fileIds: string[]): Promise<void> {
    if (!fileIds?.length) return;

    await Promise.all(fileIds.map((id) => this.deleteImage(id)));
  }

  /**
   * Optionally generate a signed URL for secure access
   * (useful if private images are enabled later)
   * @param filePath - Path or file name in ImageKit
   * @returns signed URL string
   */
  generateSignedUrl(filePath: string): string {
    return this.imagekit.url({
      path: filePath,
      transformation: [{ width: 800, height: 800 }],
      signed: true,
      expireSeconds: 60 * 60, // 1 hour
    });
  }
}
