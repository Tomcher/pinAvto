var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import axios from 'axios';
import * as path from 'path';
import puppeteer from 'puppeteer';
import * as fs from "fs";
import { dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
export function scrapeWithPuppeteer() {
    return __awaiter(this, void 0, void 0, function* () {
        // Launch a browser
        const browser = yield puppeteer.launch();
        const page = yield browser.newPage();
        // Log in using the form fields on the page
        yield page.goto('https://b2b.pin-avto.ru/?page=11');
        yield page.type('input[name="login"]', 'info@prodavec-zapchastei.ru');
        yield page.type('input[name="password"]', '12345');
        yield page.click('input[type="submit"]');
        // Wait for navigation after login
        yield page.waitForNavigation();
        // Go to the page containing the links
        yield page.goto('https://b2b.pin-avto.ru/?page=60');
        // Get all the download links
        const links = yield page.$$eval('a', (anchors) => {
            return anchors
                .filter(anchor => anchor.href.includes('.xml'))
                .map(anchor => anchor.href);
        });
        // Filter to get only the selected files from the first attached image
        const selectedFiles = links.filter(link => link.includes('OtherTyresVIP.xml') ||
            link.includes('SummerTyresVIP.xml') ||
            link.includes('TyresVIP.xml') ||
            link.includes('WinterSNGTyresVIP.xml') ||
            link.includes('WinterTyresVIP.xml'));
        console.log('Found selected download links:', selectedFiles);
        // Download each selected file
        for (const fileUrl of selectedFiles) {
            try {
                console.log(`Downloading file: ${fileUrl}`);
                const response = yield axios.get(fileUrl, { responseType: 'stream' });
                // Extract the file name from the URL
                const fileName = path.basename(fileUrl);
                const filePath = path.join(__dirname, "..", "downloads", fileName);
                // Save the file locally
                const writer = fs.createWriteStream(filePath);
                response.data.pipe(writer);
                writer.on('finish', () => {
                    console.log('File successfully downloaded:', filePath);
                });
                writer.on('error', (err) => {
                    console.error('Error while writing file:', err);
                });
            }
            catch (error) {
                console.error(`Failed to download ${fileUrl}:`, error);
            }
        }
        // Close the browser
        yield browser.close();
    });
}
