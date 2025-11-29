#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import * as z from 'zod';
import B2 from 'backblaze-b2';

// Initialize MCP Server
const server = new McpServer({
    name: 'Backblaze B2',
    version: '1.0.0'
});

// Global B2 client instance
let b2Client: B2 | null = null;

//create B2 client
async function getB2Client(): Promise<B2> {
    if (!b2Client) {
        const keyId = process.env.B2_APPLICATION_KEY_ID;
        const applicationKey = process.env.B2_APPLICATION_KEY;

        if (!keyId || !applicationKey) {
            throw new Error('B2 credentials not configured');
        }

        b2Client = new B2({
            applicationKeyId: keyId,
            applicationKey: applicationKey,
        });

        await b2Client.authorize();
    }
    return b2Client;
}

// format response
function formatResponse(data: any, summary?: string) {
    return {
        content: [
            {
                type: 'text' as const,
                text: summary || JSON.stringify(data, null, 2)
            }
        ],
        structuredContent: data
    };
}

// format errors
function formatError(error: any, operation: string) {
    const errorData = error.response?.data || error;
    const errorMessage = {
        error: true,
        operation,
        code: errorData.code || 'unknown',
        message: errorData.message || error.message || 'Unknown error',
        status: errorData.status || error.response?.status || 500,
        details: errorData
    };

    return {
        content: [
            {
                type: 'text' as const,
                text: `❌ ${operation} failed\n\nError Code: ${errorMessage.code}\nStatus: ${errorMessage.status}\nMessage: ${errorMessage.message}`
            }
        ],
        structuredContent: errorMessage,
        isError: true
    };
}

// BUCKET MANAGEMENT TOOLS

server.registerTool(
    'createBucket',
    {
        title: 'Create Bucket',
        description: 'Create a new B2 bucket with the specified name and type',
        inputSchema: {
            bucketName: z.string().describe('Name of the bucket to create'),
            bucketType: z.enum(['allPublic', 'allPrivate']).describe('Bucket type: allPublic or allPrivate')
        },
        outputSchema: {
            bucketId: z.string(),
            bucketName: z.string(),
            bucketType: z.string(),
            accountId: z.string()
        }
    },
    async ({ bucketName, bucketType }) => {
        try {
            const b2 = await getB2Client();
            const response = await b2.createBucket({
                bucketName,
                bucketType
            });
            return formatResponse(response.data, `Bucket '${bucketName}' created successfully`);
        } catch (error) {
            return formatError(error, 'createBucket');
        }
    }
);

server.registerTool(
    'deleteBucket',
    {
        title: 'Delete Bucket',
        description: 'Delete a B2 bucket by its ID',
        inputSchema: {
            bucketId: z.string().describe('ID of the bucket to delete')
        },
        outputSchema: {
            bucketId: z.string(),
            bucketName: z.string()
        }
    },
    async ({ bucketId }) => {
        try {
            const b2 = await getB2Client();
            const response = await b2.deleteBucket({ bucketId });
            return formatResponse(response.data, `Bucket deleted successfully`);
        } catch (error) {
            return formatError(error, 'deleteBucket');
        }
    }
);

server.registerTool(
    'listBuckets',
    {
        title: 'List Buckets',
        description: 'List all B2 buckets in the account',
        inputSchema: {},
        outputSchema: {
            buckets: z.array(z.object({
                bucketId: z.string(),
                bucketName: z.string(),
                bucketType: z.string()
            }))
        }
    },
    async () => {
        try {
            const b2 = await getB2Client();
            const response = await b2.listBuckets();
            const buckets = response.data.buckets || [];
            return formatResponse(
                response.data,
                `Found ${buckets.length} bucket(s)`
            );
        } catch (error) {
            return formatError(error, 'listBuckets');
        }
    }
);

server.registerTool(
    'getBucket',
    {
        title: 'Get Bucket',
        description: 'Get information about a specific bucket by name',
        inputSchema: {
            bucketName: z.string().describe('Name of the bucket to retrieve'),
            bucketId: z.string().optional().describe('Optional bucket ID for faster lookup')
        },
        outputSchema: {
            bucketId: z.string(),
            bucketName: z.string(),
            bucketType: z.string()
        }
    },
    async ({ bucketName, bucketId }) => {
        try {
            const b2 = await getB2Client();
            const response = await b2.getBucket({ bucketName, bucketId });
            return formatResponse(response.data, `Bucket '${bucketName}' retrieved`);
        } catch (error) {
            return formatError(error, 'getBucket');
        }
    }
);

server.registerTool(
    'updateBucket',
    {
        title: 'Update Bucket',
        description: 'Update a bucket\'s type (public/private)',
        inputSchema: {
            bucketId: z.string().describe('ID of the bucket to update'),
            bucketType: z.enum(['allPublic', 'allPrivate']).describe('New bucket type')
        },
        outputSchema: {
            bucketId: z.string(),
            bucketName: z.string(),
            bucketType: z.string()
        }
    },
    async ({ bucketId, bucketType }) => {
        try {
            const b2 = await getB2Client();
            const response = await b2.updateBucket({ bucketId, bucketType });
            return formatResponse(response.data, `Bucket updated to ${bucketType}`);
        } catch (error) {
            return formatError(error, 'updateBucket');
        }
    }
);

// FILE OPERATIONS TOOLS

server.registerTool(
    'getUploadUrl',
    {
        title: 'Get Upload URL',
        description: 'Get a URL for uploading files to a bucket',
        inputSchema: {
            bucketId: z.string().describe('ID of the bucket to upload to')
        },
        outputSchema: {
            uploadUrl: z.string(),
            authorizationToken: z.string()
        }
    },
    async ({ bucketId }) => {
        const b2 = await getB2Client();
        const response = await b2.getUploadUrl({ bucketId });
        return formatResponse(response.data, 'Upload URL retrieved');
    }
);

server.registerTool(
    'uploadFile',
    {
        title: 'Upload File',
        description: 'Upload a file to B2. Data should be base64-encoded.',
        inputSchema: {
            uploadUrl: z.string().describe('Upload URL from getUploadUrl'),
            uploadAuthToken: z.string().describe('Authorization token from getUploadUrl'),
            fileName: z.string().describe('Name of the file'),
            data: z.string().describe('Base64-encoded file data'),
            mime: z.string().optional().describe('MIME type (default: b2/x-auto)'),
            info: z.record(z.string(), z.string()).optional().describe('Custom file info headers (max 10)')
        },
        outputSchema: {
            fileId: z.string(),
            fileName: z.string(),
            contentLength: z.number()
        }
    },
    async ({ uploadUrl, uploadAuthToken, fileName, data, mime, info }) => {
        const b2 = await getB2Client();
        const buffer = Buffer.from(data, 'base64');
        const response = await b2.uploadFile({
            uploadUrl,
            uploadAuthToken,
            fileName,
            data: buffer,
            mime,
            info: info as Record<string, string> | undefined
        });
        return formatResponse(response.data, `File '${fileName}' uploaded successfully`);
    }
);

server.registerTool(
    'listFileNames',
    {
        title: 'List File Names',
        description: 'List files in a bucket',
        inputSchema: {
            bucketId: z.string().describe('Bucket ID to list files from'),
            startFileName: z.string().optional().describe('File name to start listing from'),
            maxFileCount: z.number().optional().describe('Maximum number of files to return'),
            delimiter: z.string().optional().describe('Delimiter for folder-like listing'),
            prefix: z.string().optional().describe('File name prefix filter')
        },
        outputSchema: {
            files: z.array(z.object({
                fileId: z.string(),
                fileName: z.string(),
                contentLength: z.number()
            }))
        }
    },
    async ({ bucketId, startFileName, maxFileCount, delimiter, prefix }) => {
        const b2 = await getB2Client();
        const response = await b2.listFileNames({
            bucketId,
            startFileName: startFileName || '',
            maxFileCount: maxFileCount || 100,
            delimiter: delimiter || '',
            prefix: prefix || ''
        });
        const files = response.data.files || [];
        return formatResponse(response.data, `Found ${files.length} file(s)`);
    }
);

server.registerTool(
    'listFileVersions',
    {
        title: 'List File Versions',
        description: 'List all versions of files in a bucket',
        inputSchema: {
            bucketId: z.string().describe('Bucket ID to list file versions from'),
            startFileName: z.string().optional().describe('File name to start listing from'),
            startFileId: z.string().optional().describe('File ID to start listing from'),
            maxFileCount: z.number().optional().describe('Maximum number of files to return')
        },
        outputSchema: {
            files: z.array(z.object({
                fileId: z.string(),
                fileName: z.string()
            }))
        }
    },
    async ({ bucketId, startFileName, startFileId, maxFileCount }) => {
        const b2 = await getB2Client();
        const response = await b2.listFileVersions({
            bucketId,
            startFileName: startFileName || '',
            startFileId: startFileId || '',
            maxFileCount: maxFileCount || 100
        });
        const files = response.data.files || [];
        return formatResponse(response.data, `Found ${files.length} file version(s)`);
    }
);

server.registerTool(
    'hideFile',
    {
        title: 'Hide File',
        description: 'Hide a file (make it invisible in listings)',
        inputSchema: {
            bucketId: z.string().describe('Bucket ID containing the file'),
            fileName: z.string().describe('Name of the file to hide')
        },
        outputSchema: {
            fileId: z.string(),
            fileName: z.string()
        }
    },
    async ({ bucketId, fileName }) => {
        const b2 = await getB2Client();
        const response = await b2.hideFile({ bucketId, fileName });
        return formatResponse(response.data, `File '${fileName}' hidden`);
    }
);

server.registerTool(
    'getFileInfo',
    {
        title: 'Get File Info',
        description: 'Get information about a file by its ID',
        inputSchema: {
            fileId: z.string().describe('ID of the file')
        },
        outputSchema: {
            fileId: z.string(),
            fileName: z.string(),
            contentLength: z.number()
        }
    },
    async ({ fileId }) => {
        const b2 = await getB2Client();
        const response = await b2.getFileInfo({ fileId });
        return formatResponse(response.data, 'File info retrieved');
    }
);

server.registerTool(
    'deleteFileVersion',
    {
        title: 'Delete File Version',
        description: 'Delete a specific version of a file',
        inputSchema: {
            fileId: z.string().describe('ID of the file version to delete'),
            fileName: z.string().describe('Name of the file')
        },
        outputSchema: {
            fileId: z.string(),
            fileName: z.string()
        }
    },
    async ({ fileId, fileName }) => {
        const b2 = await getB2Client();
        const response = await b2.deleteFileVersion({ fileId, fileName });
        return formatResponse(response.data, `File '${fileName}' deleted`);
    }
);

server.registerTool(
    'getDownloadAuthorization',
    {
        title: 'Get Download Authorization',
        description: 'Get an authorization token for downloading files from a private bucket',
        inputSchema: {
            bucketId: z.string().describe('Bucket ID'),
            fileNamePrefix: z.string().describe('File name prefix to authorize'),
            validDurationInSeconds: z.number().min(0).max(604800).describe('Token validity duration (0-604800 seconds)')
        },
        outputSchema: {
            authorizationToken: z.string()
        }
    },
    async ({ bucketId, fileNamePrefix, validDurationInSeconds }) => {
        const b2 = await getB2Client();
        const response = await b2.getDownloadAuthorization({
            bucketId,
            fileNamePrefix,
            validDurationInSeconds
        });
        return formatResponse(response.data, `Authorization token generated (valid for ${validDurationInSeconds}s)`);
    }
);

// LARGE FILE OPERATIONS TOOLS

server.registerTool(
    'startLargeFile',
    {
        title: 'Start Large File Upload',
        description: 'Start a large file upload session (for files > 100MB)',
        inputSchema: {
            bucketId: z.string().describe('Bucket ID to upload to'),
            fileName: z.string().describe('Name of the file')
        },
        outputSchema: {
            fileId: z.string(),
            fileName: z.string()
        }
    },
    async ({ bucketId, fileName }) => {
        const b2 = await getB2Client();
        const response = await b2.startLargeFile({ bucketId, fileName });
        return formatResponse(response.data, `Large file upload started for '${fileName}'`);
    }
);

server.registerTool(
    'getUploadPartUrl',
    {
        title: 'Get Upload Part URL',
        description: 'Get a URL for uploading a part of a large file',
        inputSchema: {
            fileId: z.string().describe('File ID from startLargeFile')
        },
        outputSchema: {
            uploadUrl: z.string(),
            authorizationToken: z.string()
        }
    },
    async ({ fileId }) => {
        const b2 = await getB2Client();
        const response = await b2.getUploadPartUrl({ fileId });
        return formatResponse(response.data, 'Upload part URL retrieved');
    }
);

server.registerTool(
    'uploadPart',
    {
        title: 'Upload File Part',
        description: 'Upload a part of a large file. Data should be base64-encoded.',
        inputSchema: {
            partNumber: z.number().min(1).max(10000).describe('Part number (1-10000)'),
            uploadUrl: z.string().describe('Upload URL from getUploadPartUrl'),
            uploadAuthToken: z.string().describe('Authorization token from getUploadPartUrl'),
            data: z.string().describe('Base64-encoded part data')
        },
        outputSchema: {
            partNumber: z.number(),
            contentLength: z.number(),
            contentSha1: z.string()
        }
    },
    async ({ partNumber, uploadUrl, uploadAuthToken, data }) => {
        const b2 = await getB2Client();
        const buffer = Buffer.from(data, 'base64');
        const response = await b2.uploadPart({
            partNumber,
            uploadUrl,
            uploadAuthToken,
            data: buffer
        });
        return formatResponse(response.data, `Part ${partNumber} uploaded`);
    }
);

server.registerTool(
    'listParts',
    {
        title: 'List File Parts',
        description: 'List uploaded parts of a large file',
        inputSchema: {
            fileId: z.string().describe('File ID from startLargeFile'),
            startPartNumber: z.number().optional().describe('Part number to start listing from'),
            maxPartCount: z.number().max(100).optional().describe('Maximum parts to return (max 100)')
        },
        outputSchema: {
            parts: z.array(z.object({
                partNumber: z.number(),
                contentLength: z.number()
            }))
        }
    },
    async ({ fileId, startPartNumber, maxPartCount }) => {
        const b2 = await getB2Client();
        const response = await b2.listParts({
            fileId,
            startPartNumber,
            maxPartCount
        });
        const parts = response.data.parts || [];
        return formatResponse(response.data, `Found ${parts.length} part(s)`);
    }
);

server.registerTool(
    'finishLargeFile',
    {
        title: 'Finish Large File Upload',
        description: 'Finish a large file upload and assemble all parts',
        inputSchema: {
            fileId: z.string().describe('File ID from startLargeFile'),
            partSha1Array: z.array(z.string()).describe('Array of SHA1 hashes for each part in order')
        },
        outputSchema: {
            fileId: z.string(),
            fileName: z.string(),
            contentLength: z.number()
        }
    },
    async ({ fileId, partSha1Array }) => {
        const b2 = await getB2Client();
        const response = await b2.finishLargeFile({ fileId, partSha1Array });
        return formatResponse(response.data, `Large file completed with ${partSha1Array.length} parts`);
    }
);

server.registerTool(
    'cancelLargeFile',
    {
        title: 'Cancel Large File Upload',
        description: 'Cancel a large file upload and discard all uploaded parts',
        inputSchema: {
            fileId: z.string().describe('File ID from startLargeFile')
        },
        outputSchema: {
            fileId: z.string(),
            fileName: z.string()
        }
    },
    async ({ fileId }) => {
        const b2 = await getB2Client();
        const response = await b2.cancelLargeFile({ fileId });
        return formatResponse(response.data, 'Large file upload cancelled');
    }
);

// KEY MANAGEMENT TOOLS

server.registerTool(
    'createKey',
    {
        title: 'Create Application Key',
        description: 'Create a new application key with specific capabilities',
        inputSchema: {
            capabilities: z.array(z.string()).describe('Array of capability strings'),
            keyName: z.string().describe('Name for the key'),
            validDurationInSeconds: z.number().optional().describe('Key validity duration'),
            bucketId: z.string().optional().describe('Restrict key to specific bucket'),
            namePrefix: z.string().optional().describe('Restrict key to files with this prefix')
        },
        outputSchema: {
            applicationKeyId: z.string(),
            applicationKey: z.string(),
            keyName: z.string()
        }
    },
    async ({ capabilities, keyName, validDurationInSeconds, bucketId, namePrefix }) => {
        const b2 = await getB2Client();
        const response = await b2.createKey({
            capabilities,
            keyName,
            validDurationInSeconds,
            bucketId,
            namePrefix
        });
        return formatResponse(response.data, `Key '${keyName}' created`);
    }
);

server.registerTool(
    'deleteKey',
    {
        title: 'Delete Application Key',
        description: 'Delete an application key',
        inputSchema: {
            applicationKeyId: z.string().describe('ID of the key to delete')
        },
        outputSchema: {
            applicationKeyId: z.string(),
            keyName: z.string()
        }
    },
    async ({ applicationKeyId }) => {
        const b2 = await getB2Client();
        const response = await b2.deleteKey({ applicationKeyId });
        return formatResponse(response.data, 'Key deleted');
    }
);

server.registerTool(
    'listKeys',
    {
        title: 'List Application Keys',
        description: 'List all application keys for the account',
        inputSchema: {
            maxKeyCount: z.number().optional().describe('Maximum number of keys to return'),
            startApplicationKeyId: z.string().optional().describe('Key ID to start listing from')
        },
        outputSchema: {
            keys: z.array(z.object({
                applicationKeyId: z.string(),
                keyName: z.string(),
                capabilities: z.array(z.string())
            }))
        }
    },
    async ({ maxKeyCount, startApplicationKeyId }) => {
        const b2 = await getB2Client();
        const response = await b2.listKeys({
            maxKeyCount: maxKeyCount || 100,
            startApplicationKeyId: startApplicationKeyId || ''
        });
        const keys = response.data.keys || [];
        return formatResponse(response.data, `Found ${keys.length} key(s)`);
    }
);

// SERVER INITIALIZATION

async function main() {
    // ensure there is the credentials
    const keyId = process.env.B2_APPLICATION_KEY_ID;
    const applicationKey = process.env.B2_APPLICATION_KEY;

    if (!keyId || !applicationKey) {
        console.error('Error: Missing required environment variables');
        console.error('Please set B2_APPLICATION_KEY_ID and B2_APPLICATION_KEY in your MCP configuration');
        process.exit(1);
    }

    console.log("Starting Backblaze B2 MCP Server...")
    console.log(`Key ID: ${keyId.substring(0, 8)}...`)

    try {
        await getB2Client();
        console.log('✓ B2 authorization successful');
        console.log("The tools are ready")
    } catch (error) {
        console.error('✗ B2 authorization failed:', error);
        process.exit(1);
    }

    const transport = new StdioServerTransport()
    await server.connect(transport)
}

main()