import { BadRequestException, Injectable } from '@nestjs/common';
import axios from 'axios';

type B2File = {
  accountId?: string;
  action?: string;
  bucketId?: string;
  contentLength?: number;
  contentMd5?: string;
  contentSha1?: string;
  contentType?: string;
  fileId: string;
  fileName: string;
  uploadTimestamp?: number;
};

type B2AuthorizeInfo = {
  authorizationToken: string;
  apiUrl: string;
  accountId: string;
};

type B2Config = {
  accountId: string;
  applicationKey: string;
  bucketName: string;
  apiUrl: string;
};

@Injectable()
export class BackblazeService {
  private readonly apiUrl: string;

  private readonly accountId: string;

  private readonly applicationKey: string;

  private readonly bucketName: string;

  constructor(public b2Config: B2Config) {
    this.accountId = this.b2Config.accountId;
    this.applicationKey = this.b2Config.applicationKey;
    this.bucketName = this.b2Config.bucketName.split('/')[0];
    this.apiUrl = this.b2Config.apiUrl;
  }

  async authorizeAccount(): Promise<B2AuthorizeInfo> {
    try {
      const url = `${this.apiUrl}/b2_authorize_account`;
      const { data } = await axios.get(url, {
        auth: {
          username: this.accountId,
          password: this.applicationKey,
        },
      });

      return {
        authorizationToken: data.authorizationToken,
        apiUrl: data.apiUrl,
        accountId: data.accountId,
      };
    } catch (error) {
      throw new BadRequestException('B2 Authorize error');
    }
  }

  async getListBucket(bucketName: string): Promise<string> {
    try {
      const { authorizationToken, apiUrl, accountId } = await this.authorizeAccount();
      const getListFileNameUrl = `${apiUrl}/b2api/v2/b2_list_buckets?accountId=${accountId}&bucketName=${bucketName}`;

      const { data } = await axios.get(getListFileNameUrl, {
        headers: {
          Authorization: authorizationToken,
        },
      });

      return data.buckets[0]?.bucketId;
    } catch {
      throw new BadRequestException('Get List Bucket Error');
    }
  }

  async getListFileName(bucketId: string): Promise<B2File[]> {
    try {
      const maxFileCount = 1000;
      const { authorizationToken, apiUrl } = await this.authorizeAccount();
      const getListFileNameUrl = `${apiUrl}/b2api/v2/b2_list_file_names?bucketId=${bucketId}&maxFileCount=${maxFileCount}`;

      const { data } = await axios.get(getListFileNameUrl, {
        headers: {
          Authorization: authorizationToken,
        },
      });

      return data.files;
    } catch {
      throw new BadRequestException('Get List File Name Error');
    }
  }

  async deleteFile(deleteObject: B2File): Promise<string> {
    try {
      const { authorizationToken, apiUrl } = await this.authorizeAccount();

      const deleteFileUrl = `${apiUrl}/b2api/v2/b2_delete_file_version`;
      await axios.post(
        deleteFileUrl,
        { fileName: deleteObject.fileName, fileId: deleteObject.fileId },
        {
          headers: {
            Authorization: authorizationToken,
          },
        },
      );

      return deleteObject.fileName || '';
    } catch {
      throw new BadRequestException('Delete file error');
    }
  }

  async deleteFiles(deleteObjects: B2File[]): Promise<string> {
    try {
      const { authorizationToken, apiUrl } = await this.authorizeAccount();
      const deleteFileUrl = `${apiUrl}/b2api/v2/b2_delete_file_version`;

      const deletePromises = deleteObjects.map(async (obj) => {
        try {
          await axios.post(
            deleteFileUrl,
            { fileId: obj.fileId, fileName: obj.fileName },
            {
              headers: {
                Authorization: authorizationToken,
              },
            },
          );

          return obj.fileName;
        } catch (error) {
          // eslint-disable-next-line no-console
          console.log(`Delete ${obj.fileName} error:`, error);
        }
      });

      await Promise.allSettled(deletePromises);

      return deleteObjects.map((d, index) => `${index + 1} • ${d.fileName}`).join('\n');
    } catch {
      throw new BadRequestException('Delete files error');
    }
  }
}
