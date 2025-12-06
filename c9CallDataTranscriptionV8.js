#!/usr/bin/env node

import { v4 as uuidv4 } from 'uuid';
import moment from 'moment';
import axios from 'axios';
import CryptoJS from 'crypto-js';
import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import dotenv from 'dotenv';
dotenv.config();

// API credentials
const apiKey = process.env.SECRET_KEY;
const secretKey = process.env.API_KEY;

// Request configuration
const protocol = 'https';
const requestURI = 'calldataapi.xhoot.com:443';
const path_url = '/v2/calls/transcriptions';
const requestMethod = 'POST';
const contentType = 'application/json';
const DELIM = '\n';

// Generate filename with timestamp
const timestamp = moment().format('YYYYMMDD_HHmmss');
const rawResponseFileName = `transcription_response_${timestamp}.json`;
const zipFileName = `transcription_data_${timestamp}.zip`;

// Base request body
const baseRequestBody = {
  "beginDate": "2025-09-26 09:00:00",
  "endDate": "2025-09-26 23:00:00",
  "region": "SG"
}

/**
 * Generates the authentication digest for the API request
 * 
 * @param {string} requestTimeStamp - UTC timestamp for the request
 * @param {string} nonce - Unique identifier for the request
 * @param {Object} requestBody - Request payload
 * @returns {string} - The generated authentication digest
 */
function generateDigest(requestTimeStamp, nonce, requestBody) {
  try {
    // encode to HMAC SHA 512
    let hmac = CryptoJS.algo.HMAC.create(CryptoJS.algo.SHA512, secretKey);
    hmac.update(requestMethod);
    hmac.update(DELIM);
    hmac.update(protocol);
    hmac.update(DELIM);
    hmac.update(requestURI);
    hmac.update(DELIM);
    hmac.update(path_url);
    hmac.update(DELIM);
    hmac.update(contentType);
    hmac.update(DELIM);
    hmac.update(apiKey);
    hmac.update(DELIM);
    hmac.update(nonce);
    hmac.update(DELIM);
    hmac.update(requestTimeStamp);
    hmac.update(DELIM);
    
    const bodyJson = JSON.stringify(requestBody);
    hmac.update(bodyJson);
    hmac.update(DELIM);
    
    let signatureBytes = hmac.finalize();
    hmac.reset();
    signatureBytes = CryptoJS.enc.Base64.stringify(signatureBytes);
    
    return "HmacSHA512 " + apiKey + ":" + nonce + ":" + signatureBytes;
  } catch (error) {
    console.error("Error generating digest:", error);
    throw new Error(`Failed to generate authentication digest: ${error.message}`);
  }
}

/**
 * Makes API request with pagination token
 * 
 * @param {string} nextPageToken - Token for pagination
 * @returns {Promise<Object>} - Object containing response data and headers
 */
async function fetchTranscriptionData(nextPageToken) {
  // Create request body with current nextPageToken
  const requestBody = {
    ...baseRequestBody,
    nextPageToken: nextPageToken
  };
  
  const requestTimeStamp = new Date().toUTCString();
  const nonce = uuidv4();
  const digest = generateDigest(requestTimeStamp, nonce, requestBody);
  
  console.log("Digest generated for authentication");
  
  try {
    console.log("Sending API request to transcriptions endpoint...");
    const response = await axios.post(
      `${protocol}://${requestURI}${path_url}`,
      requestBody,
      {
        headers: {
          'Authorization': digest,
          'Content-Type': contentType,
          'Date': requestTimeStamp
        },
        responseType: 'arraybuffer'  // Handle binary response properly
      }
    );
    
    console.log(`API request successful with status: ${response.status}`);
    
    // Return both data and headers so we can access Next-Page-Token
    return {
      data: response.data,
      headers: response.headers,
      status: response.status
    };
  } catch (error) {
    console.error("API request failed:");
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error("Response headers:", error.response.headers);
      console.error("Response data:", error.response.data);
    } else if (error.request) {
      console.error("No response received:", error.request);
    } else {
      console.error("Error setting up request:", error.message);
    }
    throw new Error(`API request failed: ${error.message}`);
  }
}

/**
 * Save the ZIP data from API response to a ZIP file
 * 
 * @param {ArrayBuffer|Buffer|string} responseData - The API response containing ZIP data
 * @param {string} zipFileName - Name of ZIP file to save
 * @param {string} jsonFileName - Name of JSON file to save metadata
 * @returns {Promise<void>}
 */
async function saveResponseAsZip(responseData, zipFileName, jsonFileName) {
  try {
    // Convert response data to Buffer for file writing
    let zipContent;
    
    if (responseData instanceof ArrayBuffer) {
      // Convert ArrayBuffer to Buffer
      zipContent = Buffer.from(responseData);
    } else if (Buffer.isBuffer(responseData)) {
      // Already a Buffer
      zipContent = responseData;
    } else if (typeof responseData === 'string') {
      // If it's a string, convert it to Buffer
      zipContent = Buffer.from(responseData, 'binary');
    } else {
      throw new Error('Expected ZIP data as ArrayBuffer, Buffer, or string, got: ' + typeof responseData);
    }
    
    // Save the ZIP file
    await fs.writeFile(zipFileName, zipContent);
    console.log(`ZIP file saved to: ${zipFileName}`);
    
    // Save metadata as JSON
    const metadata = {
      zipFileName: zipFileName,
      zipSize: zipContent.length,
      createdAt: new Date().toISOString(),
      source: 'transcription_api'
    };
    
    await fs.writeFile(jsonFileName, JSON.stringify(metadata, null, 2));
    console.log(`Metadata saved to: ${jsonFileName}`);
    
  } catch (error) {
    console.error(`Error saving ZIP file ${zipFileName}:`, error);
    throw new Error(`Failed to save ZIP file: ${error.message}`);
  }
}

/**
 * Extract ZIP file to a temporary directory
 * 
 * @param {string} zipFilePath - Path to the ZIP file
 * @param {string} extractDir - Directory to extract to
 * @returns {Promise<void>}
 */
async function extractZipFile(zipFilePath, extractDir) {
  try {
    await fs.mkdir(extractDir, { recursive: true });
    execSync(`unzip -q "${zipFilePath}" -d "${extractDir}"`, { stdio: 'inherit' });
    console.log(`Extracted ${path.basename(zipFilePath)} to temp directory`);
  } catch (error) {
    console.error(`Error extracting ZIP file ${zipFilePath}:`, error.message);
    throw error;
  }
}

/**
 * Create a combined ZIP file from multiple directories
 * 
 * @param {Array} extractDirs - Array of directories to combine
 * @param {string} outputZipPath - Path for the output ZIP file
 * @returns {Promise<number>} - Number of files in the combined ZIP
 */
async function combineZipFiles(extractDirs, outputZipPath) {
  try {
    const combinedDir = path.join(path.dirname(outputZipPath), `temp_combined_${Date.now()}`);
    await fs.mkdir(combinedDir, { recursive: true });
    
    let totalFiles = 0;
    
    // Copy all files from each extract directory to the combined directory
    for (const extractDir of extractDirs) {
      try {
        const files = await fs.readdir(extractDir);
        for (const file of files) {
          if (file.endsWith('_chat.txt')) {
            const sourcePath = path.join(extractDir, file);
            const destPath = path.join(combinedDir, file);
            await fs.copyFile(sourcePath, destPath);
            totalFiles++;
          }
        }
      } catch (error) {
        console.warn(`Warning: Could not read directory ${extractDir}:`, error.message);
      }
    }
    
    // Create the combined ZIP file
    execSync(`cd "${combinedDir}" && zip -q "${path.resolve(outputZipPath)}" *.txt`, { stdio: 'inherit' });
    console.log(`Created combined ZIP file: ${outputZipPath} with ${totalFiles} files`);
    
    // Clean up combined directory
    await fs.rm(combinedDir, { recursive: true, force: true });
    
    return totalFiles;
  } catch (error) {
    console.error(`Error combining ZIP files:`, error.message);
    throw error;
  }
}

/**
 * Clean up temporary directories
 * 
 * @param {Array} directories - Array of directory paths to remove
 * @returns {Promise<void>}
 */
async function cleanupTempDirs(directories) {
  for (const dir of directories) {
    try {
      await fs.rm(dir, { recursive: true, force: true });
    } catch (error) {
      console.warn(`Warning: Could not clean up directory ${dir}:`, error.message);
    }
  }
  console.log(`Cleaned up ${directories.length} temporary directories`);
}

/**
 * Save the complete API response to a JSON file
 * 
 * @param {Object} responseData - The complete API response
 * @param {string} fileName - Name of file to save
 * @returns {Promise<void>}
 */
async function saveRawResponse(responseData, fileName) {
  try {
    await fs.writeFile(fileName, JSON.stringify(responseData, null, 2));
    console.log(`Raw API response saved to: ${fileName}`);
  } catch (error) {
    console.error(`Error saving raw response to ${fileName}:`, error);
    throw new Error(`Failed to save raw response: ${error.message}`);
  }
}

/**
 * Main function to execute the API request and save response
 */
async function main() {
  try {
    console.log(`Starting transcription API request process at ${moment().format('YYYY-MM-DD HH:mm:ss')}`);
    console.log(`ZIP files will be saved with prefix: transcription_data_${timestamp}`);
    console.log(`Raw response will be saved to: ${rawResponseFileName}`);
    
    let nextPageToken = "";
    let pageCount = 0;
    let allResponses = [];
    let savedZipFiles = [];
    
    do {
      pageCount++;
      console.log(`\n--- Processing page ${pageCount} ---`);
      console.log(`Processing page ${pageCount} with token: "${nextPageToken || 'none'}"`);
      
      // Fetch data from API
      const apiResponse = await fetchTranscriptionData(nextPageToken);
      const apiResponseData = apiResponse.data;
      const responseHeaders = apiResponse.headers;
      
      // Check if response contains ZIP data (ArrayBuffer or Buffer that starts with PK signature)
      let isZipData = false;
      if (apiResponseData instanceof ArrayBuffer) {
        // Check if ArrayBuffer starts with ZIP signature (PK - 0x50 0x4B)
        const uint8Array = new Uint8Array(apiResponseData);
        isZipData = uint8Array.length >= 2 && uint8Array[0] === 0x50 && uint8Array[1] === 0x4B;
      } else if (Buffer.isBuffer(apiResponseData)) {
        // Check if Buffer starts with ZIP signature (PK - 0x50 0x4B)
        isZipData = apiResponseData.length >= 2 && apiResponseData[0] === 0x50 && apiResponseData[1] === 0x4B;
      }
      
      if (isZipData) {
        // This looks like ZIP data - save it as a ZIP file
        const pageZipFileName = `transcription_data_${timestamp}_page${pageCount}.zip`;
        const pageMetadataFileName = `transcription_metadata_${timestamp}_page${pageCount}.json`;
        
        console.log(`Detected ZIP data in response, saving to ${pageZipFileName}`);
        await saveResponseAsZip(apiResponseData, pageZipFileName, pageMetadataFileName);
        savedZipFiles.push({
          page: pageCount,
          zipFile: pageZipFileName,
          metadataFile: pageMetadataFileName
        });
        
        // Store metadata instead of full ZIP content in allResponses
        allResponses.push({
          page: pageCount,
          token: nextPageToken,
          timestamp: new Date().toISOString(),
          zipFileName: pageZipFileName,
          dataSize: apiResponseData.length,
          hasZipData: true,
          responseHeaders: responseHeaders
        });
      } else {
        // Regular JSON response - store as is
        console.log(`Regular JSON response received`);
        allResponses.push({
          page: pageCount,
          token: nextPageToken,
          timestamp: new Date().toISOString(),
          response: apiResponseData,
          hasZipData: false,
          responseHeaders: responseHeaders
        });
      }
      
      // Check for next page token in response headers
      nextPageToken = responseHeaders['next-page-token'] || responseHeaders['Next-Page-Token'] || "";
      
      if (nextPageToken) {
        console.log(`Next page token found in headers: ${nextPageToken}`);
        console.log("Will continue to next page...");
      } else {
        console.log("No next page token found in headers. Pagination complete.");
      }
      
    } while (nextPageToken !== "");
    
    // Combine all ZIP files into a single ZIP file if we have multiple pages
    let finalZipFile = '';
    let totalFiles = 0;
    
    if (savedZipFiles.length > 0) {
      console.log(`\nCombining ${savedZipFiles.length} ZIP files into a single file...`);
      
      // Extract all ZIP files to temporary directories
      const extractDirs = [];
      for (let i = 0; i < savedZipFiles.length; i++) {
        const extractDir = path.join(process.cwd(), `temp_extract_${timestamp}_${i}`);
        await extractZipFile(savedZipFiles[i].zipFile, extractDir);
        extractDirs.push(extractDir);
      }
      
      // Create combined ZIP file
      finalZipFile = `transcription_data_${timestamp}.zip`;
      totalFiles = await combineZipFiles(extractDirs, finalZipFile);
      
      // Clean up temporary files
      await cleanupTempDirs(extractDirs);
      
      // Remove individual page ZIP files
      for (const zipFile of savedZipFiles) {
        try {
          await fs.unlink(zipFile.zipFile);
          await fs.unlink(zipFile.metadataFile);
        } catch (error) {
          console.warn(`Warning: Could not remove ${zipFile.zipFile}:`, error.message);
        }
      }
      
      // Rename final ZIP to include file count
      const finalZipWithCount = `transcription_data_${timestamp}_${totalFiles}files.zip`;
      await fs.rename(finalZipFile, finalZipWithCount);
      finalZipFile = finalZipWithCount;
      
      console.log(`\nCreated combined ZIP file: ${finalZipFile}`);
    }
    
    // Save summary response file
    const compiledResponse = {
      metadata: {
        totalPages: pageCount,
        fetchedAt: new Date().toISOString(),
        requestBody: baseRequestBody,
        totalFiles: totalFiles,
        finalZipFile: finalZipFile
      },
      pages: allResponses
    };
    
    await saveRawResponse(compiledResponse, rawResponseFileName);
    
    console.log(`\nAPI data collection complete. Processed ${pageCount} pages.`);
    if (finalZipFile) {
      console.log(`Final ZIP file: ${finalZipFile} (${totalFiles} transcription files)`);
    }
    console.log(`Summary data saved to: ${rawResponseFileName}`);
    console.log("\nNext step: Use convertZipToJson.js to process the ZIP file.");
    
  } catch (error) {
    console.error("Error in main process:", error.message);
    process.exit(1);
  }
}

// Execute the main function
main().catch(error => {
  console.error("Script execution failed:", error);
  process.exit(1);
});