import fs from "node:fs/promises";
import * as path from "node:path";
import { parseStringPromise, Builder } from "xml2js";
import { dirname } from "path";
import { fileURLToPath } from "url";
import { Search } from "../textSearch/search.js";
import { transliterate as tr } from "transliteration";

import dotenv from 'dotenv';

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
      }
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
export async function isFileAvailable(urls: string[], exts: string[] = ["jpeg", "png"]): Promise<boolean | string> {
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
  const transliteratedImage = `https://b2b.pin-avto.ru/public/photos/format/${tr(productId)}`
  const fallbackImage = `${process.env.DEPLOY_URL}/tires_mockup.jpg`;
  const staticImage = `${process.env.DEPLOY_URL}/Shop.jpg`;

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
  return aspectRatio
}


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
      const {make, model, resolution} = await search.searchModel({make: tire.brand[0], model: tire.model[0]});

      if (["skip", "fail"].includes(resolution)){
        console.log("Skipping tire with no model:", tire.product_id[0]);
        continue
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
      if (hasKrasnodarStock) {
        stockDescription += `Доступно на складах Краснодар Склад 1, Краснодар Склад 2, Краснодар Склад 3 (Всего: ${krasnodarSum} шт.). `;
      }
      if (hasStavropolStock) {
        stockDescription += `Также доступно на складе г.Ставрополь, пр. Кулакова 18 (${sklad5Qty} шт.).`;
      }

      // Only include stockDescription if there's relevant stock
      if (stockDescription) {
        stockDescription = `\n${stockDescription}`;
      }

      if (!hasKrasnodarStock && !hasStavropolStock) {
        console.log("Skipping tire with no stock:", tire.product_id[0]);
        continue;
      }

      adItems.push({
        Id: tire.product_id[0],
        Address: "Ставропольский край, Ставрополь, Шпаковская ул., 115",
        Category: "Запчасти и аксессуары",
        Description: `⭐ ⭐ ⭐ ⭐ ⭐ \nЛучшая ${tire.brand[0]} ${tire.size[0]} ${model} Арт. ${tire.artikul[0]} купить в Ставрополе ${tire.season[0]} ${tire.thorn[0]}${stockDescription}`,
        GoodsType: "Шины, диски и колёса",
        AdType: "Товар от производителя",
        ProductType: "Легковые шины",
        Brand: make,
        Model: model,
        TireSectionWidth: tire.width[0],
        RimDiameter: tire.diameter[0].match(/\d+/g)?.join("") || "",
        TireAspectRatio: cleanUpAspectRatio(tire.height[0]),
        TireType: (() => {
          if (tire.thorn[0] === "Шипованная") {
            return "Зимние шипованные";
          } else if (tire.thorn[0] === "Нешипованная") {
            return "Зимние нешипованные";
          } else {
            switch (tire.season[0]) {
              case "Всесезонная":
                return "Всесезонные";
              case "Летняя":
                return "Летние";
              default:
                return tire.season[0];
            }
          }
        })(),
        Quantity: "за 1 шт.",
        Condition: "Новое",
        Images: {
          Image: ( await getImageUrls(tire.product_id[0])).map((p) => ({
            $: {
              url: p,
            }
          }))
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
