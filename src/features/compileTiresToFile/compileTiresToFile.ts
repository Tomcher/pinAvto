import fs from "node:fs/promises";
import * as path from "node:path";
import { parseStringPromise, Builder } from "xml2js";
import { dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Define the function to compile <tyre> elements from multiple XML files into one
export async function compileTiresToFile(
  inputFiles: string[],
  outputFile: string
) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let allTires: any[] = [];

    // Loop through each input file and read its content
    for (const fileName of inputFiles) {
      const filePath = path.join(
        __dirname,
        "..",
        "..",
        "..",
        "downloads",
        fileName
      );
      const xmlContent = await fs.readFile(filePath, "utf-8");
      // Parse XML content into JavaScript object
      const parsedData = await parseStringPromise(xmlContent);

      // Extract <tyre> elements, adjusting for the root element of each file
      if (parsedData.OtherTyresVIP) {
        allTires = allTires.concat(parsedData.OtherTyresVIP.tyre || []);
      } else if (parsedData.SummerTyresVIP) {
        allTires = allTires.concat(parsedData.SummerTyresVIP.tyre || []);
      } else if (parsedData.TyresVIP) {
        allTires = allTires.concat(parsedData.TyresVIP.tyre || []);
      } else if (parsedData.WinterSNGTyresVIP) {
        allTires = allTires.concat(parsedData.WinterSNGTyresVIP.tyre || []);
      } else if (parsedData.WinterTyresVIP) {
        allTires = allTires.concat(parsedData.WinterTyresVIP.tyre || []);
      }
    }

    // Add UUID to each tire
    allTires = allTires.map((tire) => ({ ...tire }));

    // Create the new XML structure based on the Sample template
    const ads = {
      Ads: {
        $: { formatVersion: "3", target: "Avito.ru" },
        Ad: allTires.map((tire) => ({
          Id: tire.product_id,
          Address: "Ставропольский край, Ставрополь, Шпаковская ул., 115",
          Category: "Запчасти и аксессуары",
          Description: `⭐️ ⭐️ ⭐️ ⭐️ ⭐️\nАвтошина ${tire.brand[0]} ${tire.size[0]} ${tire.model[0]} Арт. ${tire.artikul[0]} купить в Ставрополе ${tire.season[0]} ${tire.thorn[0]}, по низким ценам с бесплатной доставкой.\n\n✅ Самая низкая цена в Ставропольском крае!\n\n✅ Большой выбор шин в Ставрополе в наличии.\n\n✅ Большой склад в Ставрополе и 2 склада в Краснодаре.\n\n✅ Доставка по Ставрополю бесплатная. Отправка в регионы ТК и автобусом (при возможности).\n\n✅ Можно оформить в кредит на 3-6 месяцев.\n\n✅ Цена указана при оплате за наличку или переводом на карту. Цена указана за 1шт. при покупке от 4шт.\n\n✅ Остались вопросы? - Пишите нам в личных сообщениях, наши специалисты обязательно помогут вам с выбором.\n\n✅ Не забудьте добавить объявление в «избранное»`,
          GoodsType: "Шины, диски и колёса",
          AdType: "Товар от производителя",
          ProductType: "Легковые шины",
          Brand: tire.brand[0],
          Model: tire.model[0].replace(/CF-(\d+)/, 'CF$1'),
          TireSectionWidth: tire.width[0],
          RimDiameter: tire.diameter[0].match(/\d+/g)?.join("") || "",
          TireAspectRatio: tire.height[0],
          TireType: tire.season[0] === "Всесезонная" ? "Всесезонные" : tire.season[0],
          Quantity: "за 1 шт.",
          Condition: "Новое",
          Images: {
            Image: {
              $: { url: `https://b2b.pin-avto.ru/public/photos/format/${tire.product_id}.jpeg` },
            },
          },
        })),
      },
    };

    // Convert the JavaScript object back to XML
    const builder = new Builder();
    const xml = builder.buildObject(ads);

    // Write the output XML to the specified file

    const outPath = path.join(
      __dirname,
      "..",
      "..",
      "..",
      "public",
      outputFile
    );
    await fs.writeFile(outPath, xml, "utf-8");

    console.log("XML file successfully generated:", outputFile);
  } catch (error) {
    console.error("An error occurred while compiling XML files:", error);
  }
}

// compileTiresToFile(inputFiles, outputFile);
