#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import moment from 'moment';
import { execSync } from 'child_process';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Parse a single chat file and extract the transcription data
 * 
 * @param {string} filePath - Path to the chat file
 * @returns {Promise<Object>} - Parsed transcription data with metadata
 */
async function parseTranscriptionFile(filePath) {
  try {
    const fileContent = await fs.readFile(filePath, 'utf8');
    const fileName = path.basename(filePath);
    
    // Try to parse as pure JSON first (new format)
    let transcriptionData;
    let prefix = '';
    
    try {
      transcriptionData = JSON.parse(fileContent);
      // New format - pure JSON, no prefix
    } catch (jsonError) {
      // Try old format with | separator
      const parts = fileContent.split('|');
      
      if (parts.length < 2) {
        console.warn(`Warning: File ${fileName} does not contain expected format (no | separator)`);
        return null;
      }
      
      prefix = parts[0].trim();
      const jsonString = parts.slice(1).join('|'); // Rejoin in case there are multiple | characters
      
      try {
        transcriptionData = JSON.parse(jsonString);
      } catch (secondJsonError) {
        console.error(`Error parsing JSON in file ${fileName}:`, secondJsonError.message);
        return null;
      }
    }
    
    // Extract metadata from filename
    const fileNameParts = fileName.replace('.txt', '').split('-');
    let callId = '', speakerName = '', timestamp = '', sessionId = '';
    
    // Parse filename structure: sPK-XXXX-HASH-SPEAKER-TIMESTAMP-SESSION_chat.txt
    if (fileNameParts.length >= 5) {
      callId = fileNameParts.slice(0, 3).join('-'); // sPK-XXXX-HASH
      speakerName = fileNameParts[3];
      timestamp = fileNameParts[4];
      sessionId = fileNameParts[5] ? fileNameParts[5].replace('_chat', '') : '1';
    }
    
    // Create the compiled record
    const compiledRecord = {
      fileName: fileName,
      callId: callId,
      speakerName: speakerName,
      timestamp: timestamp,
      sessionId: sessionId,
      prefix: prefix,
      transcriptionData: transcriptionData,
      metadata: {
        chatLinesCount: transcriptionData.chatLines ? transcriptionData.chatLines.length : 0,
        confidence: transcriptionData.confidence || 0,
        audioFileName: transcriptionData.audioFileName || '',
        processedAt: new Date().toISOString(),
        source: 'zip_file'
      }
    };
    
    return compiledRecord;
    
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Extract ZIP file to a temporary directory
 * 
 * @param {string} zipFilePath - Path to the ZIP file
 * @returns {Promise<string>} - Path to the temporary extraction directory
 */
async function extractZipFile(zipFilePath) {
  try {
    const zipName = path.basename(zipFilePath, '.zip');
    const extractDir = path.join(__dirname, `temp_${zipName}_${Date.now()}`);
    
    // Create extraction directory
    await fs.mkdir(extractDir, { recursive: true });
    
    // Extract the ZIP file using unzip command
    console.log(`Extracting ${zipFilePath} to ${extractDir}...`);
    execSync(`unzip -q "${zipFilePath}" -d "${extractDir}"`, { stdio: 'inherit' });
    
    console.log(`ZIP file extracted to: ${extractDir}`);
    return extractDir;
  } catch (error) {
    console.error(`Error extracting ZIP file ${zipFilePath}:`, error.message);
    throw error;
  }
}

/**
 * Get all chat files in a directory
 * 
 * @param {string} dirPath - Directory path to search
 * @returns {Promise<Array>} - Array of chat file paths
 */
async function getChatFiles(dirPath) {
  try {
    const files = await fs.readdir(dirPath);
    const chatFiles = files.filter(file => file.endsWith('_chat.txt'));
    return chatFiles.map(file => path.join(dirPath, file));
  } catch (error) {
    console.error(`Error reading directory ${dirPath}:`, error.message);
    throw error;
  }
}

/**
 * Clean up temporary directory
 * 
 * @param {string} dirPath - Directory path to remove
 * @returns {Promise<void>}
 */
async function cleanupTempDir(dirPath) {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
    console.log(`Cleaned up temporary directory: ${dirPath}`);
  } catch (error) {
    console.warn(`Warning: Could not clean up temporary directory ${dirPath}:`, error.message);
  }
}

/**
 * Initialize the output JSON file
 * 
 * @param {string} fileName - Name of the output file
 * @returns {Promise<void>}
 */
async function initializeOutputFile(fileName) {
  try {
    const initialStructure = {
      metadata: {
        createdAt: new Date().toISOString(),
        totalFiles: 0,
        totalTranscriptions: 0,
        version: '1.0'
      },
      transcriptions: []
    };
    
    await fs.writeFile(fileName, JSON.stringify(initialStructure, null, 2));
    console.log(`Output file initialized: ${fileName}`);
  } catch (error) {
    console.error(`Error initializing output file ${fileName}:`, error);
    throw error;
  }
}

/**
 * Add transcription records to the output file
 * 
 * @param {Array} transcriptions - Array of transcription records
 * @param {string} fileName - Name of the output file
 * @returns {Promise<void>}
 */
async function addTranscriptionsToFile(transcriptions, fileName) {
  try {
    // Read current file content
    const fileContent = await fs.readFile(fileName, 'utf8');
    const jsonData = JSON.parse(fileContent);
    
    // Add new transcriptions
    jsonData.transcriptions = [...jsonData.transcriptions, ...transcriptions];
    
    // Update metadata
    jsonData.metadata.totalFiles = jsonData.transcriptions.length;
    jsonData.metadata.totalTranscriptions = jsonData.transcriptions.reduce((sum, t) => sum + t.metadata.chatLinesCount, 0);
    jsonData.metadata.lastUpdated = new Date().toISOString();
    
    // Write back to file
    await fs.writeFile(fileName, JSON.stringify(jsonData, null, 2));
    
    console.log(`Added ${transcriptions.length} transcription records to ${fileName}`);
  } catch (error) {
    console.error(`Error adding transcriptions to file ${fileName}:`, error);
    throw error;
  }
}

/**
 * Generate summary statistics
 * 
 * @param {Array} transcriptions - Array of transcription records
 * @returns {Object} - Summary statistics
 */
function generateSummary(transcriptions) {
  const summary = {
    totalFiles: transcriptions.length,
    totalChatLines: 0,
    speakers: new Set(),
    callIds: new Set(),
    dateRange: {
      earliest: null,
      latest: null
    },
    averageConfidence: 0,
    totalConfidenceSum: 0,
    confidenceCount: 0
  };
  
  transcriptions.forEach(t => {
    summary.totalChatLines += t.metadata.chatLinesCount;
    summary.speakers.add(t.speakerName);
    summary.callIds.add(t.callId);
    
    if (t.transcriptionData.confidence !== undefined) {
      summary.totalConfidenceSum += t.transcriptionData.confidence;
      summary.confidenceCount++;
    }
    
    // Extract dates from chat lines
    if (t.transcriptionData.chatLines) {
      t.transcriptionData.chatLines.forEach(line => {
        if (line.startsAt) {
          const date = new Date(line.startsAt);
          if (!summary.dateRange.earliest || date < summary.dateRange.earliest) {
            summary.dateRange.earliest = date;
          }
          if (!summary.dateRange.latest || date > summary.dateRange.latest) {
            summary.dateRange.latest = date;
          }
        }
      });
    }
  });
  
  summary.speakers = Array.from(summary.speakers);
  summary.callIds = Array.from(summary.callIds);
  summary.averageConfidence = summary.confidenceCount > 0 ? summary.totalConfidenceSum / summary.confidenceCount : 0;
  
  return summary;
}

/**
 * Main processing function
 */
async function main() {
  try {
    // Get ZIP file path from command line arguments
    const zipFilePath = process.argv[2];
    
    if (!zipFilePath) {
      console.error('Usage: node parseTranscriptionZip.js <path-to-zip-file>');
      console.error('Example: node parseTranscriptionZip.js ./transcriptions.zip');
      process.exit(1);
    }
    
    // Check if ZIP file exists
    try {
      await fs.access(zipFilePath);
    } catch (error) {
      console.error(`ZIP file not found: ${zipFilePath}`);
      process.exit(1);
    }
    
    console.log(`Starting transcription ZIP processing at ${moment().format('YYYY-MM-DD HH:mm:ss')}`);
    console.log(`Processing ZIP file: ${zipFilePath}`);
    
    // Generate output filename
    const timestamp = moment().format('YYYYMMDD_HHmmss');
    const zipBaseName = path.basename(zipFilePath, '.zip');
    const outputFileName = `parsed_${zipBaseName}_${timestamp}.json`;
    
    console.log(`Output will be saved to: ${outputFileName}`);
    
    // Initialize output file
    await initializeOutputFile(outputFileName);
    
    // Extract ZIP file
    const tempDir = await extractZipFile(zipFilePath);
    
    try {
      // Get all chat files from the extracted directory
      const chatFiles = await getChatFiles(tempDir);
      console.log(`Found ${chatFiles.length} chat files to process`);
      
      if (chatFiles.length === 0) {
        console.log('No chat files found in the ZIP file');
        return;
      }
      
      // Process files in batches to avoid memory issues
      const batchSize = 10;
      let processedCount = 0;
      let successCount = 0;
      const allTranscriptions = [];
      
      for (let i = 0; i < chatFiles.length; i += batchSize) {
        const batch = chatFiles.slice(i, i + batchSize);
        console.log(`\nProcessing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(chatFiles.length / batchSize)}...`);
        
        const batchResults = await Promise.allSettled(
          batch.map(filePath => parseTranscriptionFile(filePath))
        );
        
        const batchTranscriptions = [];
        batchResults.forEach((result, index) => {
          processedCount++;
          if (result.status === 'fulfilled' && result.value !== null) {
            batchTranscriptions.push(result.value);
            allTranscriptions.push(result.value);
            successCount++;
          } else {
            console.error(`Failed to process ${batch[index]}: ${result.reason || 'Unknown error'}`);
          }
        });
        
        // Add batch to file
        if (batchTranscriptions.length > 0) {
          await addTranscriptionsToFile(batchTranscriptions, outputFileName);
        }
        
        console.log(`Batch completed: ${batchTranscriptions.length}/${batch.length} files processed successfully`);
      }
      
      // Generate and display summary
      const summary = generateSummary(allTranscriptions);
      console.log('\n=== PROCESSING SUMMARY ===');
      console.log(`Total files processed: ${processedCount}`);
      console.log(`Successfully processed: ${successCount}`);
      console.log(`Failed: ${processedCount - successCount}`);
      console.log(`Total chat lines: ${summary.totalChatLines}`);
      console.log(`Unique speakers: ${summary.speakers.join(', ')}`);
      console.log(`Unique call IDs: ${summary.callIds.length}`);
      console.log(`Average confidence: ${summary.averageConfidence.toFixed(4)}`);
      
      if (summary.dateRange.earliest && summary.dateRange.latest) {
        console.log(`Date range: ${summary.dateRange.earliest.toISOString()} to ${summary.dateRange.latest.toISOString()}`);
      }
      
      console.log(`\nOutput file: ${outputFileName}`);
      console.log('Processing complete!');
      
    } finally {
      // Clean up temporary directory
      await cleanupTempDir(tempDir);
    }
    
  } catch (error) {
    console.error('Error in main processing:', error.message);
    process.exit(1);
  }
}

// Execute the main function
main().catch(error => {
  console.error('Script execution failed:', error);
  process.exit(1);
});