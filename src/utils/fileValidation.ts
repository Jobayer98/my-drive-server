export interface FileValidationConfig {
  maxFileSize: number; // in bytes
  allowedMimeTypes: string[];
  allowedExtensions: string[];
  maxFiles: number;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface FileValidationError {
  field: string;
  message: string;
  filename?: string;
}

export class FileValidator {
  private config: FileValidationConfig;

  constructor(config: FileValidationConfig) {
    this.config = config;
  }

  /**
   * Validate a single file
   */
  validateFile(file: Express.Multer.File): ValidationResult {
    const errors: string[] = [];

    // Check file size
    if (file.size > this.config.maxFileSize) {
      errors.push(
        `File "${file.originalname}" exceeds maximum size limit of ${this.formatFileSize(
          this.config.maxFileSize
        )}`
      );
    }

    // Check MIME type
    if (!this.config.allowedMimeTypes.includes(file.mimetype)) {
      errors.push(
        `File "${file.originalname}" has unsupported type "${file.mimetype}". Allowed types: ${this.config.allowedMimeTypes.join(
          ', '
        )}`
      );
    }

    // Check file extension
    const fileExtension = this.getFileExtension(file.originalname);
    if (fileExtension && !this.config.allowedExtensions.includes(fileExtension)) {
      errors.push(
        `File "${file.originalname}" has unsupported extension "${fileExtension}". Allowed extensions: ${this.config.allowedExtensions.join(
          ', '
        )}`
      );
    }

    // Check if file is empty
    if (file.size === 0) {
      errors.push(`File "${file.originalname}" is empty`);
    }

    // Check filename validity
    if (!this.isValidFilename(file.originalname)) {
      errors.push(
        `File "${file.originalname}" has invalid characters. Only alphanumeric characters, spaces, hyphens, underscores, and dots are allowed`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate multiple files
   */
  validateFiles(files: Express.Multer.File[]): ValidationResult {
    const errors: string[] = [];

    // Check number of files
    if (files.length > this.config.maxFiles) {
      errors.push(
        `Too many files uploaded. Maximum allowed: ${this.config.maxFiles}, received: ${files.length}`
      );
    }

    if (files.length === 0) {
      errors.push('No files provided for upload');
    }

    // Validate each file
    files.forEach((file) => {
      const fileValidation = this.validateFile(file);
      errors.push(...fileValidation.errors);
    });

    // Check for duplicate filenames
    const filenames = files.map((file) => file.originalname);
    const duplicates = filenames.filter(
      (name, index) => filenames.indexOf(name) !== index
    );
    if (duplicates.length > 0) {
      errors.push(
        `Duplicate filenames detected: ${[...new Set(duplicates)].join(', ')}`
      );
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Get file extension from filename
   */
  private getFileExtension(filename: string): string | null {
    const lastDotIndex = filename.lastIndexOf('.');
    if (lastDotIndex === -1 || lastDotIndex === filename.length - 1) {
      return null;
    }
    return filename.substring(lastDotIndex).toLowerCase();
  }

  /**
   * Check if filename contains only valid characters
   */
  private isValidFilename(filename: string): boolean {
    // Allow alphanumeric characters, spaces, hyphens, underscores, and dots
    const validFilenameRegex = /^[a-zA-Z0-9\s\-_.]+$/;
    return validFilenameRegex.test(filename) && filename.length <= 255;
  }

  /**
   * Format file size in human-readable format
   */
  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }
}

/**
 * Default file validation configuration
 */
export const DEFAULT_FILE_CONFIG: FileValidationConfig = {
  maxFileSize: 50 * 1024 * 1024, // 50MB
  allowedMimeTypes: [
    // Images
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    // Text files
    'text/plain',
    'text/csv',
    'application/json',
    'application/xml',
    // Archives
    'application/zip',
    'application/x-rar-compressed',
    'application/x-7z-compressed',
    // Audio
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    // Video
    'video/mp4',
    'video/avi',
    'video/quicktime',
    'video/x-msvideo',
  ],
  allowedExtensions: [
    // Images
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.svg',
    // Documents
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.ppt',
    '.pptx',
    // Text files
    '.txt',
    '.csv',
    '.json',
    '.xml',
    // Archives
    '.zip',
    '.rar',
    '.7z',
    // Audio
    '.mp3',
    '.wav',
    '.ogg',
    // Video
    '.mp4',
    '.avi',
    '.mov',
  ],
  maxFiles: 10,
};

/**
 * Create a file validator with default configuration
 */
export const createDefaultFileValidator = (): FileValidator => {
  return new FileValidator(DEFAULT_FILE_CONFIG);
};

/**
 * Sanitize filename for safe storage
 */
export const sanitizeFilename = (filename: string): string => {
  // Remove or replace unsafe characters
  let sanitized = filename
    .replace(/[<>:"/\\|?*]/g, '_') // Replace unsafe characters with underscore
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/_{2,}/g, '_') // Replace multiple underscores with single
    .replace(/^_+|_+$/g, ''); // Remove leading/trailing underscores

  // Ensure filename is not empty and has reasonable length
  if (!sanitized || sanitized.length === 0) {
    sanitized = 'unnamed_file';
  }

  if (sanitized.length > 100) {
    const extension = sanitized.substring(sanitized.lastIndexOf('.'));
    const nameWithoutExt = sanitized.substring(0, sanitized.lastIndexOf('.'));
    sanitized = nameWithoutExt.substring(0, 100 - extension.length) + extension;
  }

  return sanitized;
};

/**
 * Generate unique filename with timestamp and random suffix
 */
export const generateUniqueFilename = (originalFilename: string): string => {
  const sanitized = sanitizeFilename(originalFilename);
  const timestamp = Date.now();
  const randomSuffix = Math.random().toString(36).substring(2, 8);
  
  const lastDotIndex = sanitized.lastIndexOf('.');
  if (lastDotIndex === -1) {
    return `${sanitized}_${timestamp}_${randomSuffix}`;
  }
  
  const nameWithoutExt = sanitized.substring(0, lastDotIndex);
  const extension = sanitized.substring(lastDotIndex);
  
  return `${nameWithoutExt}_${timestamp}_${randomSuffix}${extension}`;
};