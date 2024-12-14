import fs from "node:fs/promises";
import * as path from "node:path";
import { parseStringPromise, Builder } from "xml2js";
import { dirname } from "path";
import { fileURLToPath } from "url";
import flexsearch from "flexsearch";
import { Ollama } from "ollama";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const ollama = new Ollama({ host: "https://ollama.empireshq.com" });

const SKUSchema = z.object({
  name: z.string().or(z.null()).describe("Found tire model "),
  score: z.number()
});

const makeIndex = new flexsearch.Index({
  tokenize: "full",
  charset: "advanced",
  context: true,
  resolution: 9,
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

interface ParsedModels {
  Shiny: {
    make: ModelMake[];
  };
}

type ModelMake = {
  $: {
    name: string;
  };
  model: {
    $: {
      name: string;
    };
  }[];
};

interface Ads {
  Ads: {
    $: {
      formatVersion: string;
      target: string;
    };
    Ad: Ad[];
  };
}

const askAI = async (search: string, list: string[]) => {
  const jsonSchema = zodToJsonSchema(SKUSchema);
  // console.log('schema: ', JSON.stringify(jsonSchema))
  const msg = `
Do not write any code.
Do not match characteristics.
Search for "${search}" in the list and return similarity score and name for the closest match.
If no match was found or the similarity score is less than 0.9 return {name: null, score: -1}
Do not return the search term itself, return only the matched item from the list
list:
${list.join("\n")}
If not found return {name: null, score: -1}
If search term is found return an entry from the list found item in JSON format
`;
  // console.log('asking: ', msg)
  const response = await ollama.chat({
    model: "codellama:7b-instruct",
    messages: [
      {
        role: "user",
        content: msg,
      },
    ],
    format: jsonSchema,
    options: {
      temperature: 0, // Make responses more deterministic
    },
  });
  return SKUSchema.parse(JSON.parse(response.message.content));
};

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

    const makesXmlContent = await fs.readFile(
      path.join(__dirname, "..", "..", "..", "settings", "makes.xml"),
      "utf-8"
    );
    const modelsXmlContent = await fs.readFile(
      path.join(__dirname, "..", "..", "..", "settings", "models.xml"),
      "utf-8"
    );
    const parsedMakes: { BrandValues: { Brand: string[] } } =
      await parseStringPromise(makesXmlContent);

    const parsedModels: ParsedModels =
      await parseStringPromise(modelsXmlContent);

    const modelIndicies = parsedModels.Shiny.make.reduce<{
      [key in string]: { ix: flexsearch.Index; store: string[]; make: string };
    }>((sum, n) => {
      const ix = new flexsearch.Index({
        tokenize: "full",
        charset: "extra",
        resolution: 9,
      });
      sum[n.$.name] = {
        store: [],
        ix,
        make: n.$.name,
      };
      n.model.forEach((m, i) => {
        const name = m.$.name;
        ix.add(i, name);
        sum[n.$.name].store.push(name);
      });
      return sum;
    }, {});

    const makes = parsedMakes.BrandValues.Brand.map((it: string) => it.trim());
    makes.forEach((make, i) => {
      makeIndex.add(i, make);
    });

    // Add UUID to each tire
    allTires = allTires.map((tire) => ({ ...tire }));

    const searchMake = (make: string) => {
      let found = makeIndex.search(make);
      if (!found || !found.length) {
        const split = make.split(" ");
        if (split.length > 0) {
          for (const chunk of split) {
            found = makeIndex.search(chunk);
            if (found && found.length) {
              return makes[found[0] as number];
            }
          }
        }
        return make;
      } else {
        return makes[found[0] as number];
      }
    };

    const searchModel = async (make: string, model: string) => {
      const foundIx = modelIndicies[make];
      if (foundIx) {
        const { ix, store } = foundIx;
        const simpleSearch = store.find((s) => s === model);
        if (simpleSearch) {
          console.log("simple: ", model);
          return simpleSearch;
        }
        const found = ix.search(model);
        if (found && found.length) {
          console.log("found: ", store[found[0] as number], " : ", model);
          return store[found[0] as number];
        }
        const split = model.split(" ");
        if (split.length > 0) {
          console.log("  partial search: ", model);
          let cursor = 0;
          while (cursor < split.length - 2) {
            const part = split.slice((cursor += 1));
            console.log("  seaching for :", part.join(" "));
            const fp = ix.search(part.join(" "));
            if (fp && fp.length) {
              console.log(
                "  partial found: ",
                store[fp[0] as number],
                " : ",
                model
              );
              return store[fp[0] as number];
            }
          }
        }
        console.log("+++search with AI");
        const resp = await askAI(model, store);
        if (resp.name) {
          console.log("AI FOUND!!!: ", resp, " : ", model, store, make);
          // if (resp.distance )
          return resp.name
        } else {
          console.log("AI NOT FOUND: ", resp, model, store)
        }
        
      }

      console.log("not found: ", model, " : ", make);
      return model;
    };
    const seenIds = new Set<string>(); // To store unique product IDs
    const filtered = allTires.filter((tire: Tire) => {
      if (seenIds.has(tire.product_id[0])) {
        return false; // Remove the duplicate by skipping it
      }
      seenIds.add(tire.product_id[0]); // Add the ID to the set
      return true; // Keep the unique Ad
    });

    const adsContent: Ad[] = [];
    for (const tire of filtered) {
      // const model =
      //   tire.brand[0] === "Tigar" && tire.model[0] === "HP"
      //     ? "High Performance"
      //     : tire.model[0].replace(/CF-(\d+)/, "CF$1");
      let brandName;
      switch (tire.brand[0].toLowerCase()) {
        case "belshina":
          brandName = "Белшина"
          break;
        default:
          brandName = tire.brand[0]
      }
      let brand = searchMake(brandName);
      if (tire.model[0].toLowerCase().indexOf("viatti") > -1) {
        brand = searchMake("Viatti")
      }
      const model = await searchModel(brand, tire.model[0]);
      adsContent.push({
        Id: tire.product_id[0],
        Address: "Ставропольский край, Ставрополь, Шпаковская ул., 115",
        Category: "Запчасти и аксессуары",
        Description: `⭐ ⭐ ⭐ ⭐ ⭐ \nЛучшая ${tire.brand[0]} ${tire.size[0]} ${model} Арт. ${tire.artikul[0]} купить в Ставрополе ${tire.season[0]} ${tire.thorn[0]}`,
        GoodsType: "Шины, диски и колёса",
        AdType: "Товар от производителя",
        ProductType: "Легковые шины",
        Brand: brand,
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
      });
    }

    // Create the new XML structure based on the Sample template
    // Create the new XML structure based on the Sample template
    const ads: Ads = {
      Ads: {
        $: { formatVersion: "3", target: "Avito.ru" },
        Ad: adsContent,
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
