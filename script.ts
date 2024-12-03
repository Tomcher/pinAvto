import * as fs from 'fs';
import { parseStringPromise, Builder } from 'xml2js';

async function combineXMLFiles() {
    try {
        // Read the XML files
        const file1 = fs.readFileSync('./example/file1.xml', 'utf8');
        const file2 = fs.readFileSync('./example/file2.xml', 'utf8');
        const file3 = fs.readFileSync('./example/file3.xml', 'utf8');

        // Parse XML files into JavaScript objects
        const data1 = await parseStringPromise(file1);
        const data2 = await parseStringPromise(file2);
        const data3 = await parseStringPromise(file3);

        // Extract tyre values
        const tyres = [
            data1.OtherTyresVIP.tyre[0],
            data2.SummerTyresVIP.tyre[0],
            data3.WinterSNGTyresVIP.tyre[0]
        ];

        // Combine the data into the desired format
        const combinedData = {
            Ad: {
                tyre: tyres
            }
        };

        // Convert the combined data back to XML
        const builder = new Builder({ headless: true });
        const combinedXML = builder.buildObject(combinedData);

        // Write the combined XML to a new file
        fs.writeFileSync('combined.xml', combinedXML, 'utf8');

        console.log('Combined XML has been created as combined.xml');
    } catch (error) {
        console.error('Error combining XML files:', error);
    }
}

combineXMLFiles();
