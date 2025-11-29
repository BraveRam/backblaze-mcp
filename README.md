# Backblaze B2 MCP Server

[![npm version](https://badge.fury.io/js/backblaze-mcp.svg)](https://www.npmjs.com/package/backblaze-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that provides seamless integration with Backblaze B2 cloud storage. Built as a wrapper around the [backblaze-b2](https://www.npmjs.com/package/backblaze-b2) npm package, this server enables MCP clients like Claude Desktop, VS Code, and Cursor to interact with your B2 buckets and files.

## Features

- **Bucket Management** - Create, delete, list, and update buckets
- **File Operations** - Upload, list, hide, and delete files
- **Large File Support** - Multipart uploads for files >100MB
- **Key Management** - Manage application keys and permissions
- **Simple Setup** - Just configure your B2 credentials in MCP config

## Configuration

### Get B2 Credentials

1. Sign up at [Backblaze B2](https://www.backblaze.com/b2/sign-up.html)
2. Go to **App Keys** in your account
3. Create a new application key
4. Copy the **keyID** and **applicationKey**

### MCP Client Setup

Add this configuration to your MCP client:

**Claude Desktop** (`~/Library/Application Support/Claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "backblaze-b2": {
      "command": "npx",
      "args": ["backblaze-mcp"],
      "env": {
        "B2_APPLICATION_KEY_ID": "your_key_id_here",
        "B2_APPLICATION_KEY": "your_application_key_here"
      }
    }
  }
}
```

**VS Code/Cursor** (`.vscode/mcp.json`):

```json
{
  "servers": {
    "backblaze-b2": {
      "command": "npx",
      "args": ["backblaze-mcp"],
      "env": {
        "B2_APPLICATION_KEY_ID": "your_key_id_here",
        "B2_APPLICATION_KEY": "your_application_key_here"
      }
    }
  }
}
```

## Available Tools

### Bucket Management (5 tools)

- `createBucket` - Create a new bucket
- `deleteBucket` - Delete a bucket
- `listBuckets` - List all buckets
- `getBucket` - Get bucket info
- `updateBucket` - Change bucket type (public/private)

### File Operations (7 tools)

- `getUploadUrl` - Get upload URL
- `uploadFile` - Upload a file (base64-encoded)
- `listFileNames` - List files in a bucket
- `listFileVersions` - List all file versions
- `hideFile` - Hide a file from listings
- `getFileInfo` - Get file metadata
- `deleteFileVersion` - Delete a file version
- `getDownloadAuthorization` - Get download auth token

### Large File Operations (5 tools)

For files >100MB:

- `startLargeFile` - Start large file upload
- `getUploadPartUrl` - Get part upload URL
- `uploadPart` - Upload a file part
- `listParts` - List uploaded parts
- `finishLargeFile` - Complete the upload
- `cancelLargeFile` - Cancel the upload

### Key Management (3 tools)

- `createKey` - Create application keys
- `deleteKey` - Delete a key
- `listKeys` - List all keys

## Usage Examples

### Upload a File

```
1. Call getUploadUrl with your bucketId
2. Encode your file to base64
3. Call uploadFile with the URL, token, filename, and base64 data
```

### Large File Upload

```
1. Call startLargeFile to get a fileId
2. Split file into parts and upload each with uploadPart
3. Call finishLargeFile with SHA1 hashes of all parts
```

## Development

### Build from Source

```bash
git clone https://github.com/braveram/backblaze-mcp.git
cd backblaze-mcp
npm install
npm run build
```

## Binary Data

File uploads use base64 encoding:

- Encode your file to base64 before calling `uploadFile` or `uploadPart`
- The server handles the conversion to binary for B2

## Troubleshooting

**Server won't start**
- Check that `B2_APPLICATION_KEY_ID` and `B2_APPLICATION_KEY` are set in your MCP config
- Verify credentials are valid in the B2 console

**Upload fails**
- Ensure data is properly base64-encoded
- Check bucket permissions
- Use large file operations for files >100MB

## Built With

- [backblaze-b2](https://www.npmjs.com/package/backblaze-b2) - Official Backblaze B2 client
- [@modelcontextprotocol/sdk](https://www.npmjs.com/package/@modelcontextprotocol/sdk) - MCP SDK

## License

MIT