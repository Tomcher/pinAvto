var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
import fs from 'fs';
import { parseStringPromise, Builder } from 'xml2js';
import { v4 as uuidv4 } from 'uuid';
// Define the function to compile <tyre> elements from multiple XML files into one
function compileTiresToFile(inputFiles, outputFile) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            let allTires = [];
            // Loop through each input file and read its content
            for (const filePath of inputFiles) {
                const xmlContent = fs.readFileSync(filePath, 'utf-8');
                // Parse XML content into JavaScript object
                const parsedData = yield parseStringPromise(xmlContent);
                // Extract <tyre> elements, adjusting for the root element of each file
                if (parsedData.OtherTyresVIP) {
                    allTires = allTires.concat(parsedData.OtherTyresVIP.tyre || []);
                }
                else if (parsedData.SummerTyresVIP) {
                    allTires = allTires.concat(parsedData.SummerTyresVIP.tyre || []);
                }
                else if (parsedData.TyresVIP) {
                    allTires = allTires.concat(parsedData.TyresVIP.tyre || []);
                }
                else if (parsedData.WinterSNGTyresVIP) {
                    allTires = allTires.concat(parsedData.WinterSNGTyresVIP.tyre || []);
                }
                else if (parsedData.WinterTyresVIP) {
                    allTires = allTires.concat(parsedData.WinterTyresVIP.tyre || []);
                }
            }
            // Add UUID to each tire
            allTires = allTires.map(tire => (Object.assign(Object.assign({}, tire), { uuid: uuidv4() })));
            // Create the new XML structure based on the Sample template
            const ads = {
                Ads: {
                    $: { formatVersion: "3", target: "Avito.ru" },
                    Ad: allTires.map(tire => {
                        var _a;
                        return ({
                            Id: tire.uuid,
                            Address: "Ставропольский край, Ставрополь, Шпаковская ул., 115",
                            Category: "Запчасти и аксессуары",
                            Description: `⭐️ ⭐️ ⭐️ ⭐️ ⭐️\nАвтошина ${tire.brand[0]} ${tire.size[0]} ${tire.model[0]} Арт. ${tire.artikul[0]} купить в Ставрополе ${tire.season[0]} ${tire.thorn[0]}, по низким ценам с бесплатной доставкой.\n\n✅ Самая низкая цена в Ставропольском крае!\n\n✅ Большой выбор шин в Ставрополе в наличии.\n\n✅ Большой склад в Ставрополе и 2 склада в Краснодаре.\n\n✅ Доставка по Ставрополю бесплатная. Отправка в регионы ТК и автобусом (при возможности).\n\n✅ Можно оформить в кредит на 3-6 месяцев.\n\n✅ Цена указана при оплате за наличку или переводом на карту. Цена указана за 1шт. при покупке от 4шт.\n\n✅ Остались вопросы? - Пишите нам в личных сообщениях, наши специалисты обязательно помогут вам с выбором.\n\n✅ Не забудьте добавить объявление в «избранное»`,
                            GoodsType: "Шины, диски и колёса",
                            AdType: "Товар от производителя",
                            ProductType: "Легковые шины",
                            Brand: tire.brand[0],
                            Model: tire.model[0],
                            TireSectionWidth: tire.width[0],
                            RimDiameter: ((_a = tire.diameter[0].match(/\d+/g)) === null || _a === void 0 ? void 0 : _a.join('')) || "",
                            TireAspectRatio: tire.height[0],
                            TireType: tire.season[0],
                            Quantity: "за 1 шт.",
                            Condition: "Новое",
                            Images: {
                                Image: {
                                    $: { url: tire.image[0] }
                                }
                            }
                        });
                    })
                }
            };
            // Convert the JavaScript object back to XML
            const builder = new Builder();
            const xml = builder.buildObject(ads);
            // Write the output XML to the specified file
            fs.writeFileSync(outputFile, xml, 'utf-8');
            console.log('XML file successfully generated:', outputFile);
        }
        catch (error) {
            console.error('An error occurred while compiling XML files:', error);
        }
    });
}
// Example usage
const inputFiles = [
    './public/OtherTyresVIP (2).xml',
    './public/SummerTyresVIP.xml',
    './public/TyresVIP.xml',
    './public/WinterSNGTyresVIP.xml',
    './public/WinterTyresVIP.xml'
];
const outputFile = 'CompiledTires.xml';
compileTiresToFile(inputFiles, outputFile);
