import * as fs from "node:fs/promises";
import * as path from "path";
import axios from "axios";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function scrapeWithPuppeteer(links: string[]) {
  console.log("Found selected download links:", links);

  // Download each selected file and replace existing files in /downloads
  for (const fileUrl of links) {
    let attempt = 0;
    const maxRetries = 3;
    let success = false;

    while (attempt < maxRetries && !success) {
      try {
        attempt++;
        console.log(`Attempt ${attempt}: Downloading file: ${fileUrl}`);
        const response = await axios.get(
          `https://b2b.pin-avto.ru/public/prices/${fileUrl}`,
        );

        // Extract the file name from the URL
        const fileName = path.basename(fileUrl);
        const filePath = path.join(
          __dirname,
          "..",
          "..",
          "..",
          "downloads",
          fileName,
        );
        await fs.writeFile(filePath, response.data);

        console.log("File successfully downloaded:", filePath);
        success = true;
      } catch (error) {
        console.error(
          `Attempt ${attempt} failed to download ${fileUrl}:`,
          error,
        );
        if (attempt >= maxRetries) {
          console.error(
            `Failed to download ${fileUrl} after ${maxRetries} attempts.`,
          );
        }
      }
    }
  }
}
