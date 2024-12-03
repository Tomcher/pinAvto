var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import * as fs from 'fs';
import { parseStringPromise, Builder } from 'xml2js';
function combineXMLFiles() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            // Read the XML files
            const file1 = fs.readFileSync('./example/file1.xml', 'utf8');
            const file2 = fs.readFileSync('./example/file2.xml', 'utf8');
            const file3 = fs.readFileSync('./example/file3.xml', 'utf8');
            // Parse XML files into JavaScript objects
            const data1 = yield parseStringPromise(file1);
            const data2 = yield parseStringPromise(file2);
            const data3 = yield parseStringPromise(file3);
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
        }
        catch (error) {
            console.error('Error combining XML files:', error);
        }
    });
}
combineXMLFiles();
