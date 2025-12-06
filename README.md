# C9 Transcription Extractor

A Node.js toolkit for extracting and processing voice call transcription data from the Symphony Communication Cloud9 Markets Voice SaaS platform via its RESTful API.

## Overview

This toolkit provides a complete workflow for:
1. Requesting transcription files from the Cloud9 API for specified date ranges
2. Handling paginated API responses and combining multi-page results
3. Extracting transcription files from the raw archive data
4. Converting JSON transcription objects into a consolidated CSV file for ease of analysis

## Prerequisites

### Platform Requirements
- **Active API Subscription**: Valid subscription to Symphony Communication Cloud9 Markets Voice platform
- **API Credentials**: Valid API Key and Secret Key
- **IP Whitelisting**: Your API client's public IP address(es) must be whitelisted on the platform

### System Requirements
- **Node.js**: Version 14.x or higher
- **Operating System**: macOS, Linux, or Windows with Unix-like shell (for `unzip` and `zip` commands)
- **System Tools**: `unzip` and `zip` utilities must be available in PATH

## Installation

1. Clone the repository:
```bash
git clone https://github.com/GitanuGreeves/c9-transcription-extractor.git
cd c9-transcription-extractor
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` and add your credentials:
```env
SECRET_KEY="your-secret-key-here"
API_KEY="your-api-key-here"
```

**Important**: Never commit the `.env` file to version control. It's already included in `.gitignore`.

## Usage

### Step 1: Fetch Transcription Data from API

The main script fetches transcription data from the Cloud9 API and handles pagination automatically.

```bash
node c9CallDataTranscriptionV8.js
```

**Configuration**:
Edit the `baseRequestBody` object in `c9CallDataTranscriptionV8.js` to specify your query parameters:

```javascript
const baseRequestBody = {
  "beginDate": "2025-09-26 09:00:00",  // Start date/time
  "endDate": "2025-09-26 23:00:00",    // End date/time
  "region": "SG"                        // Region code
}
```

**Output**:
- `transcription_data_YYYYMMDD_HHmmss_NNfiles.zip` - Combined ZIP file containing all transcription files
- `transcription_response_YYYYMMDD_HHmmss.json` - API response metadata and summary

**Features**:
- ✅ Automatic pagination handling for large result sets
- ✅ HMAC SHA-512 authentication with proper digest generation
- ✅ Multi-page result combination into single ZIP file
- ✅ Temporary file cleanup after processing
- ✅ Detailed logging and error handling

### Step 2: Extract ZIP to JSON

Parse the ZIP archive and extract individual transcription files into a structured JSON format.

```bash
node zip2Json.js <path-to-zip-file>
```

**Example**:
```bash
node zip2Json.js transcription_data_20250926_143022_150files.zip
```

**Output**:
- `parsed_transcription_data_YYYYMMDD_HHmmss_YYYYMMDD_HHmmss.json` - Structured JSON containing all transcription data

**Features**:
- ✅ Batch processing to avoid memory issues
- ✅ Filename parsing to extract metadata (call ID, speaker, timestamp, session)
- ✅ Support for both old (pipe-delimited) and new (pure JSON) file formats
- ✅ Progress tracking and detailed summary statistics
- ✅ Automatic temporary directory cleanup

**JSON Structure**:
```json
{
  "metadata": {
    "createdAt": "2025-09-27T13:22:00.000Z",
    "totalFiles": 150,
    "totalTranscriptions": 5432,
    "version": "1.0",
    "lastUpdated": "2025-09-27T13:25:00.000Z"
  },
  "transcriptions": [
    {
      "fileName": "sPK-1234-HASH-Speaker-20250926-1_chat.txt",
      "callId": "sPK-1234-HASH",
      "speakerName": "Speaker",
      "timestamp": "20250926",
      "sessionId": "1",
      "transcriptionData": {
        "chatLines": [...],
        "confidence": 0.95,
        "audioFileName": "..."
      },
      "metadata": {
        "chatLinesCount": 42,
        "processedAt": "2025-09-27T13:22:30.000Z",
        "source": "zip_file"
      }
    }
  ]
}
```

### Step 3: Convert JSON to CSV

Convert the structured JSON output to CSV format for analysis in spreadsheet applications or data tools.

```bash
node convertJsonToCsv.js <input.json> [output.csv]
```

**Examples**:
```bash
# Auto-generate output filename
node convertJsonToCsv.js parsed_transcription_data_20250926_143022.json

# Specify output filename
node convertJsonToCsv.js parsed_transcription_data_20250926_143022.json transcriptions.csv
```

**Output**:
- CSV file with flattened transcription data, one row per chat line

**Features**:
- ✅ Priority column ordering (speakerName, speakerDisplayName, startsAt, endsAt, text)
- ✅ Automatic output filename generation
- ✅ Handles nested JSON structure
- ✅ Preserves all metadata fields

**CSV Columns** (Priority order):
1. `speakerName` - Speaker identifier
2. `speakerDisplayName` - Display name of speaker
3. `startsAt` - Timestamp when utterance begins
4. `endsAt` - Timestamp when utterance ends
5. `text` - Transcribed text content
6. Additional metadata columns (timestamps, confidence scores, file info, etc.)

## API Authentication

The toolkit uses HMAC SHA-512 authentication with the following components:
- Request method (POST)
- Protocol (HTTPS)
- Request URI
- Content type
- API Key
- Nonce (UUID v4)
- Request timestamp (UTC)
- Request body (JSON)

Authentication digest format:
```
HmacSHA512 {apiKey}:{nonce}:{base64Signature}
```

## Project Structure

```
c9-transcription-extractor/
├── c9CallDataTranscriptionV8.js  # Main API client script
├── zip2Json.js                   # ZIP extraction and JSON conversion
├── convertJsonToCsv.js           # JSON to CSV converter
├── package.json                  # Node.js dependencies
├── .env                          # Environment variables (not in repo)
├── .gitignore                    # Git ignore rules
└── README.md                     # This file
```

## Dependencies

- **axios** (^1.12.2) - HTTP client for API requests
- **crypto-js** (^4.2.0) - HMAC SHA-512 authentication
- **dotenv** (^17.2.2) - Environment variable management
- **moment** (^2.30.1) - Date/time formatting
- **uuid** (^13.0.0) - Nonce generation for authentication
- **csvjson** - CSV/JSON conversion (convertJsonToCsv.js only)

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SECRET_KEY` | Your Cloud9 API Secret Key | Yes |
| `API_KEY` | Your Cloud9 API Key (base64 encoded JWT) | Yes |

## Error Handling

The toolkit includes comprehensive error handling:
- API authentication failures
- Network timeouts and connectivity issues
- Invalid response formats
- File system errors
- Malformed ZIP archives
- JSON parsing errors

All errors are logged with detailed context for troubleshooting.

## Workflow Example

Complete end-to-end workflow:

```bash
# 1. Fetch transcriptions from API (edit date range in script first)
node c9CallDataTranscriptionV8.js
# Output: transcription_data_20250926_143022_150files.zip

# 2. Extract and parse ZIP file
node zip2Json.js transcription_data_20250926_143022_150files.zip
# Output: parsed_transcription_data_20250926_143022_20250926_145030.json

# 3. Convert to CSV
node convertJsonToCsv.js parsed_transcription_data_20250926_143022_20250926_145030.json
# Output: parsed_transcription_data_20250926_143022_20250926_145030.csv
```

## Troubleshooting

### API Request Fails with 401 Unauthorized
- Verify your `API_KEY` and `SECRET_KEY` in `.env` are correct
- Ensure your IP address is whitelisted on the Cloud9 platform
- Check that your API subscription is active

### API Request Fails with 403 Forbidden
- Verify your IP address is in the platform's whitelist
- Contact Cloud9 support to confirm API access permissions

### "unzip command not found" Error
- Install `unzip` utility:
  - macOS: `brew install unzip` (if not already installed)
  - Linux: `sudo apt-get install unzip` or `sudo yum install unzip`
  - Windows: Install Git Bash or WSL

### Out of Memory Errors
- The `zip2Json.js` script processes files in batches of 10
- For extremely large datasets, you may need to increase Node.js memory:
  ```bash
  node --max-old-space-size=4096 zip2Json.js <zip-file>
  ```

## API Endpoint

**Base URL**: `https://calldataapi.xhoot.com:443`

**Endpoint**: `/v2/calls/transcriptions`

**Method**: `POST`

**Headers**:
- `Authorization`: HMAC SHA-512 digest
- `Content-Type`: application/json
- `Date`: UTC timestamp

**Pagination**:
The API returns a `Next-Page-Token` header when more results are available. The script automatically handles pagination.

## Security Considerations

- ⚠️ **Never commit** `.env` file or expose API credentials
- ⚠️ Store credentials securely using environment variables
- ⚠️ Restrict file permissions on `.env`: `chmod 600 .env`
- ⚠️ Rotate API keys periodically per your security policy
- ⚠️ Use HTTPS for all API requests (enforced by default)

## License

ISC

## Repository

- **GitHub**: https://github.com/GitanuGreeves/c9-transcription-extractor
- **Issues**: https://github.com/GitanuGreeves/c9-transcription-extractor/issues

## Support

For platform-specific issues or API access:
- Contact Symphony Communication Cloud9 Markets Voice support
- Verify API subscription status and IP whitelist configuration

For toolkit issues:
- Submit an issue on the GitHub repository
- Include error logs and anonymized examples when reporting bugs

## Version History

- **v1.0.0** - Initial release
  - API client with pagination support
  - ZIP extraction and JSON conversion
  - CSV export functionality

---

**Note**: This toolkit is designed for the Symphony Communication Cloud9 Markets Voice platform. Ensure you have proper authorization and comply with all applicable terms of service and data handling requirements.
