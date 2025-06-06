import fs from "node:fs/promises";
import * as path from "node:path";
import { parseStringPromise, Builder } from "xml2js";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { Search } from "../textSearch/search.js";
import { transliterate as tr } from "transliteration";

import dotenv from "dotenv";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
interface Tire {
  product_id: string[];
  brand: string[];
  model: string[];
  size: string[];
  artikul: string[];
  season: string[];
  thorn: string[];
  width: string[];
  height: string[];
  diameter: string[];
  price: string[];
  sklad1?: string[];
  sklad2?: string[];
  sklad3?: string[];
  sklad5?: string[];
}

interface Ad {
  Id: string;
  Address: string;
  Category: string;
  Description: string;
  GoodsType: string;
  AdType: string;
  ProductType: string;
  Brand: string;
  Model: string;
  TireSectionWidth: string;
  RimDiameter: string;
  TireAspectRatio: string;
  TireType: string;
  Quantity: string;
  Condition: string;
  Images: {
    Image: {
      $: {
        url: string;
      };
    }[];
  };
  Price: number;
}

interface Ads {
  Ads: {
    $: {
      formatVersion: string;
      target: string;
    };
    Ad: Ad[];
  };
}

/**
 * Checks if a file is available at the given URL without downloading it completely.
 * @param url - The URL of the file to check.
 * @returns A promise that resolves to true if the file exists (status 200), otherwise false.
 */
export async function isFileAvailable(
  urls: string[],
  exts: string[] = ["jpeg", "png"]
): Promise<boolean | string> {
  for (const url of urls) {
    for (const ext of exts) {
      try {
        const tryUrl = `${url}.${ext}`;
        const response = await fetch(tryUrl, {
          method: "GET",
          headers: { Range: "bytes=0-0" },
        });
        const found = response.status === 200 || response.status === 206;
        if (found) {
          console.log("found image: ", tryUrl);
          return tryUrl;
        }
      } catch (error) {
        console.error("Error checking file availability:", error);
      }
    }
  }
  return false;
}

async function getImageUrls(productId: string): Promise<string[]> {
  const primaryImage = `https://b2b.pin-avto.ru/public/photos/format/${productId}`;
  const transliteratedImage = `https://b2b.pin-avto.ru/public/photos/format/${tr(productId)}`;
  const fallbackImage = `${process.env.SITE_URL}/tires_mockup.jpg`;
  const staticImage = `https://i.ibb.co/h9czXsS/Whats-App-Image-2024-12-25-at-17-04-32-d7247638.jpg`;

  const imageUrls: string[] = [];
  const imageFound = await isFileAvailable([primaryImage, transliteratedImage]);

  if (imageFound && typeof imageFound === "string") {
    imageUrls.push(imageFound);
  } else {
    imageUrls.push(fallbackImage);
  }

  imageUrls.push(staticImage);
  return imageUrls;
}

const cleanUpAspectRatio = (aspectRatio: string): string => {
  if (aspectRatio.indexOf("x") > -1) {
    return aspectRatio.split("x")[1];
  }
  if (aspectRatio.indexOf("х") > -1) {
    return aspectRatio.split("х")[1];
  }
  return aspectRatio;
};

function calculatePrice(price: string): number {
  const cleanedPrice = price.replace(/\s+/g, "");
  const numericPrice = parseFloat(cleanedPrice);
  if (isNaN(numericPrice)) {
    console.warn("Invalid price input, defaulting to 0");
    return 0;
  }
  const ranges: [[number, number], number][] = [
    [[0, 3000], 500],
    [[3001, 5000], 600],
    [[5001, 8000], 750],
    [[8001, 12000], 1000],
  ];
  for (const range of ranges) {
    const [limits, markup] = range;
    if (numericPrice >= limits[0] && numericPrice <= limits[1]) {
      return numericPrice + markup;
    }
  }
  return numericPrice + 1250;
}

export async function compileTiresToFile(
  inputFiles: string[],
  outputFile: string
) {
  try {
    let allTires: Tire[] = [];

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
      const parsedData = await parseStringPromise(xmlContent);

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

    const seenIds = new Set<string>(); // To store unique product IDs
    const filtered = allTires.filter((tire: Tire) => {
      if (seenIds.has(tire.product_id[0])) {
        return false; // Remove the duplicate by skipping it
      }
      seenIds.add(tire.product_id[0]); // Add the ID to the set
      return true; // Keep the unique Ad
    });
    const search = new Search();
    await search.init();

    const adItems: Ad[] = [];
    for (const tire of filtered) {
      const { make, model, resolution } = await search.searchModel({
        make: tire.brand[0],
        model: tire.model[0],
      });

      if (["skip", "fail"].includes(resolution)) {
        console.log("Skipping tire with no model:", tire.product_id[0]);
        continue;
      }

      const sklad1Qty = parseInt(tire.sklad1?.[0] || "0", 10);
      const sklad2Qty = parseInt(tire.sklad2?.[0] || "0", 10);
      const sklad3Qty = parseInt(tire.sklad3?.[0] || "0", 10);
      const sklad5Qty = parseInt(tire.sklad5?.[0] || "0", 10);

      // Sum of Краснодар Sklads
      const krasnodarSum = sklad1Qty + sklad2Qty + sklad3Qty;

      // Check if there are stocks in Краснодар sklads
      const hasKrasnodarStock = krasnodarSum > 0;

      // Check if there are stocks in Sтаврополь
      const hasStavropolStock = sklad5Qty > 0;

      // Build additional description based on stocks
      let stockDescription = "";
      const stockLines: string[] = [];

      if (hasKrasnodarStock) {
        stockLines.push(
          `Краснодар: на складах ${krasnodarSum} шт. Доставка 2-3 дня.`
        );
      }

      if (hasStavropolStock) {
        stockLines.push(`Ставрополь: в наличии ${sklad5Qty} шт.`);
      }

      if (stockLines.length > 0) {
        stockDescription = `\nНаличие на складах:\n` + stockLines.join("\n");
      }

      // Optionally, skip the tire if there's no stock in either location
      if (!hasKrasnodarStock && !hasStavropolStock) {
        console.log("Skipping tire with no stock:", tire.product_id[0]);
        continue;
      }

      adItems.push({
        Id: tire.product_id[0],
        Address: "Ставропольский край, Ставрополь, Шпаковская ул., 115",
        Category: "Запчасти и аксессуары",
        Description: `⭐ ⭐ ⭐ ⭐ ⭐ \n Шины ${tire.season[0]} ${tire.thorn[0]} ${tire.brand[0]} ${tire.size[0]} ${model} \n Арт. ${tire.artikul[0]} \n ${stockDescription} \n ⭐️ ⭐️ ⭐️ ⭐️ ⭐️ 

✅ Самая низкая цена в Ставропольском крае!

✅ Большой выбор шин в Ставрополе в наличии.

✅ Склад в Ставрополе и 2 склада в Краснодаре.

✅ Доставка по Ставрополю бесплатная. Отправка в регионы ТК и автобусом (при возможности).

✅ Можно оформить в кредит на 3-6 месяцев.

✅ Цена указана при оплате за наличку или переводом на карту. Цена указана за 1шт., при покупке от 4шт.

✅ Остались вопросы? - пишите нам в личных сообщениях, менеджер оперативно поможет вам с выбором.

✅ Не забудьте добавить объявление в «избранное»`,
        GoodsType: "Шины, диски и колёса",
        AdType: "Товар от производителя",
        ProductType: "Легковые шины",
        Brand: make,
        Model: model,
        TireSectionWidth: tire.width[0],
        RimDiameter: tire.diameter[0].match(/\d+/g)?.join("") || "",
        TireAspectRatio: cleanUpAspectRatio(tire.height[0]),
        TireType: (() => {
          switch (tire.season[0]) {
            case "Зимняя":
              return tire.thorn[0] === "Шипованная"
                ? "Зимние шипованные"
                : "Зимние нешипованные";
            case "Летняя":
              return "Летние";
            case "Всесезонная":
              return "Всесезонные";
            default:
              return tire.season[0];
          }
        })(),
        Quantity: "за 1 шт.",
        Condition: "Новое",
        Images: {
          Image: (await getImageUrls(tire.product_id[0])).map((p) => ({
            $: {
              url: p,
            },
          })),
        },
        Price: calculatePrice(tire.price[0]),
      });
    }

    const ads: Ads = {
      Ads: {
        $: { formatVersion: "3", target: "Avito.ru" },
        Ad: adItems,
      },
    };

    // Convert the JavaScript object back to XML
    const builder = new Builder({ cdata: true });
    const xml = builder.buildObject(ads);
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
