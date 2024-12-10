import * as path from 'path';
import express from 'express';
import { dirname } from "path";
import { fileURLToPath } from "url";
import cron from 'node-cron';

import { compileTiresToFile } from "./features/compileTiresToFile/compileTiresToFile.js";
import { scrapeWithPuppeteer } from "./features/scrapeWithPuppeteer/scrapeWithPuppeteer.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const links = [
  "OtherTyresVIP.xml",
  "SummerTyresVIP.xml",
  "TyresVIP.xml",
  "WinterSNGTyresVIP.xml",
  "WinterTyresVIP.xml",
];

async function scrapeAndCompile() {
  await scrapeWithPuppeteer(links);
  await compileTiresToFile(links, "CompiledTires.xml");
}

cron.schedule('*/30 * * * *', async () => {
  console.log('running a task every 30 minutes');
  await scrapeAndCompile();
});

scrapeAndCompile().then( () => console.log("initial load on start"))

const app = express();
app.use(express.static(path.join(__dirname, "..", 'public')));

app.listen(3000, () => {
  console.log('Server started on port 3000');
});