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
    };
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

// Define the function to compile <tyre> elements from multiple XML files into one
export async function compileTiresToFile(
  inputFiles: string[],
  outputFile: string
) {
  try {
    let allTires: Tire[] = [];

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

    // Create the new XML structure based on the Sample template
    // Create the new XML structure based on the Sample template
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
