// Import Node.js built-in modules
import fetch from 'node-fetch'; // Install using `npm install node-fetch`. For Node.js versions >=18, fetch is available natively.
import { parse } from 'node-html-parser'; // A lightweight library to parse XML/HTML in Node.js. Install using `npm install node-html-parser`.

// Function to download and parse XML using fetch
async function downloadAndParseXML(): Promise<void> {
  try {
    // Step 1: Fetch the XML file from a given URL using fetch
    const url = 'https://b2b.pin-avto.ru/public/prices/OtherTyresVIP.xml';
    const response = await fetch(url);

    // Check if the response is OK
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    // Step 2: Get the XML as text
    const xmlText: string = await response.text();
    
    // Step 3: Parse the XML text into an XML Document using node-html-parser
    const xmlDoc = parse(xmlText);
    
    // Log the parsed XML Document to the console
    console.log(xmlDoc.toString());

  } catch (error) {
    console.error("Error while fetching or parsing the XML:", error);
  }
}

// Call the function to execute it
downloadAndParseXML();
