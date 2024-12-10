import { compileTiresToFile } from "./features/compileTiresToFile/compileTiresToFile.js";
import { scrapeWithPuppeteer } from "./features/scrapeWithPuppeteer/scrapeWithPuppeteer.js";


const inputFiles = [
    './downloads/OtherTyresVIP.xml',
    './downloads/SummerTyresVIP.xml',
    './downloads/TyresVIP.xml',
    './downloads/WinterSNGTyresVIP.xml',
    './downloads/WinterTyresVIP.xml'
];
const outputFile = 'CompiledTires.xml';

async function scrapeAndCompile() {
    await scrapeWithPuppeteer();
    await compileTiresToFile(inputFiles, outputFile)
}

scrapeAndCompile();

