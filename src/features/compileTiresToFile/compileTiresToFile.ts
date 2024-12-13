import fs from "node:fs/promises";
import * as path from "node:path";
import { parseStringPromise, Builder } from "xml2js";
import { dirname } from "path";
import { fileURLToPath } from "url";
import flexsearch from "flexsearch";

const index = new flexsearch.Index({
  tokenize: "full",
  charset: "extra"
});

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
export async function isFileAvailable(url: string): Promise<boolean> {
  try {
    // Send a GET request with a Range header to request only the first byte
    const response = await fetch(url, {
      method: "GET",
      headers: { Range: "bytes=0-0" },
    });

    // If the response is within the range 200–299 or 206 (Partial Content), the file exists
    return response.status === 200 || response.status === 206;
  } catch (error) {
    console.error("Error checking file availability:", error);
    return false;
  }
}



async function getImageUrls(productId: string): Promise<string[]> {
  const primaryImage = `https://b2b.pin-avto.ru/public/photos/format/${productId}.jpeg`;
  const fallbackImage = "../../public/tires_mockup.jpg";
  const staticImage = "../../public/Shop.jpg";

  const imageUrls: string[] = [];

  if (await isFileAvailable(primaryImage)) {
    imageUrls.push(primaryImage);
  } else {
    imageUrls.push(fallbackImage);
  }

  imageUrls.push(staticImage);
  return imageUrls;
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

    const xmlContent = await fs.readFile(
      path.join(__dirname, "..", "..", "..", "public", "makes.xml"),
      "utf-8"
    );
    const parsedMakes: { BrandValues: { Brand: string[] } } =
      await parseStringPromise(xmlContent);
    let i = 0;
    for (const make of parsedMakes.BrandValues.Brand) {
      index.add((i += 1), make.trim());
    }
    // Add UUID to each tire
    allTires = allTires.map((tire) => ({ ...tire }));

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

    const ads: Ads = {
      Ads: {
        $: { formatVersion: "3", target: "Avito.ru" },
        Ad: (() => {
          const seenIds = new Set<string>(); // To store unique product IDs
          const filtered = allTires.filter((tire: Tire) => {
            if (seenIds.has(tire.product_id[0])) {
              return false; // Remove the duplicate by skipping it
            }
            seenIds.add(tire.product_id[0]); // Add the ID to the set
            return true; // Keep the unique Ad
          });
          return filtered.map(async (tire: Tire) => {
            const model =
              tire.brand[0] === "Tigar" && tire.model[0] === "HP"
                ? "High Performance"
                : tire.model[0].replace(/CF-(\d+)/, "CF$1");
            const make = await index.search(tire.brand[0])
            if (!make || !make.length) {
              console.log("not found:", make)
            }
            
            return {
              Id: tire.product_id[0],
              Address: "Ставропольский край, Ставрополь, Шпаковская ул., 115",
              Category: "Запчасти и аксессуары",
              Description: `⭐ ⭐ ⭐ ⭐ ⭐ \nЛучшая ${tire.brand[0]} ${tire.size[0]} ${model} Арт. ${tire.artikul[0]} купить в Ставрополе ${tire.season[0]} ${tire.thorn[0]}`,
              GoodsType: "Шины, диски и колёса",
              AdType: "Товар от производителя",
              ProductType: "Легковые шины",
              Brand: tire.brand[0],
              Model: model,
              TireSectionWidth: tire.width[0],
              RimDiameter: tire.diameter[0].match(/\d+/g)?.join("") || "",
              TireAspectRatio: tire.height[0],
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
                Image: {
                  $: {
                    url: `https://b2b.pin-avto.ru/public/photos/format/${tire.product_id}.jpeg`,
                  },
                },
              },
            };
          });
        })(),
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