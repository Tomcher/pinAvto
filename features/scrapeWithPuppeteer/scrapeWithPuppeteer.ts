import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function scrapeWithPuppeteer() {
  // Launch a browser
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  // Log in using the form fields on the page
  await page.goto('https://b2b.pin-avto.ru/?page=11');
  await page.type('input[name="login"]', 'info@prodavec-zapchastei.ru');
  await page.type('input[name="password"]', '12345');
  await page.click('input[type="submit"]');

  // Wait for navigation after login
  await page.waitForNavigation();

  // Go to the page containing the links
  await page.goto('https://b2b.pin-avto.ru/?page=60');

  // Get all the download links
  const links = await page.$$eval('a', (anchors) => {
    return anchors
      .filter(anchor => anchor.href.includes('.xml'))
      .map(anchor => anchor.href);
  });

  // Filter to get only the selected files from the first attached image
  const selectedFiles = links.filter(link => 
    link.includes('OtherTyresVIP.xml') ||
    link.includes('SummerTyresVIP.xml') ||
    link.includes('TyresVIP.xml') ||
    link.includes('WinterSNGTyresVIP.xml') ||
    link.includes('WinterTyresVIP.xml')
  );

  console.log('Found selected download links:', selectedFiles);

  // Download each selected file and replace existing files in /downloads
  for (const fileUrl of selectedFiles) {
    let attempt = 0;
    const maxRetries = 3;
    let success = false;

    while (attempt < maxRetries && !success) {
      try {
        attempt++;
        console.log(`Attempt ${attempt}: Downloading file: ${fileUrl}`);
        const response = await axios.get(fileUrl, { responseType: 'stream' });

        // Extract the file name from the URL
        const fileName = path.basename(fileUrl);
        const filePath = path.join(__dirname, "..", "..", "downloads", fileName);

        // Save the file locally in the downloads directory
        await new Promise((resolve, reject) => {
          const writer = fs.createWriteStream(filePath);
          response.data.pipe(writer);

          writer.on('finish', resolve);
          writer.on('error', reject);
        });

        console.log('File successfully downloaded:', filePath);
        success = true;
      } catch (error) {
        console.error(`Attempt ${attempt} failed to download ${fileUrl}:`, error);
        if (attempt >= maxRetries) {
          console.error(`Failed to download ${fileUrl} after ${maxRetries} attempts.`);
        }
      }
    }
  }

  // Close the browser after all downloads are completed
  await browser.close();
}
