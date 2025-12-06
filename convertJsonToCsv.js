// convert.js
const csvjson = require('csvjson');
const fs = require('fs');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
    console.error('Usage: node convertJsonToCsv.js <input.json> [output.csv]');
    console.error('  input.json  - Required: JSON file to convert');
    console.error('  output.csv  - Optional: Output CSV filename (defaults to input filename with .csv extension)');
    process.exit(1);
}

const jsonFilename = args[0];
let csvFilename;

if (args.length >= 2) {
    // Use provided output filename
    csvFilename = args[1];
} else {
    // Generate output filename by changing extension to .csv
    const parsedPath = path.parse(jsonFilename);
    csvFilename = path.join(parsedPath.dir, parsedPath.name + '.csv');
}

// Validate input file exists
if (!fs.existsSync(jsonFilename)) {
    console.error(`Error: Input file '${jsonFilename}' does not exist.`);
    process.exit(1);
}

console.log(`Converting: ${jsonFilename} → ${csvFilename}`);

// Define the desired column order - priority columns first, then the rest
const priorityColumns = [
    'speakerName',
    'speakerDisplayName', 
    'startsAt',
    'endsAt',
    'text'
];

// Function to flatten JSON data into CSV rows
function flattenJsonData(data) {
    const rows = [];
    const metadata = data.metadata;
    
    data.transcriptions.forEach(transcription => {
        transcription.transcriptionData.chatLines.forEach(chatLine => {
            const row = {
                // Metadata fields
                createdAt: metadata.createdAt,
                totalFiles: metadata.totalFiles,
                totalTranscriptions: metadata.totalTranscriptions,
                version: metadata.version,
                lastUpdated: metadata.lastUpdated,
                
                // Transcription fields
                fileName: transcription.fileName,
                callId: transcription.callId,
                speakerName: transcription.speakerName,
                timestamp: transcription.timestamp,
                sessionId: transcription.sessionId,
                prefix: transcription.prefix,
                
                // Chat line fields
                channel: chatLine.channel,
                text: chatLine.text,
                startsAt: chatLine.startsAt,
                startOffSet: chatLine.startOffSet,
                endsAt: chatLine.endsAt,
                endOffSet: chatLine.endOffSet,
                textConfidence: chatLine.textConfidence,
                speakerId: chatLine.speakerId,
                speakerDisplayName: chatLine.speakerDisplayName,
                
                // Transcription data fields
                confidence: transcription.transcriptionData.confidence,
                audioFileName: transcription.transcriptionData.audioFileName,
                
                // Metadata fields
                chatLinesCount: transcription.metadata.chatLinesCount,
                processedAt: transcription.metadata.processedAt,
                source: transcription.metadata.source
            };
            rows.push(row);
        });
        
        // If no chat lines, still create a row with transcription data
        if (transcription.transcriptionData.chatLines.length === 0) {
            const row = {
                // Metadata fields
                createdAt: metadata.createdAt,
                totalFiles: metadata.totalFiles,
                totalTranscriptions: metadata.totalTranscriptions,
                version: metadata.version,
                lastUpdated: metadata.lastUpdated,
                
                // Transcription fields
                fileName: transcription.fileName,
                callId: transcription.callId,
                speakerName: transcription.speakerName,
                timestamp: transcription.timestamp,
                sessionId: transcription.sessionId,
                prefix: transcription.prefix,
                
                // Empty chat line fields
                channel: '',
                text: '',
                startsAt: '',
                startOffSet: '',
                endsAt: '',
                endOffSet: '',
                textConfidence: '',
                speakerId: '',
                speakerDisplayName: '',
                
                // Transcription data fields
                confidence: transcription.transcriptionData.confidence,
                audioFileName: transcription.transcriptionData.audioFileName,
                
                // Metadata fields
                chatLinesCount: transcription.metadata.chatLinesCount,
                processedAt: transcription.metadata.processedAt,
                source: transcription.metadata.source
            };
            rows.push(row);
        }
    });
    
    return rows;
}

// Read JSON data from file
fs.readFile(jsonFilename, 'utf-8', (err, fileContent) => {
    if (err) {
        console.error(err);
        return;
    }

    try {
        // Parse the JSON data
        const jsonData = JSON.parse(fileContent);
        
        // Flatten the nested JSON into rows
        const flattenedData = flattenJsonData(jsonData);
        
        // Get all unique column names from the flattened data
        const allColumns = new Set();
        flattenedData.forEach(row => {
            Object.keys(row).forEach(key => allColumns.add(key));
        });
        
        // Create ordered column list: priority columns first, then remaining columns
        const remainingColumns = [...allColumns].filter(col => !priorityColumns.includes(col));
        const orderedColumns = [...priorityColumns, ...remainingColumns];
        
        // Convert JSON to CSV with specified column order
        const csvData = csvjson.toCSV(flattenedData, {
            headers: 'key'
        });
        
        // Parse the CSV to reorder columns
        const lines = csvData.split('\n');
        if (lines.length > 0) {
            const headerLine = lines[0];
            const headers = headerLine.split(',');
            
            // Create mapping of original headers to new order
            const reorderedHeaders = [...priorityColumns.filter(col => headers.includes(col))];
            const otherHeaders = headers.filter(col => !priorityColumns.includes(col));
            const finalHeaders = [...reorderedHeaders, ...otherHeaders];
            
            // Create index mapping for reordering
            const indexMap = finalHeaders.map(header => headers.indexOf(header));
            
            // Reorder all lines
            const reorderedLines = lines.map(line => {
                if (line.trim() === '') return line;
                const columns = line.split(',');
                const reorderedColumns = indexMap.map(index => columns[index] || '');
                return reorderedColumns.join(',');
            });
            
            const finalCsvData = reorderedLines.join('\n');
            
            // Write CSV data to file
            fs.writeFile(csvFilename, finalCsvData, 'utf-8', (err) => {
                if (err) {
                    console.error(err);
                    return;
                }
                console.log('Conversion successful. CSV file created with reordered columns.');
                console.log(`Priority columns (${priorityColumns.join(', ')}) moved to the beginning.`);
                console.log(`Total rows created: ${flattenedData.length}`);
                console.log(`Final column order: ${finalHeaders.join(', ')}`);
            });
        }
        
    } catch (parseErr) {
        console.error('Error parsing JSON:', parseErr);
    }
});
